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
test('administrator edits, reissues and deletes accounts; self profile cannot elevate access',async()=>{
 const owner=(await api('passwordLogin',{username:'hpham',password:'test-owner-password'})).cookie;
 assert.ok(owner);
 const created=await api('manageUser',{operation:'create',username:'admin.lifecycle',displayName:'Lifecycle'},owner);
 assert.equal(created.status,200,JSON.stringify(created.body)); const uid=created.body.uid;
 const reissued=await api('resetUserActivation',{uid},owner); assert.equal(reissued.status,200,JSON.stringify(reissued.body));
 assert.notEqual(reissued.body.activationCode,created.body.activationCode);
 assert.equal((await api('activateAccount',{username:'admin.lifecycle',activationCode:created.body.activationCode,password:'test-user-password'})).status,401);
 const activated=await api('activateAccount',{username:'admin.lifecycle',activationCode:reissued.body.activationCode,password:'test-user-password'});
 assert.equal(activated.status,200); const user=activated.cookie;
 for (const name of ['manageUser','resetUserActivation']) assert.equal((await api(name,{operation:'delete',uid},user)).status,403);
 assert.equal((await api('saveProfile',{displayName:'Self edited',uid:'mes-owner',username:'hpham',owner:true,active:false,email:'self@example.com'},user)).status,200);
 const profile=(await api('getProfile',{},user)).body;assert.equal(profile.isOwner,false);assert.equal(profile.profile.username,'admin.lifecycle');assert.equal(profile.profile.active,true);
 const edited=await api('manageUser',{operation:'update',uid,username:'admin.renamed',displayName:'Admin edited',email:'edited@example.com',phone:'123',jobTitle:'Operator'},owner);
 assert.equal(edited.status,200,JSON.stringify(edited.body));assert.equal((await api('getProfile',{},user)).status,401);
 const signedIn=await api('passwordLogin',{username:'admin.renamed',password:'test-user-password'});assert.equal(signedIn.status,200);
 assert.equal((await api('getProfile',{},signedIn.cookie)).body.profile.jobTitle,'Operator');
 const reset=await api('resetUserActivation',{uid},owner);assert.equal(reset.status,200,JSON.stringify(reset.body));
 assert.equal((await api('getProfile',{},signedIn.cookie)).status,401);
 assert.equal((await api('passwordLogin',{username:'admin.renamed',password:'test-user-password'})).status,401);
 const next=await api('activateAccount',{username:'admin.renamed',activationCode:reset.body.activationCode,password:'new-user-password'});assert.equal(next.status,200);
 assert.equal((await api('manageUser',{operation:'deactivate',uid,active:false},owner)).status,200);
 assert.equal((await api('getProfile',{},next.cookie)).status,401);
 assert.equal((await api('manageUser',{operation:'deactivate',uid,active:true},owner)).status,200);
 await pool.query("insert into mes_private.records(collection,id,data) values('issues','deleted-account-history',$1)",[{reporterUid:uid,subject:'Preserve history'}]);
 const final=await api('passwordLogin',{username:'admin.renamed',password:'new-user-password'});assert.equal(final.status,200);
 assert.equal((await api('manageUser',{operation:'delete',uid},owner)).status,200);
 assert.equal((await api('getProfile',{},final.cookie)).status,401);
 assert.equal((await api('passwordLogin',{username:'admin.renamed',password:'new-user-password'})).status,401);
 for (const uid of ['mes-owner','mes-tester']) assert.equal((await api('manageUser',{operation:'delete',uid},owner)).status,403);
 assert.equal((await pool.query("select data->>'reporterUid' uid from mes_private.records where collection='issues' and id='deleted-account-history'")).rows[0].uid,uid);
 const missing=await pool.query("select count(*)::int n from mes_private.credentials where uid=$1",[uid]);assert.equal(missing.rows[0].n,0);
});
test('workspace publishing, media, categories and progress enforce roles and preserve history',async()=>{
 const owner=(await api('passwordLogin',{username:'hpham',password:'test-owner-password'})).cookie;
 const created=await api('manageUser',{operation:'create',username:'workspace.user',displayName:'Workspace User'},owner);
 const user=(await api('activateAccount',{username:'workspace.user',activationCode:created.body.activationCode,password:'workspace-password'})).cookie;
 async function ws(action,data={},cookie=owner){const response=await fetch(base+'/api/mes/workspace',{method:'POST',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'application/json',cookie:cookie||''},body:JSON.stringify({action,data})});return {status:response.status,body:await response.json()};}
 assert.equal((await ws('read',{},'')).status,401);
 assert.equal((await ws('save',{kind:'announcements',title:'Denied',body:'No'},user)).status,403);
 const published=await ws('save',{kind:'announcements',title:'Production update',body:'New instructions',active:true,pinned:true});assert.equal(published.status,200,JSON.stringify(published.body));
 const draft=await ws('save',{kind:'announcements',title:'Unpublished',body:'Draft',active:false});assert.equal(draft.status,200);
 const visible=await ws('read',{},user);assert.equal(visible.status,200);assert.equal(visible.body.announcements.length,1);assert.equal(visible.body.announcements[0].title,'Production update');
 const category=await ws('save',{kind:'issueTypes',name:'Connectivity'});assert.equal(category.status,200);
 const dep=await api('manageDirectory',{type:'departments',operation:'create',name:'Workspace Department'},owner);assert.equal(dep.status,200);
 const issue=await api('createIssue',{reporterUid:created.body.uid,departmentId:dep.body.id,issueTypeId:category.body.id,issueTypeName:'Forged',process:'Station A',description:'Connection interrupted'},user);assert.equal(issue.status,200,JSON.stringify(issue.body));
 let stored=(await pool.query("select data from mes_private.records where collection='issues' and id=$1",[issue.body.id])).rows[0].data;assert.equal(stored.issueTypeName,'Connectivity');assert.equal(stored.progress,0);
 assert.equal((await api('createIssue',{reporterUid:created.body.uid,departmentId:dep.body.id,issueTypeId:'missing',process:'Station',description:'Failure'},user)).status,403);
 assert.equal((await api('updateIssue',{id:issue.body.id,operation:'handling',status:'In progress',priority:'High',progress:70},user)).status,403);
 assert.equal((await api('updateIssue',{id:issue.body.id,operation:'handling',status:'In progress',priority:'High',progress:120},owner)).status,403);
 assert.equal((await api('updateIssue',{id:issue.body.id,operation:'handling',status:'In progress',priority:'High',progress:70},owner)).status,200);
 stored=(await pool.query("select data from mes_private.records where collection='issues' and id=$1",[issue.body.id])).rows[0].data;assert.equal(stored.progress,70);
 assert.equal((await api('updateIssue',{id:issue.body.id,operation:'handling',status:'Closed',priority:'High',progress:10},owner)).status,200);
 await ws('delete',{kind:'issueTypes',id:category.body.id});stored=(await pool.query("select data from mes_private.records where collection='issues' and id=$1",[issue.body.id])).rows[0].data;assert.equal(stored.issueTypeName,'Connectivity');assert.equal(stored.progress,100);
 // Ticket video goes through the same authenticated, immutable attachment slots.
 const filePath=`issues/${issue.body.id}/${issue.body.uploadSlots[0]}`;const grant=await api('uploadUrl',{path:filePath},user);assert.equal(grant.status,200);
 const upload=await fetch(base+grant.body.url,{method:'PUT',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'video/mp4'},body:Buffer.from('test-mp4')});assert.equal(upload.status,200);
 assert.equal((await api('attachFiles',{issueId:issue.body.id,files:[{slot:issue.body.uploadSlots[0],name:'evidence.mp4'}]},user)).status,200);
 assert.equal((await ws('videoUpload',{title:'Video',type:'video/mp4',size:8},user)).status,403);
 const media=await ws('videoUpload',{title:'Production training',type:'video/mp4',size:8});assert.equal(media.status,200,JSON.stringify(media.body));
 let response=await fetch(base+media.body.url,{method:'PUT',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'video/mp4'},body:Buffer.from('12345678')});assert.equal(response.status,200);
 assert.equal((await fetch(base+media.body.url,{method:'PUT',headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'video/mp4'},body:'12345678'})).status,403);
 assert.equal((await fetch(base+`/api/mes/media/${media.body.id}`,{headers:{'x-forwarded-host':'mes.th.io.vn'}})).status,401);
 response=await fetch(base+`/api/mes/media/${media.body.id}`,{headers:{'x-forwarded-host':'mes.th.io.vn',cookie:user,range:'bytes=0-3'}});assert.equal(response.status,206);assert.equal(await response.text(),'1234');
 assert.equal((await ws('videoUpdate',{id:media.body.id,title:'Updated title'})).status,200);
 assert.equal((await ws('videoDelete',{id:media.body.id})).status,200);
 assert.equal((await fetch(base+`/api/mes/media/${media.body.id}`,{headers:{'x-forwarded-host':'mes.th.io.vn',cookie:user}})).status,404);
 assert.equal((await ws('probeLog',{})).status,400);
 assert.equal((await ws('save',{kind:'networkTargets',name:'Removed'})).status,400);
});
test('200 MB video uploads stream in chunks for owner and user, with resume and notice privacy',async()=>{
 async function cookieFor(uid){return 'th_mes='+(await pool.query('select mes_private.open_account_session($1) result',[uid])).rows[0].result.sessionToken;}
 const owner=await cookieFor('mes-owner');const {rows:[person]}=await pool.query("select id from mes_private.records where collection='users' and data->>'username'='workspace.user'");const user=await cookieFor(person.id);
 async function call(path,data,cookie=owner,method='POST',headers={}){const response=await fetch(base+path,{method,headers:{'x-forwarded-host':'mes.th.io.vn','Content-Type':'application/json',cookie,...headers},...(data===undefined?{}:{body:Buffer.isBuffer(data)?data:JSON.stringify(data)})});let body;try{body=await response.json();}catch{}return {status:response.status,body};}
 const ws=(action,data,cookie=owner)=>call('/api/mes/workspace',{action,data},cookie);
 const maximum=200*1024*1024,chunk=Buffer.alloc(4*1024*1024,93);
 const media=await ws('videoUpload',{title:'200 MB boundary',type:'video/mp4',size:maximum});assert.equal(media.status,200);
 assert.equal((await ws('videoUpload',{title:'Too large',type:'video/mp4',size:maximum+1})).status,400);
 const started=await call('/api/mes/uploads',{kind:'media',path:media.body.id,type:'video/mp4',size:maximum});assert.equal(started.status,200,JSON.stringify(started.body));
 assert.equal((await call('/api/mes/uploads/'+started.body.id,undefined,user,'GET')).status,403);
 assert.equal((await call('/api/mes/uploads/'+started.body.id,Buffer.from('x'),owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':'1'})).status,409);
 for(let offset=0;offset<maximum;offset+=chunk.length){const r=await call('/api/mes/uploads/'+started.body.id,chunk,owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':String(offset)});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.offset,offset+chunk.length);}
 const again=await call('/api/mes/uploads',{kind:'media',path:media.body.id,type:'video/mp4',size:maximum});assert.equal(again.body.complete,true);assert.equal(again.body.offset,maximum);
 const range=await fetch(base+`/api/mes/media/${media.body.id}`,{headers:{'x-forwarded-host':'mes.th.io.vn',cookie:user,range:`bytes=${maximum-1}-${maximum-1}`}});assert.equal(range.status,206);assert.equal(new Uint8Array(await range.arrayBuffer())[0],93);
 const dep=(await pool.query("select id from mes_private.records where collection='departments' and (data->>'active')::boolean limit 1")).rows[0];
 const issue=await api('createIssue',{reporterUid:person.id,departmentId:dep.id,process:'Large evidence',description:'Large user video'},user);assert.equal(issue.status,200);
 const path=`issues/${issue.body.id}/${issue.body.uploadSlots[0]}`;
 assert.equal((await call('/api/mes/uploads',{kind:'ticket',path,type:'video/mp4',size:maximum+1},user)).status,400);
 const ticket=await call('/api/mes/uploads',{kind:'ticket',path,type:'video/mp4',size:maximum},user);assert.equal(ticket.status,200,JSON.stringify(ticket.body));
 for(let offset=0;offset<maximum;offset+=chunk.length){const r=await call('/api/mes/uploads/'+ticket.body.id,chunk,user,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':String(offset)});assert.equal(r.status,200,JSON.stringify(r.body));}
 assert.equal((await api('attachFiles',{issueId:issue.body.id,files:[{slot:issue.body.uploadSlots[0],name:'200mb.mp4'}]},user)).status,200);
 assert.equal(Number((await pool.query('select size from public.files where path=$1',[path])).rows[0].size),maximum);
 const broken=await ws('mediaUpload',{purpose:'notice',title:'Retry incomplete chunk',type:'image/png',size:6});const partial=await call('/api/mes/uploads',{kind:'media',path:broken.body.id,type:'image/png',size:6});
 try{const bad=await call('/api/mes/uploads/'+partial.body.id,Buffer.from('toolongfile'),owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':'0'});assert.notEqual(bad.status,200);}catch(error){assert.ok(error instanceof TypeError);}
 const partialStatus=await call('/api/mes/uploads/'+partial.body.id,undefined,owner,'GET');assert.equal(partialStatus.body.offset,0);assert.equal(partialStatus.body.complete,false);
 assert.equal((await call('/api/mes/uploads/'+partial.body.id,Buffer.from('small!'),owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':'0'})).status,200);
 const image=await ws('mediaUpload',{purpose:'notice',title:'Notice photo',type:'image/png',size:8});assert.equal(image.status,200);
 const imageUpload=await call('/api/mes/uploads',{kind:'media',path:image.body.id,type:'image/png',size:8});assert.equal(imageUpload.status,200);
 assert.equal((await call('/api/mes/uploads/'+imageUpload.body.id,Buffer.from('imagepng'),owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':'0'})).status,200);
 const noticeVideo=await ws('mediaUpload',{purpose:'notice',title:'Notice video',type:'video/webm',size:8});assert.equal(noticeVideo.status,200);const v=await call('/api/mes/uploads',{kind:'media',path:noticeVideo.body.id,type:'video/webm',size:8});await call('/api/mes/uploads/'+v.body.id,Buffer.from('webmtest'),owner,'PATCH',{'Content-Type':'application/octet-stream','Upload-Offset':'0'});
 const mediaGet=()=>fetch(base+`/api/mes/media/${image.body.id}`,{headers:{'x-forwarded-host':'mes.th.io.vn',cookie:user}});
 assert.equal((await mediaGet()).status,404);
 const notice=await ws('save',{kind:'announcements',title:'Photo and video',body:'Notice attachments',active:false,media:[image.body.id,noticeVideo.body.id]});assert.equal(notice.status,200,JSON.stringify(notice.body));
 assert.equal((await mediaGet()).status,404);
 assert.equal((await ws('save',{kind:'announcements',id:notice.body.id,title:'Photo and video',body:'Notice attachments',active:true,media:[image.body.id,noticeVideo.body.id]})).status,200);
 assert.equal((await mediaGet()).status,200);
 const visible=(await ws('read',{},user)).body;assert.equal(visible.announcements.find(x=>x.id===notice.body.id).media.length,2);assert.equal(visible.videos.some(x=>x.id===image.body.id),false);assert.equal(visible.targets,undefined);
 assert.equal((await ws('save',{kind:'announcements',id:notice.body.id,title:'Denied',body:'Edit'},user)).status,403);
 assert.equal((await ws('delete',{kind:'announcements',id:notice.body.id})).status,200);assert.equal((await mediaGet()).status,404);
 assert.equal((await pool.query('select id from public.mes_media where id=any($1::text[])',[[image.body.id,noticeVideo.body.id]])).rowCount,0);
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
