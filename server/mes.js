import {Router} from 'express';
import {mkdir,rm,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {join} from 'node:path';
import {hash,token,validPath,actorFor} from './security.js';
import {normalizeDocument,documentText} from '../mes/site/rich-document.js';
const publicActions=new Set(['getDirectory','passwordLogin','activateAccount']);
const types=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export function mesRouter(pool,filesRoot) {
 const router=Router();
 async function dispatch(name,data,actor) {
  const {rows:[r]}=await pool.query('select public.mes_dispatch($1,$2,$3) as result',[name,data,actor]);
  if(r.result?.errorCode)throw Object.assign(new Error('Account request denied'),{code:r.result.errorCode});
  return r.result;
 }
 router.all('/files/:grant',async(req,res)=>{
  const action=req.method==='PUT'?'uploadUrl':req.method==='GET'?'downloadUrl':null;
  if(!action)return res.sendStatus(405);
  const value=req.params.grant;
  if(!/^[a-f0-9]{64}$/.test(value))return res.sendStatus(404);
  const {rows:[grant]}=await pool.query('delete from public.file_grants where hash=$1 and action=$2 and expires>now() returning *',[hash(value),action]);
  if(!grant)return res.sendStatus(403);
  await dispatch(action,{path:grant.path},grant.actor);
  const path=join(filesRoot,grant.path);
  if(action==='downloadUrl') {
   const {rows:[meta]}=await pool.query('select * from public.files where path=$1',[grant.path]);
   if(!meta)return res.sendStatus(404);
   res.set({'Content-Type':meta.type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
   return res.download(path,meta.name||'attachment');
  }
  const type=req.headers['content-type'];
  if(!types.has(type))return res.status(400).json({error:'Unsupported file type'});
  await mkdir(join(filesRoot,'issues',grant.path.split('/')[1]),{recursive:true});
  const temporary=path+'.'+token()+'.tmp';let size=0;
  try {
   const limiter=new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>10485760?Object.assign(new Error('File too large'),{status:413}):null,chunk);}});
   await pipeline(req,limiter,createWriteStream(temporary,{flags:'wx',mode:0o600}));
   if(!size)throw Object.assign(new Error('Empty file'),{status:400});
   // link is atomic and never overwrites an existing slot.
   const {link}=await import('node:fs/promises');await link(temporary,path);
   try {await pool.query('insert into public.files(path,size,type) values($1,$2,$3)',[grant.path,size,type]);}
   catch(e){await rm(path,{force:true});throw e;}
   res.json({ok:true});
  } finally {await rm(temporary,{force:true});}
 });
 router.post('/',async(req,res)=>{
  const {name,data={}}=req.body||{};
  if(typeof name!=='string'||!data||typeof data!=='object'||Array.isArray(data)||name==='finishDelete')return res.sendStatus(400);
  const actor=actorFor(req.cookies.th_mes,req.headers['x-mes-tester']);
  if(!publicActions.has(name)&&!actor.session)return res.status(401).json({code:'unauthenticated',error:'Sign in first'});
  if((name==='createIssue'||(name==='updateIssue'&&data.operation==='edit'))&&data.richDocument!==undefined){data.richDocument=normalizeDocument(data.richDocument);data.description=documentText(data.richDocument);}
  if(name==='uploadUrl'||name==='downloadUrl') {
   if(!validPath(data.path))return res.sendStatus(400);
   await dispatch(name,data,actor);const value=token();
   await pool.query('insert into public.file_grants(hash,action,path,actor) values($1,$2,$3,$4)',[hash(value),name,data.path,actor]);
   return res.json({url:`/api/mes/files/${value}`});
  }
  if(name==='attachFiles') {
   await dispatch('getSession',{},actor);
   if(!Array.isArray(data.files)||data.files.length>5)return res.sendStatus(400);
   const files=[];
   for(const f of data.files) {
    const path=`issues/${data.issueId}/${f.slot}`;
    if(!validPath(path))return res.sendStatus(400);
    const {rows:[info]}=await pool.query('select size,type from public.files where path=$1',[path]);
    if(!info)return res.sendStatus(400);
    await stat(join(filesRoot,path));files.push({slot:f.slot,path,name:f.name,size:Number(info.size),type:info.type});
   }
   const result=await dispatch(name,{...data,files},actor);
   for(const f of files)await pool.query('update public.files set name=$2 where path=$1',[f.path,f.name]);
   return res.json(result);
  }
  if(name==='deleteIssue') {
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(data.id||''))return res.sendStatus(400);
   await dispatch(name,data,actor);
   await rm(join(filesRoot,'issues',data.id),{recursive:true,force:true});
   await pool.query('delete from public.files where path like $1',[`issues/${data.id}/%`]);
   return res.json(await dispatch('finishDelete',data,actor));
  }
  const result=await dispatch(name,data,actor);
  if(result.sessionToken) {
   res.cookie('th_mes',result.sessionToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:12*3600*1000});
   delete result.sessionToken;
  }
  if(name==='logout')res.clearCookie('th_mes',{path:'/',httpOnly:true,secure:true,sameSite:'lax'});
  if(name==='getDirectory')result.apiVersion='accounts-v1';
  res.json(result);
 });
 return router;
}
