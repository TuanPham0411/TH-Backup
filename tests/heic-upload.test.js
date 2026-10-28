import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeHeicFile} from '../server/heic-upload.js';
import {isHeic,validateHeicDimensions} from '../server/heic-format.js';
const fixture=()=>readFile('tests/fixtures/two-colors.heic.base64','utf8').then(s=>Buffer.from(s,'base64'));
test('real HEIC is converted once to a browser-readable JPEG in an isolated worker',async()=>{
 const root=await mkdtemp(join(tmpdir(),'th-heic-test-'));try{const path=join(root,'image'),input=await fixture();assert.equal(isHeic(input),true);await writeFile(path,input);const result=await normalizeHeicFile(path),jpeg=await readFile(path);assert.equal(result.type,'image/jpeg');assert.equal(result.size,jpeg.length);assert.deepEqual([...jpeg.subarray(0,3)],[255,216,255]);const sof=jpeg.indexOf(Buffer.from([255,192]));assert.ok(sof>0);assert.equal(jpeg.readUInt16BE(sof+5),48);assert.equal(jpeg.readUInt16BE(sof+7),64);assert.deepEqual(await readdir(root),['image']);}finally{await rm(root,{recursive:true,force:true});}
});
test('a spoofed HEIC header cannot create a ready JPEG',async()=>{
 const root=await mkdtemp(join(tmpdir(),'th-heic-test-'));try{const path=join(root,'bad');const bad=Buffer.from('000000186674797068656963000000006d69663168656963','hex');await writeFile(path,bad);await assert.rejects(normalizeHeicFile(path),e=>e.status===400);assert.deepEqual(await readdir(root),['bad']);}finally{await rm(root,{recursive:true,force:true});}
});
test('HEIC dimension checks reject oversized metadata before decoding pixels',async()=>{
 const input=await fixture();validateHeicDimensions(input);const offset=input.indexOf(Buffer.from('ispe'));assert.ok(offset>0);input.writeUInt32BE(20000,offset+8);assert.throws(()=>validateHeicDimensions(input),/64 megapixels/);assert.equal(isHeic(Buffer.from('not an image')),false);
});
