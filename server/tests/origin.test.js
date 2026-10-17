import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../index.js';

async function withApp(run) {
 const pool={query:async()=>{throw new Error('Origin rejection must happen before database access');}};
 const server=createApp(pool,'/unused').listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try {await run(`http://127.0.0.1:${server.address().port}`);}
 finally {await new Promise(resolve=>server.close(resolve));}
}
const googleNavigation={
 'x-forwarded-host':'mes.th.io.vn',
 'sec-fetch-site':'cross-site',
 'sec-fetch-mode':'navigate',
 'sec-fetch-dest':'document',
 origin:'https://accounts.google.com',
};

test('Google cross-site callback reaches OAuth state validation instead of API origin rejection',async()=>{
 await withApp(async base=>{
  const response=await fetch(base+'/api/oauth/callback?state=invalid&code=test',{headers:googleNavigation,redirect:'manual'});
  assert.equal(response.status,400);
  assert.equal(await response.text(),'Invalid OAuth state.');
 });
});

test('OAuth callback exception does not allow cross-site API requests or other OAuth routes',async()=>{
 await withApp(async base=>{
  for(const [path,method] of [['/api/mes','POST'],['/api/portfolio','POST'],['/api/oauth/callback','POST'],['/api/oauth/start','GET'],['/api/oauth/callback/extra','GET']]) {
   const response=await fetch(base+path,{method,headers:googleNavigation,redirect:'manual'});
   assert.equal(response.status,403,`${method} ${path}`);
   assert.deepEqual(await response.json(),{error:'Origin denied'});
  }
 });
});
