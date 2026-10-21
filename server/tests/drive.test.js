import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {saveDriveCredentials,uploadDriveFile,uploadDriveStream,driveAuthorization} from '../drive-client.js';
import {serveCloudMedia,removeCloudFile} from '../cloud-media.js';
test('private Drive resumable uploads verify checksums, stream unknown-length backups and reject incorrect acknowledgements',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drive-test-')),oldFetch=global.fetch,oldToken=process.env.DRIVE_TOKEN_FILE;
 process.env.DRIVE_TOKEN_FILE=join(dir,'credentials.json');process.env.GOOGLE_DRIVE_CLIENT_ID='test-client';process.env.GOOGLE_DRIVE_CLIENT_SECRET='test-secret';
 let data=Buffer.alloc(0),bad=false;const checksum=()=>createHash('md5').update(data).digest('hex');
 global.fetch=async(url,options={})=>{
  url=String(url);if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-token',expires_in:3600});
  if(url.includes('uploadType=resumable')){data=Buffer.alloc(0);return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/session'}});}
  if(url.endsWith('/upload/session')){
   const range=options.headers['Content-Range'];assert.ok(range.startsWith(`bytes ${data.length}-`));data=Buffer.concat([data,options.body]);
   const total=range.split('/')[1];if(total!=='*'&&Number(total)===data.length)return Response.json({id:'private-id',size:String(data.length),md5Checksum:checksum()});
   return new Response(null,{status:308,headers:{range:`bytes=0-${bad?1:data.length-1}`}});
  }
  throw new Error('Unexpected external request '+url);
 };
 try{
  await saveDriveCredentials({refreshToken:'private-refresh',mediaFolder:'private-media'});
  assert.equal((await readFile(process.env.DRIVE_TOKEN_FILE,'utf8')).includes('private-refresh'),true);
  const bytes=Buffer.alloc(4*1024*1024+31,7),path=join(dir,'video');await writeFile(path,bytes);
  const uploaded=await uploadDriveFile(path,'media/video','video/mp4',bytes.length);assert.equal(uploaded.checksum,createHash('md5').update(bytes).digest('hex'));assert.deepEqual(data,bytes);
  const backup=await uploadDriveStream(Readable.from([bytes.subarray(0,100),bytes.subarray(100)]),{name:'backup.tar',type:'application/x-tar',parent:'backups'});assert.equal(backup.id,'private-id');assert.deepEqual(data,bytes);
  bad=true;await assert.rejects(uploadDriveFile(path,'media/video','video/mp4',bytes.length),/offset/);
  const auth=new URL(driveAuthorization('state','verifier'));assert.equal(auth.searchParams.get('redirect_uri'),'https://mes.th.io.vn/api/mes/drive/callback');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.ok(auth.searchParams.get('scope').includes('drive.file'));
 }finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.DRIVE_TOKEN_FILE;else process.env.DRIVE_TOKEN_FILE=oldToken;delete process.env.GOOGLE_DRIVE_CLIENT_ID;delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;await rm(dir,{recursive:true,force:true});}
});
test('full Drive backup streams a restorable database dump, original media and matching SHA-256 manifest',async()=>{
 const http=await import('node:http');const {mkdir}=await import('node:fs/promises');const {backupToDrive}=await import('../drive-jobs.js');const tar=(await import('tar-stream')).default;
 const dir=await mkdtemp(join(tmpdir(),'drive-backup-')),oldFetch=global.fetch;const saved={token:process.env.DRIVE_TOKEN_FILE,socket:process.env.TEST_STORAGE_SOCKET};
 process.env.DRIVE_TOKEN_FILE=join(dir,'credentials');process.env.TEST_STORAGE_SOCKET=join(dir,'broker.sock');
 await saveDriveCredentials({refreshToken:'test-refresh',backupFolder:'private-backups'});await mkdir(join(dir,'media'));await writeFile(join(dir,'media','photo'),Buffer.from('original photo'));await writeFile(join(dir,'dump'),Buffer.from('PGDMP original database'));
 const ended=[];const broker=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const {action,data}=JSON.parse(text);let result;
  if(action==='cloudBegin')result={id:'backup-test'};else if(action==='cloudDatabaseDump')result={path:join(dir,'dump'),size:23};else if(action==='cloudEnd'){ended.push(data.id);result={ok:true};}else throw new Error(action);
  res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
 });await new Promise(r=>broker.listen(process.env.TEST_STORAGE_SOCKET,r));let archive=Buffer.alloc(0);
 global.fetch=async(url,options={})=>{
  if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'token',expires_in:3600});
  if(String(url).includes('uploadType=resumable'))return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/backup'}});
  archive=Buffer.concat([archive,options.body]);return Response.json({id:'completed-backup',size:String(archive.length),md5Checksum:createHash('md5').update(archive).digest('hex')});
 };
 const pool={query:async(sql)=>({rows:sql.includes('public.files union')?[{path:'media/photo',type:'image/jpeg',size:14}]:sql.includes('select provider')?[{provider:'local'}]:[]})};
 try{
  const result=await backupToDrive(pool,dir);assert.equal(result.id,'completed-backup');assert.deepEqual(ended,['backup-test']);
  const entries={};const extract=tar.extract();extract.on('entry',(header,stream,next)=>{const chunks=[];stream.on('data',b=>chunks.push(b));stream.on('end',()=>{entries[header.name]=Buffer.concat(chunks);next();});});await new Promise((resolve,reject)=>{extract.on('finish',resolve);extract.on('error',reject);extract.end(archive);});
  assert.equal(entries['database.dump'].toString(),'PGDMP original database');assert.equal(entries['files/media/photo'].toString(),'original photo');const manifest=JSON.parse(entries['manifest.json']);assert.equal(manifest.databaseSha256,createHash('sha256').update(entries['database.dump']).digest('hex'));assert.equal(manifest.files[0].sha256,createHash('sha256').update(entries['files/media/photo']).digest('hex'));
  const missing={query:async(sql)=>({rows:sql.includes('public.files union')?[{path:'media/missing',type:'image/jpeg',size:10}]:sql.includes('select provider')?[{provider:'local'}]:[]})};
  await assert.rejects(backupToDrive(missing,dir));assert.deepEqual(ended,['backup-test','backup-test']);
 }finally{global.fetch=oldFetch;await new Promise(r=>broker.close(r));for(const [key,value]of [['DRIVE_TOKEN_FILE',saved.token],['TEST_STORAGE_SOCKET',saved.socket]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(dir,{recursive:true,force:true});}
});
