import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createApp} from '../index.js';
import {actorFor,validPath,hash} from '../security.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('TEST_DATABASE_URL must point at a disposable database ending in _test');
const pool=new pg.Pool({connectionString:url,max:4});
let server,base,files,runtimePool;
before(async()=>{
 await pool.query("do $$ begin if not exists(select 1 from pg_roles where rolname='th_api') then create role th_api; end if; end $$;");
 const result=spawnSync(process.execPath,['server/migrate.js'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const twice=spawnSync(process.execPath,['server/migrate.js'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});assert.equal(twice.status,0,twice.stderr);
 files=await mkdtemp(join(tmpdir(),'th-api-'));runtimePool=new pg.Pool({connectionString:url,options:'-c role=th_api'});server=createApp(runtimePool,files).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await runtimePool.end();await pool.end();await rm(files,{recursive:true,force:true});});
async function api(name,data={},cookie='',host='mes.th.io.vn',extra={}) {
 const response=await fetch(base+(host==='th.io.vn'?'/api/portfolio':'/api/mes'),{method:'POST',headers:{'x-forwarded-host':host,'Content-Type':'application/json',cookie,...extra},body:JSON.stringify(host==='th.io.vn'?{action:name,data}:{name,data})});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
 return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
test('public clients cannot inject owner claims or traverse files',async()=>{
 assert.deepEqual(actorFor(null,'true'),{tester:true});
 assert.equal(validPath('issues/../secret'),false);
 assert.equal((await api('getDirectory')).status,200);
 assert.equal((await api('manageUser',{owner:true,operation:'create',username:'attacker',displayName:'Attack'})).status,401);
 assert.equal((await api('getDirectory',{},'','mes.th.io.vn',{origin:'https://evil.test'})).status,403);
 const result=await api('getDirectory');assert.deepEqual(result.body.users,[]);
});
test('MES activation, CRUD, private files, tester restrictions, revocation',async()=>{
 const {rows:[activation]}=await pool.query('select public.mes_issue_owner_activation() as result');
 const login=await api('activateAccount',{username:'hpham',activationCode:activation.result.activationCode,password:'test-owner-password'});
 assert.equal(login.status,200,JSON.stringify(login.body));assert.ok(login.cookie);assert.equal(login.body.sessionToken,undefined);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);
 const owner=login.cookie;
 assert.equal((await api('activateAccount',{username:'hpham',activationCode:activation.result.activationCode,password:'test-owner-password'})).status,401);
 const created=await api('manageUser',{operation:'create',username:'pi.user',displayName:'Pi User'},owner);assert.equal(created.status,200,JSON.stringify(created.body));
 const userLogin=await api('activateAccount',{username:'pi.user',activationCode:created.body.activationCode,password:'test-user-password'});assert.equal(userLogin.status,200);
 const user=userLogin.cookie;
 assert.equal((await api('manageUser',{operation:'create',username:'bad.user'},user)).status,403);
 const tl=await api('manageDirectory',{type:'teamLeaders',operation:'create',name:'Leader'},owner);
 const dept=await api('manageDirectory',{type:'departments',operation:'create',name:'Production'},owner);
 const issue=await api('createIssue',{subject:'Pi integration feedback',process:'Line 1',description:'A meaningful feedback description.',teamLeaderId:tl.body.id,departmentId:dept.body.id,reporterUid:created.body.uid},user);
 assert.equal(issue.status,200,JSON.stringify(issue.body));
 const path=`issues/${issue.body.id}/${issue.body.uploadSlots[0]}`;
 const grant=await api('uploadUrl',{path},user);assert.equal(grant.status,200);
 const put=await fetch(base+grant.body.url,{method:'PUT',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'text/plain'},body:'attachment payload'});assert.equal(put.status,200,await put.text());
 assert.equal((await fetch(base+grant.body.url,{method:'PUT',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'text/plain'},body:'overwrite'})).status,403);
 const attached=await api('attachFiles',{issueId:issue.body.id,files:[{slot:issue.body.uploadSlots[0],name:'sample.txt',size:99999,type:'image/png'}]},user);assert.equal(attached.status,200,JSON.stringify(attached.body));
 const bundle=await api('read',{path:'issues'},user);const record=bundle.body.rows.find(r=>r.id===issue.body.id);assert.equal(record.attachments[0].size,18);assert.equal(record.attachments[0].type,'text/plain');
 const download=await api('downloadUrl',{path},user);assert.equal(download.status,200);assert.equal(await (await fetch(base+download.body.url,{headers:{'x-forwarded-host':'mes.th.io.vn'}})).text(),'attachment payload');
 assert.equal((await api('uploadUrl',{path:'issues/../../etc/passwd'},user)).status,400);
 assert.equal((await api('deleteIssue',{id:issue.body.id},user)).status,403);
 assert.equal((await api('manageDirectory',{type:'departments',operation:'create',name:'Blocked'},owner,'mes.th.io.vn',{'x-mes-tester':'true'})).status,403);
 assert.equal((await api('manageUser',{operation:'deactivate',uid:created.body.uid,active:false},owner)).status,200);
 assert.equal((await api('getSession',{},user)).status,401);
 assert.equal((await api('deleteIssue',{id:issue.body.id},owner)).status,200);
 assert.equal((await pool.query('select 1 from public.files where path=$1',[path])).rowCount,0);
 assert.equal((await api('logout',{},owner)).status,200);
 assert.equal((await api('getSession',{},owner)).status,401);
});
test('portfolio server authorization, profile, bookmarks, inquiries and reset tokens',async()=>{
 const {rows:[u]}=await pool.query("insert into portfolio.users(email,password,name,verified) values('pi@example.test',extensions.crypt('test-user-password',extensions.gen_salt('bf',4)),'Pi User',true) returning *");
 const login=await api('login',{email:u.email,password:'test-user-password'},'','th.io.vn');assert.equal(login.status,200);assert.equal(login.body.user.isAdmin,false);const cookie=login.cookie;
 const query=(action,data)=>api(action,data,cookie,'th.io.vn');
 assert.equal((await query('set',{path:`users/${u.id}/bookmarks/esp32`,data:{projectId:'esp32'}})).status,200);
 assert.equal((await query('set',{path:'users/another/bookmarks/esp32',data:{}})).status,403);
 const inquiry=await query('add',{path:'inquiries',data:{name:'Pi',message:'Please discuss this software project.',topic:'Software / data',uid:'another',email:'forged@example.test',status:'Closed'}});assert.equal(inquiry.status,200);
 const list=await query('list',{path:'inquiries'});assert.equal(list.body.rows[0].data.uid,u.id);assert.equal(list.body.rows[0].data.status,'New');
 assert.equal((await query('set',{path:`inquiries/${inquiry.body.id}`,data:{status:'Closed'}})).status,403);
 assert.equal((await query('list',{path:'users/another/bookmarks'})).status,403);
 const resetToken='a'.repeat(64);await pool.query("insert into portfolio.tokens(hash,uid,purpose) values($1,$2,'reset')",[hash(resetToken),u.id]);
 assert.equal((await api('consumeToken',{purpose:'reset',token:resetToken,password:'new-test-password'},'','th.io.vn')).status,200);
 assert.equal((await query('session',{})).body.user,null);
 assert.equal((await api('consumeToken',{purpose:'reset',token:resetToken,password:'new-test-password'},'','th.io.vn')).status,403);
});
test('runtime role cannot read private MES credentials or bootstrap owner',async()=>{
 const connection=await pool.connect();
 try {await connection.query('set role th_api');
  await assert.rejects(connection.query('select * from mes_private.credentials'),e=>e.code==='42501');
  await assert.rejects(connection.query('select public.mes_issue_owner_activation()'),e=>e.code==='42501');
 }finally{await connection.query('reset role');connection.release();}
});
test('Google OAuth validates state and verified identity, sets local owner session',async()=>{
 process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-secret';
 const start=await fetch(base+'/api/oauth/start',{redirect:'manual',headers:{'x-forwarded-host':'mes.th.io.vn'}});
 assert.equal(start.status,302);const target=new URL(start.headers.get('location'));assert.equal(target.hostname,'accounts.google.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');
 const cookie=start.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const state=target.searchParams.get('state');
 const bad=await fetch(base+'/api/oauth/callback?state=wrong&code=test',{redirect:'manual',headers:{'x-forwarded-host':'mes.th.io.vn',cookie,'sec-fetch-site':'cross-site',origin:'https://accounts.google.com'}});assert.equal(bad.status,400);
 const originalFetch=globalThis.fetch;
 let identity={email:'intruder@example.test',email_verified:true};
 globalThis.fetch=async(input,init)=>{
  if(input==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-google-access'});
  if(input==='https://openidconnect.googleapis.com/v1/userinfo')return Response.json(identity);
  return originalFetch(input,init);
 };
 try {
  const callback=()=>fetch(base+`/api/oauth/callback?state=${state}&code=test`,{redirect:'manual',headers:{'x-forwarded-host':'mes.th.io.vn',cookie,'sec-fetch-site':'cross-site',origin:'https://accounts.google.com'}});
  assert.equal((await callback()).status,403);
  identity={email:'eric.scorp93@gmail.com',email_verified:false};assert.equal((await callback()).status,401);
  identity={email:'eric.scorp93@gmail.com',email_verified:true};const success=await callback();assert.equal(success.status,302);assert.match(success.headers.get('set-cookie'),/th_mes=.*HttpOnly/);
  assert.equal((await api('getSession',{},success.headers.getSetCookie().find(v=>v.startsWith('th_mes=')).split(';')[0])).body.isOwner,true);
  await pool.query("insert into portfolio.users(email,password,verified) values('eric.scorp93@gmail.com',extensions.crypt('attacker-password',extensions.gen_salt('bf',4)),false)");
  const attackerLogin=await api('login',{email:'eric.scorp93@gmail.com',password:'attacker-password'},'','th.io.vn');
  assert.equal(attackerLogin.status,200);
  const portfolioStart=await fetch(base+'/api/oauth/start',{redirect:'manual',headers:{'x-forwarded-host':'th.io.vn'}});
  const portfolioState=new URL(portfolioStart.headers.get('location')).searchParams.get('state');
  const portfolioCookies=portfolioStart.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const portfolioGoogle=await fetch(base+`/api/oauth/callback?state=${portfolioState}&code=test`,{redirect:'manual',headers:{'x-forwarded-host':'th.io.vn',cookie:portfolioCookies,'sec-fetch-site':'cross-site',origin:'https://accounts.google.com'}});
  assert.equal(portfolioGoogle.status,302);
  assert.equal((await api('session',{},attackerLogin.cookie,'th.io.vn')).body.user,null);
  assert.equal((await api('login',{email:'eric.scorp93@gmail.com',password:'attacker-password'},'','th.io.vn')).status,401);
  const ownerCookie=portfolioGoogle.headers.getSetCookie().find(v=>v.startsWith('th_portfolio=')).split(';')[0];
  assert.equal((await api('session',{},ownerCookie,'th.io.vn')).body.user.isAdmin,true);

 }finally{globalThis.fetch=originalFetch;delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;}
});
