import {mkdir,readdir,stat,open,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const caches=new Map();
export function mediaCache(root){
 const directory=process.env.MEDIA_CACHE_ROOT||join(root,'.cache','drive-media');
 if(!caches.has(directory))caches.set(directory,new MediaCache(directory));
 return caches.get(directory);
}
export class MediaCache {
 constructor(root,{maxBytes=Number(process.env.MEDIA_CACHE_MAX_BYTES??134217728),maxFiles=512,maxEntryBytes=12582912}={}){
  this.root=root;this.maxBytes=Math.max(0,Math.min(maxBytes,1073741824));this.maxFiles=maxFiles;this.maxEntryBytes=maxEntryBytes;this.files=new Map();this.pending=new Map();this.pinned=new Map();this.bytes=0;this.active=0;this.queue=[];
  this.ready=this.initialize().catch(()=>{this.disabled=true;});
 }
 key(record){return createHash('sha256').update(record.drive_id+':'+record.checksum).digest('hex');}
 async initialize(){
  await mkdir(this.root,{recursive:true,mode:0o700});
  const rows=[];for(const name of await readdir(this.root)){
   if(/^[a-f0-9]{64}\.bin$/.test(name)){const info=await stat(join(this.root,name));if(info.isFile())rows.push([name.slice(0,-4),{size:info.size,time:info.mtimeMs}]);}
   else if(/^[a-f0-9]{64}\.[a-f0-9-]+\.tmp$/.test(name)){const path=join(this.root,name);if(Date.now()-(await stat(path)).mtimeMs>3600000)await rm(path,{force:true});}
  }
  for(const [key,value]of rows.sort((a,b)=>a[1].time-b[1].time)){this.files.set(key,value);this.bytes+=value.size;}
  await this.trim();
 }
 async trim(){
  for(const [key,value]of this.files){if(this.bytes<=this.maxBytes&&this.files.size<=this.maxFiles)break;if(this.pinned.has(key))continue;this.files.delete(key);this.bytes-=value.size;await rm(join(this.root,key+'.bin'),{force:true}).catch(()=>{});}
 }
 async cached(key,size){
  const row=this.files.get(key);if(!row||row.size!==size)return false;
  try{if((await stat(join(this.root,key+'.bin'))).size!==size)throw new Error('Cache file changed');}
  catch{this.files.delete(key);this.bytes-=row.size;return false;}
  this.files.delete(key);this.files.set(key,row);return true;
 }
 async send(key,res){
  this.pinned.set(key,(this.pinned.get(key)||0)+1);res.set('X-Media-Cache','hit');
  try{await new Promise((resolve,reject)=>res.sendFile(join(this.root,key+'.bin'),{cacheControl:false,lastModified:false,dotfiles:'allow'},error=>error?reject(error):resolve()));}
  finally{const count=this.pinned.get(key)-1;if(count)this.pinned.set(key,count);else this.pinned.delete(key);await this.trim();}
  return true;
 }
 async slot(){if(this.active<3)this.active++;else await new Promise(resolve=>this.queue.push(resolve));let released=false;return ()=>{if(released)return;released=true;const next=this.queue.shift();if(next)next();else this.active--;};}
 async serve(record,req,res,load){
  await this.ready;if(this.disabled||!this.maxBytes)return false;
  const size=Number(record.size),key=this.key(record);
  if(await this.cached(key,size))return this.send(key,res);
  if(this.pending.has(key)){await this.pending.get(key).catch(()=>{});if(res.destroyed)return true;if(await this.cached(key,size))return this.send(key,res);}
  // Cache only full image reads; range/video streams retain their existing streaming path.
  if(req.method!=='GET'||req.headers.range||!Number.isSafeInteger(size)||size<1||size>this.maxEntryBytes||size>this.maxBytes)return false;
  const task=(async()=>{const release=await this.slot();try{if(res.destroyed)return true;return await this.fill(key,record,req,res,load);}finally{release();}})();this.pending.set(key,task);
  try{return await task;}finally{if(this.pending.get(key)===task)this.pending.delete(key);}
 }
 async fill(key,record,req,res,load){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),abort=()=>controller.abort();res.once('close',abort);
  const temporary=join(this.root,key+'.'+randomUUID()+'.tmp');let handle,cacheFailed=false,count=0;
  const digest=createHash('md5');
  try{
   const response=await load(controller.signal);
   if(!response.ok){res.status(response.status===404?404:502).end();return true;}
   res.status(response.status);for(const name of ['content-length','content-range'])if(response.headers.has(name))res.set(name,response.headers.get(name));res.set('X-Media-Cache','miss');
   try{handle=await open(temporary,'wx',0o600);}catch{cacheFailed=true;}
   const copy=new Transform({transform(chunk,_encoding,callback){
    count+=chunk.length;digest.update(chunk);
    if(count>Number(record.size)){cacheFailed=true;}
    if(!handle||cacheFailed)return callback(null,chunk);
    (async()=>{let offset=0;while(offset<chunk.length){const result=await handle.write(chunk,offset,chunk.length-offset);if(!result.bytesWritten)throw new Error('Cache write interrupted');offset+=result.bytesWritten;}})().then(()=>callback(null,chunk),()=>{cacheFailed=true;callback(null,chunk);});
   }});
   await pipeline(Readable.fromWeb(response.body),copy,res);
   await handle?.close().catch(()=>{cacheFailed=true;});handle=null;
   if(!cacheFailed&&count===Number(record.size)&&digest.digest('hex')===record.checksum){
    try{await rename(temporary,join(this.root,key+'.bin'));const previous=this.files.get(key);if(previous)this.bytes-=previous.size;this.files.set(key,{size:count});this.bytes+=count;await this.trim();}catch{/* Cache is disposable; a cache disk error never invalidates a completed media response. */}
   }
   return true;
  }finally{clearTimeout(timer);res.off('close',abort);await handle?.close().catch(()=>{});await rm(temporary,{force:true}).catch(()=>{});}
 }
}
