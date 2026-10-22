import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import express from 'express';
import {MediaCache} from '../media-cache.js';

test('Drive images stream once, concurrent/repeated reads reuse private cache, ranges and revocation remain enforced',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mes-media-cache-'));const cache=new MediaCache(join(root,'.cache','drive-media'),{maxBytes:10000,maxFiles:2,maxEntryBytes:10000});
 const data=Buffer.from('an immutable image payload'),record={drive_id:'file-1',checksum:createHash('md5').update(data).digest('hex'),size:data.length};let downloads=0,allowed=true;
 const app=express();app.get('/image',async(req,res,next)=>{try{if(!allowed)return res.sendStatus(403);res.set({'Content-Type':'image/png','Cache-Control':'private, max-age=0, must-revalidate','ETag':'"test-image"'});const served=await cache.serve(record,req,res,async()=>{downloads++;await new Promise(r=>setTimeout(r,30));return new Response(data,{headers:{'Content-Length':String(data.length)}});});if(!served)res.sendStatus(501);}catch(e){next(e);}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/image`;
 try{
  const [a,b]=await Promise.all([fetch(url),fetch(url)]);assert.equal(await a.text(),data.toString());assert.equal(await b.text(),data.toString());assert.equal(downloads,1);
  const hit=await fetch(url);assert.equal(hit.headers.get('x-media-cache'),'hit');assert.equal(await hit.text(),data.toString());assert.match(hit.headers.get('cache-control'),/must-revalidate/);
  const range=await fetch(url,{headers:{Range:'bytes=3-7'}});assert.equal(range.status,206);assert.equal(await range.text(),data.subarray(3,8).toString());assert.equal(downloads,1);
  allowed=false;assert.equal((await fetch(url)).status,403);assert.equal(downloads,1);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
test('checksum mismatches are not cached and disk cache remains bounded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mes-media-budget-')),cache=new MediaCache(root,{maxBytes:15,maxFiles:2,maxEntryBytes:15});
 const app=express();let downloads=0;
 app.get('/:id',async(req,res,next)=>{const data=Buffer.from(req.params.id.padEnd(10,'x'));const record={drive_id:req.params.id,size:data.length,checksum:req.params.id==='bad'?'0'.repeat(32):createHash('md5').update(data).digest('hex')};try{await cache.serve(record,req,res,async()=>{downloads++;return new Response(data);});}catch(e){next(e);}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const name of ['bad','bad','one','two'])await (await fetch(url+'/'+name)).text();await new Promise(r=>setTimeout(r,10));assert.equal(downloads,4);assert.ok(cache.bytes<=15);assert.equal((await readdir(root)).filter(n=>n.endsWith('.bin')).length,1);assert.ok(!(await readdir(root)).some(n=>n.endsWith('.tmp')));}
 finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
