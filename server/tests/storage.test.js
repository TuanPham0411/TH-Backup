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
 gate.middleware({method:'POST',path:'/api/mes',body:{name:'readBundle'}},{},()=>continued++);assert.equal(continued,2);
 response.emit('finish');await new Promise(r=>setTimeout(r,110));assert.equal(started,true);
 await assert.rejects(gate.exclusive(async()=>{}),/already running/);finish();await backup;assert.equal(gate.blocked,false);
 await assert.rejects(gate.exclusive(async()=>{throw new Error('USB disconnected');}),/USB disconnected/);assert.equal(gate.blocked,false);
});
