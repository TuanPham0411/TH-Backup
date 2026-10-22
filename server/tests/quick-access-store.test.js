import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {quickAccessStore,versionOf} from '../quick-access-store.js';
import {saveDriveCredentials,driveAuthorization} from '../drive-client.js';

test('Quick Access persists JSON through Drive, rejects stale edits, and propagates Drive failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quick-drive-test-')),savedFetch=global.fetch;
 const saved=Object.fromEntries(['DRIVE_TOKEN_FILE','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','GOOGLE_DRIVE_SOURCE_READ'].map(key=>[key,process.env[key]]));
 process.env.DRIVE_TOKEN_FILE=join(dir,'credentials');process.env.GOOGLE_DRIVE_CLIENT_ID='test';process.env.GOOGLE_DRIVE_CLIENT_SECRET='test';
 const events=[];let value,id,metadata,failed=false,uploads=0,updates=0;
 const pool={connect:async()=>({query:async(sql,args)=>{events.push({sql,args});},release(){events.push({sql:'release'});}})};
 global.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'test-only',expires_in:3600});
  if(failed)return new Response(null,{status:503});
  if(u.searchParams.has('q')){assert.ok(u.searchParams.get('q').includes("'app-root' in parents"));assert.ok(u.searchParams.get('q').includes('quickAccessKey'));return Response.json({files:id?[{id}]:[]});}
  if(u.searchParams.get('uploadType')==='resumable'){uploads++;metadata=JSON.parse(options.body);return new Response(null,{headers:{location:'https://www.googleapis.com/upload/test-session'}});}
  if(u.pathname==='/upload/test-session'){id='json-file';value=JSON.parse(options.body.toString());return Response.json({id,size:String(options.body.length),md5Checksum:createHash('md5').update(options.body).digest('hex')});}
  if(u.searchParams.get('uploadType')==='media'){assert.equal(options.method,'PATCH');updates++;value=JSON.parse(options.body.toString());return Response.json({id});}
  if(u.pathname.endsWith('/json-file')&&u.searchParams.get('alt')==='media')return Response.json(value);
  throw new Error('Unexpected Drive request');
 };
 try{
  await saveDriveCredentials({refreshToken:'test-only',folderId:'app-root'});
  const store=quickAccessStore(pool),fallback={lines:['initial']};
  assert.deepEqual((await store.read('content',fallback)).value,fallback);
  const first={lines:['saved']};await store.write('content',first,{version:versionOf(fallback),fallback});
  assert.deepEqual(metadata.parents,['app-root']);assert.deepEqual(metadata.appProperties,{quickAccessKey:'content'});assert.equal(uploads,1);
  assert.deepEqual((await store.read('content',fallback)).value,first);
  await assert.rejects(store.write('content',{lines:['stale']},{version:versionOf(fallback),fallback}),{status:409});assert.equal(updates,0);assert.deepEqual(value,first);
  const second={lines:['updated']};await store.write('content',second,{version:versionOf(first),fallback});assert.equal(updates,1);assert.deepEqual((await store.read('content',fallback)).value,second);
  assert.ok(events.some(e=>e.sql.includes('pg_advisory_xact_lock')&&e.args[0]==='quick-access:content'));
  assert.ok(events.some(e=>e.sql==='rollback'));
  failed=true;await assert.rejects(store.write('content',{lines:['unsaved']},{fallback}),{status:502});assert.deepEqual(value,second);
  delete process.env.GOOGLE_DRIVE_SOURCE_READ;assert.ok(new URL(driveAuthorization('state','verifier',{sourceRead:true})).searchParams.get('scope').includes('drive.readonly'));assert.ok(!new URL(driveAuthorization('state','verifier')).searchParams.get('scope').includes('drive.readonly'));
  process.env.GOOGLE_DRIVE_SOURCE_READ='true';assert.ok(new URL(driveAuthorization('state','verifier')).searchParams.get('scope').includes('drive.readonly'));
 }finally{global.fetch=savedFetch;for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(dir,{recursive:true,force:true});}
});
