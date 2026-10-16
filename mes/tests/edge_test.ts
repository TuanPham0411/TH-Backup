// Isolated Edge HTTP tests. All Supabase HTTP is intercepted; no live requests.
let handler: (request: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (fn: typeof handler) => { handler = fn; return {}; } });
Deno.env.set('SUPABASE_URL', 'https://mes-test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
let rpcInput: Record<string, unknown> | undefined;
let trustedEmail = 'eric.scorp93@gmail.com';
let deny = false;
let databaseCode = 'P0001';
let accountError: string | undefined;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname !== 'mes-test.supabase.co') throw new Error('Unexpected network request');
  if (url.pathname === '/auth/v1/user') return json({ id: 'google-owner-id', email: trustedEmail, email_confirmed_at: '2026-10-15', app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }, { provider: 'google' }], user_metadata: { full_name: 'Owner' } });
  if (url.pathname === '/rest/v1/rpc/mes_dispatch') {
    rpcInput = JSON.parse(String(init?.body));
    if (deny) return json({ message: 'private SQL detail and device secret', code: databaseCode }, 400);
    return json(accountError ? { errorCode: accountError } : { ok: true, rows: [] });
  }
  if (url.pathname.startsWith('/storage/v1/object/info/')) return json({ name: 'slot', size: 27, content_type: 'text/plain', metadata: { size: 999, mimetype: 'fake/browser-value' } });
  throw new Error(`Unexpected test endpoint: ${url.pathname}`);
};
await import('../supabase/functions/mes-api/index.ts');
function assert(value: unknown, label: string) { if (!value) throw new Error(label); }
const origin = 'https://mes.th.io.vn';
const oauthToken = 'header.' + btoa(JSON.stringify({amr:[{method:"oauth"}]})) + '.signature';
function request(name: string, data: unknown = {}, headers = {}) {
  return new Request('https://mes-test.supabase.co/functions/v1/mes-api', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ name, data, actor: { owner: true } }) });
}
Deno.test('MES Edge authorization and request routing', async (t) => {
  await t.step('exact CORS and preflight', async () => {
    assert((await handler(request('getDirectory', {}, { origin: 'https://evil.example' }))).status === 403, 'foreign origin allowed');
    const preflight = await handler(new Request('https://test', { method: 'OPTIONS', headers: { origin } }));
    const staging = await handler(new Request('https://test', { method: 'OPTIONS', headers: { origin: 'https://mes-th.netlify.app' } }));
    assert(staging.headers.get('access-control-allow-origin') === 'https://mes-th.netlify.app', 'MES Netlify origin denied');
    assert(preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === origin, 'CORS preflight failed');
  });
  await t.step('anonymous directory cannot forge actor', async () => {
    assert((await handler(request('getDirectory'))).status === 200, 'directory failed');
    assert(JSON.stringify(rpcInput?.actor) === '{}', 'client actor was trusted');
    assert((await handler(request('read', { path: 'issues' }))).status === 401, 'anonymous issue access');
  });
  await t.step('only verified Google owner token accepted', async () => {
    trustedEmail = 'other@gmail.com';
    assert((await handler(request('getSession', {}, { authorization: `Bearer ${oauthToken}` }))).status === 403, 'nonowner allowed');
    trustedEmail = 'eric.scorp93@gmail.com';
    assert((await handler(request('getSession', {}, { authorization: `Bearer ${oauthToken}` }))).status === 200, 'owner denied');
    assert((rpcInput?.actor as { owner: boolean }).owner, 'owner context missing');
    assert((rpcInput?.actor as { uid: string }).uid === 'mes-owner', 'Google and password owner must share reserved account');
    const passwordToken = 'header.' + btoa(JSON.stringify({amr:[{method:'password'}]})) + '.signature';
    assert((await handler(request('getSession', {}, { authorization: `Bearer ${passwordToken}` }))).status === 403, 'linked Google identity must not allow password login');
    await handler(request('getSession', {}, { authorization: `Bearer ${oauthToken}`, 'x-mes-tester':'true' }));
    assert((rpcInput?.actor as {tester:boolean}).tester === true, 'owner tester context missing');
  });
  await t.step('opaque operator session does not become owner', async () => {
    const session = 'a'.repeat(64);
    assert((await handler(request('read', { path: 'issues' }, { 'x-mes-session': session, 'x-mes-tester':'true' }))).status === 200, 'managed session failed');
    assert(JSON.stringify(rpcInput?.actor) === JSON.stringify({ session, tester: true }), 'managed identity must be resolved by database');
    assert((await handler(request('finishDelete', {}, { 'x-mes-session': session }))).status === 400, 'internal cleanup exposed');
  });
  await t.step('account login and activation are anonymous, with safe structured failures', async () => {
    for (const name of ['passwordLogin','activateAccount']) {
      const response = await handler(request(name, {username:'hpham',password:'test-password'}, {authorization:'Bearer stale-session','x-mes-tester':'true'}));
      assert(response.status === 200 && JSON.stringify(rpcInput?.actor) === '{}', 'public account operation trusted caller identity');
    }
    for (const [code,status] of [['invalid-credentials',401],['rate-limited',429],['password-policy',400]] as const) {
      accountError = code;
      const response = await handler(request('passwordLogin'));
      assert(response.status === status && (await response.json()).code === code, 'account failure incorrectly mapped');
    }
    accountError = undefined;
    assert((await handler(request('loginManagedUser'))).status === 401, 'legacy public login enabled');
  });
  await t.step('attachment metadata is read from Storage', async () => {
    const response = await handler(request('attachFiles', { issueId: 'issue', files: [{ slot: 'slot', name: 'evidence.txt', size: 1, type: 'image/png' }] }, { 'x-mes-session': 'a'.repeat(64) }));
    assert(response.status === 200, 'attachment finalization failed');
    const files = (rpcInput?.payload as { files: { size: number; type: string }[] }).files;
    assert(files[0].size === 27 && files[0].type === 'text/plain', 'untrusted file metadata accepted');
  });
  await t.step('formatted feedback is normalized on server before database writes', async () => {
    const richDocument={version:1,ops:[{insert:'Safe feedback',attributes:{bold:true,onclick:'bad',color:'url(javascript:bad)'}},{insert:'\n'}]};
    const response=await handler(request('createIssue',{description:'spoofed',richDocument},{authorization:`Bearer ${oauthToken}`}));
    assert(response.status===200,'rich feedback rejected');
    const payload=rpcInput?.payload as {description:string;richDocument:{ops:{attributes:Record<string,unknown>}[]}};
    assert(payload.description==='Safe feedback','plain text was not derived from rich content');
    assert(payload.richDocument.ops[0].attributes.bold===true && !('onclick' in payload.richDocument.ops[0].attributes),'unsafe rich attributes stored');
    const unsafe=await handler(request('createIssue',{richDocument:{version:1,ops:[{insert:{image:'https://evil.example'}}]}},{authorization:`Bearer ${oauthToken}`}));
    assert(unsafe.status===400,'external image URL accepted');
  });
  await t.step('database failures do not leak SQL or secrets', async () => {
    deny = true;
    const response = await handler(request('getSession', {}, { 'x-mes-session': 'a'.repeat(64) }));
    assert(response.status === 403 && !(await response.text()).includes('private SQL'), 'database error leaked');
    databaseCode = 'PGRST202';
    const configError = await handler(request('getSession', {}, { 'x-mes-session': 'a'.repeat(64) }));
    assert(configError.status === 503 && (await configError.json()).code === 'backend-not-ready', 'configuration error mislabeled as an identity denial');
    deny = false;
  });
});
