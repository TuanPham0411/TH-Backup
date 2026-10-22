import assert from 'node:assert/strict';
const base='http://127.0.0.1:'+(process.env.PORT||3000),headers={'X-Forwarded-Host':new URL(process.env.MES_ORIGIN).host,Origin:process.env.MES_ORIGIN,'Content-Type':'application/json'};
assert.equal((await fetch(base+'/api/health')).status,200);
for(const path of ['/','/ticket/TH2610-01','/page/22222222-2222-4222-8222-222222222222']){const r=await fetch(base+path,{headers});assert.equal(r.status,200);assert.match(await r.text(),/\[TH\] P\+F MES/);}
const api=async(name,data={})=>fetch(base+'/api/mes',{method:'POST',headers,body:JSON.stringify({name,data})});
const directory=await api('getDirectory');assert.equal(directory.status,200);assert.equal((await directory.json()).apiVersion,'accounts-v1');
const listing=await api('read',{path:'issues'});assert.equal(listing.status,200);assert.ok(Array.isArray((await listing.json()).rows));
assert.equal((await api('createIssue',{subject:'blocked'})).status,401);
assert.equal((await fetch(base+'/api/portfolio',{method:'POST',headers,body:'{"action":"read"}'})).status,404);
assert.equal((await fetch(base+'/api/mes',{method:'POST',headers:{...headers,Origin:'https://untrusted.example'},body:'{"name":"getDirectory"}'})).status,403);
console.log('Portable MES: runtime database role, public frontend/API, deep links and access boundaries verified.');
