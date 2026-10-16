import { normalizeDocument, documentText } from '../_shared/rich-document.js';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { isGoogleOwner, validatedTokenMethods, validPath, publicAction } from './policy.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = service.storage.from('mes-attachments');
const origins = new Set((Deno.env.get('MES_ALLOWED_ORIGINS') || 'https://mes.th.io.vn,https://mes-th.netlify.app').split(',').map(v => v.trim()));
Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-mes-session, x-mes-tester, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ code: 'permission-denied', error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'POST required' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 32768) return reply({ error: 'Request too large' }, 413);
    const { name, data = {} } = JSON.parse(raw);
    if (typeof name !== 'string' || !data || typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'Invalid request' }, 400);
    if ((name === 'createIssue' || (name === 'updateIssue' && data.operation === 'edit')) && data.richDocument !== undefined) {
      try { data.richDocument = normalizeDocument(data.richDocument); data.description = documentText(data.richDocument); }
      catch { return reply({ code: 'invalid-argument', error: 'Invalid formatted feedback or inline image.' }, 400); }
    }
    if (name === 'finishDelete') return reply({ error: 'Unknown action' }, 400);
    const actor: Record<string, unknown> = {};
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const managed = request.headers.get('x-mes-session');
    if (token) {
      const { data: auth, error } = await service.auth.getUser(token);
      if (error || !auth.user) return reply({ code: 'unauthenticated', error: 'Session expired' }, 401);
      if (!isGoogleOwner(auth.user, validatedTokenMethods(token))) return reply({ code: 'owner-required', error: 'Only the registered Google owner can use this login' }, 403);
      actor.owner = true;
      if (request.headers.get('x-mes-tester') === 'true') actor.tester = true;
      actor.uid = auth.user.id; actor.name = auth.user.user_metadata?.full_name || 'MES Owner';
    } else if (managed && /^[a-f0-9]{64}$/.test(managed)) actor.session = managed;
    else if (!publicAction(name)) return reply({ code: 'unauthenticated', error: 'Sign in first' }, 401);
    async function dispatch(action: string, payload = data) {
      const { data: result, error } = await service.rpc('mes_dispatch', { action, payload, actor });
      if (error) {
        const code = error.code === 'P0001' ? 'permission-denied' : 'backend-not-ready';
        console.error('MES database request failed', { action, code: error.code });
        throw Object.assign(new Error('Database request failed'), { code });
      }
      return result;
    }
    if (name === 'uploadUrl' || name === 'downloadUrl') {
      if (!validPath(data.path)) return reply({ error: 'Invalid attachment path' }, 400);
      await dispatch(name);
      if (name === 'uploadUrl') {
        const { data: signed, error } = await bucket.createSignedUploadUrl(data.path, { upsert: false });
        if (error) throw error;
        return reply({ url: signed.signedUrl });
      }
      const { data: signed, error } = await bucket.createSignedUrl(data.path, 60, { download: true });
      if (error) throw error;
      return reply({ url: signed.signedUrl });
    }
    if (name === 'attachFiles') {
      // Authorize before accessing object metadata. Actual metadata, never browser values.
      if (!Array.isArray(data.files) || data.files.length > 5 || !/^[a-zA-Z0-9_-]+$/.test(data.issueId || '')) return reply({ error: 'Invalid files' }, 400);
      await dispatch('getSession');
      const files = [];
      for (const f of data.files) {
        const path = `issues/${data.issueId}/${f.slot}`;
        if (!validPath(path)) return reply({ error: 'Invalid upload slot' }, 400);
        const { data: info, error } = await bucket.info(path);
        if (error) throw error;
        files.push({ slot: f.slot, path, name: f.name, size: info.size ?? info.metadata?.size, type: info.contentType || info.metadata?.mimetype });
      }
      return reply(await dispatch(name, { ...data, files }));
    }
    if (name === 'deleteIssue') {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.id || '')) return reply({ error: 'Invalid issue' }, 400);
      await dispatch(name); // Owner-only tombstone; retry is safe if object cleanup fails.
      const { data: items, error } = await bucket.list(`issues/${data.id}`, { limit: 100 });
      if (error) throw error;
      if (items?.length) {
        const { error } = await bucket.remove(items.map(f => `issues/${data.id}/${f.name}`));
        if (error) throw error;
      }
      return reply(await dispatch('finishDelete'));
    }
    const result = await dispatch(name);
    if (name === 'registerDevice') result.allowedOrigins = [...origins];
    return reply(result);
  } catch (error) {
    const e = error as { code?: string; message?: string };
    // Do not send SQL details, tokens, device secrets or platform internals to callers.
    const expected = e.code === 'permission-denied';
    return reply({ code: expected ? 'permission-denied' : e.code === 'backend-not-ready' ? 'backend-not-ready' : 'unavailable', error: expected ? 'Action denied. Check identity, active catalogs, field limits and verification expiry.' : 'MES service could not complete the request.' }, expected ? 403 : 503);
  }
});
