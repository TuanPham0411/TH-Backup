import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
const bundle=buildSync({entryPoints:['mes/site/backend.js'],bundle:true,platform:'browser',format:'iife',globalName:'Backend',write:false,logLevel:'silent'}).outputFiles[0].text;
function backend(fetch,{setTimer=setTimeout}={}){const context=vm.createContext({fetch,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},document:{hidden:false},AbortController,setTimeout:setTimer,clearTimeout});vm.runInContext(bundle,context);return context.Backend;}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
test('MES startup falls back to viewer only for an expired session',async()=>{
 for(const [status,code] of [[401,'unauthenticated'],[503,'unavailable']]){
  const received=[],errors=[];const app=backend(async()=>({ok:false,status,json:async()=>({code,error:'Request denied'})}));
  app.watchAuth(value=>received.push(value),error=>errors.push(error));await settle();
  if(status===401){assert.deepEqual(received,[null]);assert.equal(errors.length,0);}else{assert.equal(received.length,0);assert.equal(errors[0].status,503);}
 }
});
test('a frontend initialization error is reported once instead of reinitializing as viewer',async()=>{
 let callbacks=0;const errors=[];const app=backend(async()=>({ok:true,status:200,json:async()=>({})}));
 app.watchAuth(()=>{callbacks++;throw new Error('Initialization failed');},error=>errors.push(error));await settle();
 assert.equal(callbacks,1);assert.equal(errors[0].message,'Initialization failed');
});
test('a stalled MES request aborts instead of leaving startup waiting indefinitely',async()=>{
 let deadline;const app=backend(async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('Timeout'),{name:'AbortError'})))),{setTimer:(callback,delay)=>{assert.equal(delay,15000);deadline=callback;return 0;}});
 const request=app.api('getSession');deadline();await assert.rejects(request,{name:'AbortError'});
});

test('startup passes the verified session to the UI without requiring a second session lookup',async()=>{
 let requests=0,received;const session={accountVersion:1,user:{uid:'member-1'},isOwner:false};
 const app=backend(async()=>{requests++;return {ok:true,status:200,json:async()=>session};});
 app.watchAuth(value=>{received=value;});await settle();assert.equal(requests,1);assert.equal(received.session,session);
});
