import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseKey } from './config.js';
let client;
let managed = sessionStorage.getItem('th-mes-session');
let listener;
const watchers = new Set();
let timer, loading = false;
async function refresh() {
  if (loading || !watchers.size || document.hidden) return;
  loading = true;
  const active = [...watchers];
  try {
    const result = await api("readBundle", { paths: active.map(w => ({ path: w.path, order: w.order })) });
    for (const w of active) if (watchers.has(w)) w.onData(result.snapshots[w.path].rows);
  } catch (error) { for (const w of active) if (watchers.has(w)) w.onError(error); }
  finally { loading = false; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
export function initializeBackend() {
  client = createClient(supabaseUrl, supabaseKey);
  client.auth.onAuthStateChange((_event, session) => {
    if (session) { managed = null; sessionStorage.removeItem('th-mes-session'); }
    // Do not await Supabase calls inside its auth callback.
    setTimeout(() => listener?.(session?.user || (managed ? { id: 'managed' } : null)), 0);
  });
}
export async function api(name, data = {}) {
  const publicRequest = ["getDirectory", "startWindowsChallenge", "completeWindowsChallenge", "loginManagedUser"].includes(name);
  const session = publicRequest ? null : (await client.auth.getSession()).data.session;
  const response = await fetch(`${supabaseUrl}/functions/v1/mes-api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseKey,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(!publicRequest && managed ? { 'X-MES-Session': managed } : {}) },
    body: JSON.stringify({ name, data }),
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Request failed'), { code: body.code || 'unavailable' });
  if (!['read','readBundle','getDirectory','getSession','listDevices','downloadUrl','uploadUrl'].includes(name))
    setTimeout(refresh, 0);
  return body;
}
export function watchAuth(callback) { listener = callback; }
export async function ownerLogin() {
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin, queryParams: { prompt: "select_account" } } });
  if (error) throw error;
}
export async function managedLogin(token) {
  await client.auth.signOut({ scope: 'local' });
  managed = token;
  sessionStorage.setItem('th-mes-session', token);
  await listener?.({ id: 'managed' });
}
export async function logout() {
  if (managed) { try { await api('logout'); } catch { /* Local logout must still clear the token. */ } }
  managed = null; sessionStorage.removeItem('th-mes-session');
  const { error } = await client.auth.signOut({ scope: 'local' });
  await listener?.(null);
  if (error) throw error;
}
export function watchRecords(path, onData, onError, order) {
  const watcher = { path, onData, onError, order };
  watchers.add(watcher);
  if (!timer) timer = setInterval(refresh, 15000);
  setTimeout(refresh, 0);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) { clearInterval(timer); timer = undefined; }
  };
}
export async function uploadAttachment(path, file, type) {
  const { url } = await api('uploadUrl', { path });
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: file });
  if (!response.ok) throw new Error('Attachment upload failed');
}
export async function downloadAttachment(path) {
  const { url } = await api('downloadUrl', { path });
  const response = await fetch(url);
  if (!response.ok) throw new Error('Attachment download failed');
  return response.blob();
}
