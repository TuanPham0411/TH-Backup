import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createApp} from '../index.js';
import {connectionCheck} from '../connection-check.js';
test('connection check is a small uncached same-origin page on both hosts and times API responses',async()=>{
 const app=createApp({query:async()=>({rows:[]})},'/unused');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const host of ['th.io.vn','mes.th.io.vn']){
  const response=await fetch(base+'/api/connection-check',{headers:{'x-forwarded-host':host}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(response.headers.get('server-timing'),/app;dur=\d/);assert.match(response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.match(await response.text(),/ticket-bundle/);
 }const health=await fetch(base+'/api/health',{headers:{'x-forwarded-host':'mes.th.io.vn'}});assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true});}
 finally{await new Promise(r=>server.close(r));}
});
test('browser diagnostics report timings and status without copying identity or ticket contents',async()=>{
 const elements=Object.fromEntries(['report','status','run','copy'].map(id=>[id,{textContent:'',disabled:false}]));let requests=0;
 const context=vm.createContext({document:{getElementById:id=>elements[id]},location:{origin:'https://mes.th.io.vn',href:'https://mes.th.io.vn/api/connection-check'},performance:{now:()=>Date.now(),getEntriesByType:()=>[]},AbortController,setTimeout,clearTimeout,TextEncoder,URL,fetch:async()=>{requests++;return new Response(JSON.stringify(requests===2?{user:{uid:'PRIVATE-IDENTITY'},isOwner:true}:{snapshots:{issues:{rows:[{description:'PRIVATE-TICKET'}]}}}),{headers:{'Server-Timing':'app;dur=5','X-Request-ID':'test-id'}});}});
 vm.runInContext(connectionCheck.match(/<script>([\s\S]*)<\/script>/)[1],context);await new Promise(r=>setTimeout(r,30));assert.equal(requests,4);assert.match(elements.report.textContent,/ticket-bundle/);assert.ok(!/PRIVATE/.test(elements.report.textContent));assert.match(elements.status.textContent,/Đã đo xong/);
});
