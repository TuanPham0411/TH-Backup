import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../index.js';
import {runtimeSites} from '../sites.js';
import {driveAuthorization} from '../drive-client.js';

test('custom MES origins are explicit and unsafe origins are rejected',()=>{
 assert.equal(runtimeSites({MES_ORIGIN:'https://tickets.example.com:8443'}).mes,'https://tickets.example.com:8443');
 for(const origin of ['https://tickets.example/a','http://tickets.example','https://owner:secret@tickets.example','https://tickets.example?x=1','file:///tmp'])assert.throws(()=>runtimeSites({MES_ORIGIN:origin}));
 assert.equal(runtimeSites({MES_ORIGIN:'http://localhost:3000'}).mes,'http://localhost:3000');
});

test('MES-only server serves custom-host API and deep links without exposing portfolio routes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mes-standalone-'));await writeFile(join(root,'index.html'),'<title>MES standalone</title>');
 let queries=0;const pool={query:async()=>{queries++;return {rows:[{result:{apiVersion:'accounts-v1'}}]};}};
 const app=createApp(pool,root,{sites:runtimeSites({MES_ORIGIN:'https://tickets.example.com:8443'}),mesOnly:true,webRoot:root});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const headers={'x-forwarded-host':'tickets.example.com','Content-Type':'application/json',origin:'https://tickets.example.com:8443'};
 try {
  for(const path of ['/','/ticket/TH2610-01','/page/22222222-2222-4222-8222-222222222222']){const r=await fetch(base+path,{headers});assert.equal(r.status,200);assert.match(await r.text(),/MES standalone/);}
  const r=await fetch(base+'/api/mes',{method:'POST',headers,body:JSON.stringify({name:'getDirectory'})});assert.equal(r.status,200);assert.equal((await r.json()).apiVersion,'accounts-v1');
  const before=queries;assert.equal((await fetch(base+'/api/portfolio',{method:'POST',headers,body:'{"action":"read"}'})).status,404);assert.equal(queries,before);
  assert.equal((await fetch(base+'/api/mes',{method:'POST',headers:{...headers,origin:'https://mes.th.io.vn'},body:'{"name":"getDirectory"}'})).status,403);
  assert.equal((await fetch(base+'/',{headers:{'x-forwarded-host':'untrusted.example'}})).status,400);
  assert.equal((await fetch(base+'/api/health')).status,200);
  const previous=[process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET];process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-secret';
  try{const login=await fetch(base+'/api/oauth/start',{headers,redirect:'manual'});assert.equal(login.status,302);assert.equal(new URL(login.headers.get('location')).searchParams.get('redirect_uri'),'https://tickets.example.com:8443/api/oauth/callback');}
  finally{for(const [index,name]of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'].entries())if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];}
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});

test('Drive callback follows the configured MES origin',()=>{
 const previous=process.env.MES_ORIGIN;process.env.MES_ORIGIN='https://tickets.example.com';
 try{assert.equal(new URL(driveAuthorization('test-state','test-verifier')).searchParams.get('redirect_uri'),'https://tickets.example.com/api/mes/drive/callback');}
 finally{if(previous===undefined)delete process.env.MES_ORIGIN;else process.env.MES_ORIGIN=previous;}
});
