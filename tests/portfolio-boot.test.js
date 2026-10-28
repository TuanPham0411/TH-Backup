import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../site/public/portfolio-boot.js',import.meta.url),'utf8');
test('early portrait startup fetches fresh content once and preloads only the authoritative image',async()=>{
 let calls=0;const links=[],window={},document={head:{append:n=>links.push(n)},createElement:()=>({})},id='11111111-1111-4111-8111-111111111111';const scope={window,document,fetch:async(url,options)=>{calls++;assert.equal(options.cache,'no-store');return{ok:true,json:async()=>({profile:{portrait:id}})}}};runInNewContext(script,scope);await window.__portfolioContent;await Promise.resolve();assert.equal(calls,1);assert.equal(links.length,1);assert.equal(links[0].href,'/api/portfolio/content/media/'+id);assert.equal(links[0].fetchPriority,'high');runInNewContext(script,scope);await Promise.resolve();assert.equal(calls,1);
});
test('empty, deleted or untrusted portrait sources are not preloaded',async()=>{
 for(const id of ['',null,'https://example.test/old.jpg','asset:javascript:bad']){const links=[],window={};runInNewContext(script,{window,document:{head:{append:n=>links.push(n)},createElement:()=>({})},fetch:async()=>({ok:true,json:async()=>({profile:{portrait:id}})})});await window.__portfolioContent;await Promise.resolve();assert.equal(links.length,0);}
});
