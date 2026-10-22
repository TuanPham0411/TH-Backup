import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFile} from 'node:fs/promises';
import {quickAccessRouter,validateQuickAccess} from '../quick-access.js';
import {createApp} from '../index.js';
import {versionOf} from '../quick-access-store.js';

const seed=JSON.parse(await readFile('quick-access/default-config.json','utf8'));
const cookie='th_mes='+'a'.repeat(64);
const headers={'x-forwarded-host':'mes.th.io.vn',cookie};
async function withApp(run,{owner=false,expired=false}={}){
 let writes=[],calls=[],content=structuredClone(seed),resources=0;
 const pool={query:async(sql,args)=>{calls.push(args);if(expired)throw Object.assign(new Error('Expired'),{code:'28000'});return {rows:[{result:{user:{uid:'test-uid',username:'alice'},isOwner:owner}}]};}};
 const store={read:async(key,fallback)=>({value:key==='content'?content:fallback,version:versionOf(key==='content'?content:fallback)}),write:async(key,value,options)=>{if(options?.version&&options.version!==versionOf(content))throw Object.assign(new Error('Conflict'),{status:409});writes.push({key,value});if(key==='content')content=value;return {version:versionOf(value)};},upload:async()=> 'new-file',resource:async()=>{resources++;return new Response('image-data',{headers:{'Content-Type':'image/png'}});}};
 const app=express();app.set('trust proxy','loopback');app.use(express.json({limit:'1mb'}));app.use('/quick-access',quickAccessRouter(pool,{store}));app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{await run({url:`http://127.0.0.1:${server.address().port}/quick-access`,writes,calls,get resources(){return resources;}});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('Quick Access requires real MES cookie for page, data and resources; Windows/tester headers do not grant access',async()=>{
 await withApp(async({url,calls})=>{
  for(const path of ['/', '/resources/interface_layout.png','/app.js']){const r=await fetch(url+path,{headers:{'x-forwarded-host':'mes.th.io.vn','x-windows-user':'hpham','x-mes-tester':'true'},redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/?returnTo=%2Fquick-access');}
  const r=await fetch(url+'/api/config',{headers:{'x-forwarded-host':'mes.th.io.vn'}});assert.equal(r.status,401);assert.equal(calls.length,0);
 });
});
test('expired sessions cannot read Quick Access even with a valid-looking cookie',async()=>{await withApp(async({url})=>{const r=await fetch(url+'/api/config',{headers});assert.equal(r.status,401);},{expired:true});});
test('MES members can load application and catalogue, but cannot edit or upload resources',async()=>{
 await withApp(async({url,writes})=>{
  assert.equal((await fetch(url+'/',{headers})).status,200);
  const me=await (await fetch(url+'/api/me',{headers})).json();assert.equal(me.username,'alice');assert.equal(me.isOwner,false);
  const config=await (await fetch(url+'/api/config',{headers})).json();assert.deepEqual(config.config,seed);
  for(const [path,method]of [['/api/content','GET'],['/api/content','PUT'],['/api/content/upload?name=file.pdf','POST']])assert.equal((await fetch(url+path,{method,headers})).status,403);
  assert.equal(writes.length,0);
 });
});
test('settings belong to stable authenticated identity; another username is denied',async()=>{
 await withApp(async({url,writes})=>{
  const options={method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({theme:'dark'})};
  assert.equal((await fetch(url+'/api/settings/bob',options)).status,403);
  assert.equal((await fetch(url+'/api/settings/alice',options)).status,200);
  assert.match(writes[0].key,/^settings-[a-f0-9]{64}$/);assert.deepEqual(writes[0].value,{theme:'dark'});
 });
});
test('owner changes require valid configuration and current Drive version',async()=>{
 await withApp(async({url,writes})=>{
  const put=body=>fetch(url+'/api/content',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await put({config:seed})).status,400);
  assert.equal((await put({config:seed,version:'stale'})).status,409);
  assert.equal((await put({config:{...seed,defaultLine:'missing'},version:versionOf(seed)})).status,400);
  assert.equal((await put({config:seed,version:versionOf(seed)})).status,200);assert.equal(writes.length,1);
 },{owner:true});
});
test('cross-site requests and foreign hosts cannot reach Quick Access storage',async()=>{
 await withApp(async({url,calls})=>{
  assert.equal((await fetch(url+'/api/config',{headers:{...headers,origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(url+'/api/config',{headers:{...headers,'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await fetch(url+'/api/config',{headers:{...headers,'x-forwarded-host':'th.io.vn'}})).status,404);
  assert.equal(calls.length,0);
 });
});
test('resource gateway serves only known Drive resources, never arbitrary file IDs',async()=>{
 await withApp(async ctx=>{
  assert.equal((await fetch(ctx.url+'/resources/unknown.pdf',{headers})).status,404);
  const r=await fetch(ctx.url+'/resources/interface_layout.png',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(await r.text(),'image-data');assert.equal(ctx.resources,1);
 });
});
test('resource paths and station URLs reject executable URL schemes and traversal',()=>{
 for(const path of ['javascript:alert(1)','./resources/../users.json','./resources/evil\\file']){const config=structuredClone(seed);config.guidelines[0].path=path;assert.throws(()=>validateQuickAccess(config));}
 const config=structuredClone(seed);config.lines[0].stations[0].url='javascript:alert(1)';assert.throws(()=>validateQuickAccess(config));
});

test('owner uploads use the private Drive resource path',async()=>{
 await withApp(async({url})=>{
  const result=await fetch(url+'/api/content/upload?name=layout.png',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:Buffer.from('image')});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{path:'./resources/uploads/new-file/layout.png'});
  const denied=await fetch(url+'/api/content/upload?name=page.html',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:'html'});assert.equal(denied.status,400);
 },{owner:true});
});

test('mounted application normalizes the path once, then redirects to MES login without a loop',async()=>{
 const pool={query:async()=>{throw new Error('Anonymous navigation must not access database');}};
 const server=createApp(pool,'/unused').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=path=>fetch(base+path,{headers:{'x-forwarded-host':'mes.th.io.vn'},redirect:'manual'});
  const canonical=await request('/quick-access');assert.equal(canonical.status,308);assert.equal(canonical.headers.get('location'),'/quick-access/');
  const login=await request('/quick-access/');assert.equal(login.status,302);assert.equal(login.headers.get('location'),'/?returnTo=%2Fquick-access');
  assert.equal((await request('/quick-access/api/config')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
