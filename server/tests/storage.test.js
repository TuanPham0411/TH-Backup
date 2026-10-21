import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceGate} from '../storage.js';
import {EventEmitter} from 'node:events';
test('backup waits for in-flight writes, rejects new writes and continues serving reads',async()=>{
 const gate=maintenanceGate();const response=new EventEmitter();let continued=0;
 gate.middleware({method:'PATCH',path:'/api/mes/uploads/abc'},response,()=>continued++);assert.equal(continued,1);
 let started=false,finish;
 const backup=gate.exclusive(async()=>{started=true;await new Promise(r=>finish=r);});
 await new Promise(r=>setTimeout(r,20));assert.equal(started,false);assert.equal(gate.blocked,true);
 const rejected={set(){},status(n){assert.equal(n,503);return this;},json(body){assert.equal(body.code,'backup-in-progress');}};
 gate.middleware({method:'POST',path:'/api/mes',body:{name:'createIssue'}},rejected,()=>assert.fail('New write accepted'));
 gate.middleware({method:'POST',path:'/api/mes',body:{name:'createIssue',action:'read'}},rejected,()=>assert.fail('Spoofed read action bypassed the backup gate'));
 gate.middleware({method:'POST',path:'/api/mes/workspace',body:{action:'save',name:'read'}},rejected,()=>assert.fail('Spoofed read name bypassed the backup gate'));
 gate.middleware({method:'POST',path:'/api/mes',body:{name:'readBundle'}},{},()=>continued++);assert.equal(continued,2);
 response.emit('finish');await new Promise(r=>setTimeout(r,110));assert.equal(started,true);
 await assert.rejects(gate.exclusive(async()=>{}),/already running/);finish();await backup;assert.equal(gate.blocked,false);
 await assert.rejects(gate.exclusive(async()=>{throw new Error('USB disconnected');}),/USB disconnected/);assert.equal(gate.blocked,false);
});
test('publishing preserves both an existing destination and the original upload',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {publishFile}=await import('../publish.js');
 const dir=await mkdtemp(join(tmpdir(),'th-publish-'));
 try{const source=join(dir,'source'),dest=join(dir,'original');await writeFile(source,'new bytes');await writeFile(dest,'existing bytes');await assert.rejects(publishFile(source,dest),{code:'EEXIST'});assert.equal(await readFile(dest,'utf8'),'existing bytes');assert.equal(await readFile(source,'utf8'),'new bytes');}finally{await rm(dir,{recursive:true,force:true});}
});

test('portable filesystem publishing uses an exclusive copy and never replaces an existing file',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {publishFile}=await import('../publish.js');
 const dir=await mkdtemp(join(tmpdir(),'th-exfat-'));const noHardlinks={linkFile:async()=>{throw Object.assign(new Error('Not supported'),{code:'EOPNOTSUPP'});}};
 try{const source=join(dir,'source'),dest=join(dir,'published');await writeFile(source,'portable USB original');await publishFile(source,dest,noHardlinks);assert.equal(await readFile(dest,'utf8'),'portable USB original');await writeFile(source,'second upload');await assert.rejects(publishFile(source,dest,noHardlinks),{code:'EEXIST'});assert.equal(await readFile(dest,'utf8'),'portable USB original');}finally{await rm(dir,{recursive:true,force:true});}
});
