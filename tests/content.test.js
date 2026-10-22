import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isAdmin,validInquiry,projects} from '../site/content.js';
test('admin UI requires verified server-issued administrator role',()=>{
 for(const email of ['eric.scorp93@gmail.com','tuanpham.x93@gmail.com']){
  assert.equal(isAdmin({email,emailVerified:true,isAdmin:true}),true);
  assert.equal(isAdmin({email,emailVerified:false}),false);
 }
 assert.equal(isAdmin({email:'someone@gmail.com',emailVerified:true}),false);
 assert.equal(isAdmin({email:'eric.scorp93@gmail.com.attacker.test',emailVerified:true}),false);
 assert.equal(isAdmin(null),false);
});
test('inquiries enforce bounded content and supported topics',()=>{
 const v={name:'Viewer',message:'I would like to discuss a software project.',topic:'Software / data'};
 assert.equal(validInquiry(v),true);
 for(const invalid of [{...v,name:''},{...v,name:'x'.repeat(81)},{...v,message:'short'},{...v,message:'x'.repeat(2001)},{...v,topic:'arbitrary'}])assert.equal(validInquiry(invalid),false);
});
test('project catalog has unique safe identifiers and HTTPS references',()=>{
 assert.equal(new Set(projects.map(p=>p.id)).size,projects.length);
 for(const p of projects){assert.match(p.id,/^[a-z0-9-]+$/);assert.equal(new URL(p.url).protocol,'https:');assert.ok(['In development','Live'].includes(p.status));}
});
