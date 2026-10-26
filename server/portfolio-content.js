import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,rm,open} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {dirname} from 'node:path';
import {hash} from './security.js';
import {filePath,storageQuota,deleteEverywhere} from './storage.js';
import {defaultPortfolio,publicPortfolio,referencedMedia,validatePortfolio} from '../site/portfolio-model.js';
const error=(status,message)=>Object.assign(new Error(message),{status,expose:true});
const types=new Set(['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/ogg','audio/wav']);
export function portfolioContentRouter(pool,root){
 const router=Router();
 async function admin(req){const {rows:[user]}=await pool.query('select u.id from portfolio.users u join portfolio.sessions s on s.uid=u.id where s.hash=$1 and s.expires>now() and u.admin and u.verified',[hash(req.cookies.th_portfolio||'')]);return user;}
 async function load(db=pool){const {rows:[row]}=await db.query("select version,data from portfolio.content where id='main'");return row?{...row.data,version:row.version}:structuredClone(defaultPortfolio);}
 router.get('/',async(req,res)=>res.json(publicPortfolio(await load())));
 router.get('/admin',async(req,res)=>{if(!await admin(req))throw error(403,'Administrator required');res.json(await load());});
 router.put('/',async(req,res)=>{
 const user=await admin(req);if(!user)throw error(403,'Administrator required');
 let value;try{value=validatePortfolio(req.body);}catch(e){throw error(400,e.message);}
 const refs=[...referencedMedia(value)].filter(id=>!id.startsWith('asset:'));
 for(const ref of referencedMedia(value))if(ref.startsWith('asset:')&&!['asset:/images/profile.webp','asset:/images/ot-hero.webp'].includes(ref))throw error(400,'Invalid built-in image');
 if(refs.some(id=>!/^[a-f0-9-]{36}$/.test(id)))throw error(400,'Invalid media');
 const db=await pool.connect();try{await db.query('begin');await db.query('select pg_advisory_xact_lock(74529101)');
 const {rows}=await db.query('select id,type from portfolio.media where ready and id=any($1::uuid[])',[refs]);if(rows.length!==refs.length)throw error(400,'Upload images and music before saving');
 const metadata=new Map(rows.map(m=>[m.id,m.type]));
 if(value.profile.music&&!metadata.get(value.profile.music)?.startsWith('audio/'))throw error(400,'Choose an audio track');
 if(value.profile.portrait&&!value.profile.portrait.startsWith('asset:')&&!metadata.get(value.profile.portrait)?.startsWith('image/'))throw error(400,'Choose a portrait image');
 for(const key of ['skills','journey','activities','family','projects','education'])for(const item of value[key])for(const id of item.media)if(!id.startsWith('asset:')&&!metadata.get(id)?.startsWith('image/'))throw error(400,'Milestone galleries accept images only');
 const data={...value};delete data.version;
 const result=await db.query("insert into portfolio.content(id,version,data,updated_by) select 'main',1,$2,$3 where $1=0 on conflict(id) do nothing returning version",[value.version,data,user.id]);
 const saved=result.rowCount?result:await db.query("update portfolio.content set data=$2,version=version+1,updated_by=$3,updated_at=now() where id='main' and version=$1 returning version",[value.version,data,user.id]);
 if(!saved.rowCount)throw error(409,'Content changed in another tab. Reload before editing.');await db.query('commit');res.json({version:saved.rows[0].version});
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
 });
 router.post('/upload',async(req,res)=>{
 const user=await admin(req);if(!user)throw error(403,'Administrator required');
 const type=req.headers['content-type']?.split(';')[0],size=Number(req.headers['content-length']);
 if(!types.has(type)||!Number.isSafeInteger(size)||size<=0||size>(type.startsWith('audio/')?40:12)*1024*1024)throw error(400,'Use JPG, PNG, WebP (12 MB) or audio (40 MB)');
 let name;try{name=decodeURIComponent(req.headers['x-file-name']||'Upload').slice(0,180);}catch{throw error(400,'Invalid filename');}
 const id=randomUUID(),db=await pool.connect();
 try{await db.query('begin');await db.query('select pg_advisory_xact_lock(74529101)');const {rows:[used]}=await db.query('select coalesce(sum(size),0)::bigint size from portfolio.media');if(Number(used.size)+size>Math.min(storageQuota(),2*1024**3))throw error(413,'Portfolio media storage limit reached');await db.query('insert into portfolio.media(id,type,size,name,created_by) values($1,$2,$3,$4,$5)',[id,type,size,name,user.id]);await db.query('commit');}catch(e){await db.query('rollback');throw e;}finally{db.release();}
 let path,total=0;
 try{path=await filePath(root,`portfolio/${id}`,true);await mkdir(dirname(path),{recursive:true});await pipeline(req,new Transform({transform(chunk,enc,cb){total+=chunk.length;cb(total>size?error(413,'Upload too large'):null,chunk);}}),createWriteStream(path,{flags:'wx',mode:0o600}));if(total!==size)throw error(400,'Incomplete upload');
 const file=await open(path,'r');let b;try{b=Buffer.alloc(16);await file.read(b,0,16,0);}finally{await file.close();}
 const valid=type==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':type==='audio/ogg'?b.toString('ascii',0,4)==='OggS':type==='audio/wav'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE':type==='audio/mp4'?b.toString('ascii',4,8)==='ftyp':b.toString('ascii',0,3)==='ID3'||b[0]===255&&(b[1]&224)===224;
 if(!valid)throw error(400,'File contents do not match the selected format');await pool.query('update portfolio.media set ready=true where id=$1',[id]);res.status(201).json({id,type,name});
 }catch(e){if(path)await rm(path,{force:true});await pool.query('delete from portfolio.media where id=$1',[id]);throw e;}
 });
 router.get('/library',async(req,res)=>{if(!await admin(req))throw error(403,'Administrator required');res.json({rows:(await pool.query('select id,type,size,name from portfolio.media where ready order by created_at desc limit 500')).rows});});
 router.delete('/media/:id',async(req,res)=>{
 if(!await admin(req))throw error(403,'Administrator required');if(!/^[a-f0-9-]{36}$/.test(req.params.id))throw error(400,'Invalid media');
 const db=await pool.connect();try{await db.query('begin');await db.query('select pg_advisory_xact_lock(74529101)');if(referencedMedia(await load(db)).has(req.params.id))throw error(409,'Remove this media from content and save before deleting');await deleteEverywhere(root,`portfolio/${req.params.id}`);await db.query('delete from portfolio.media where id=$1',[req.params.id]);await db.query('commit');}catch(e){await db.query('rollback');throw e;}finally{db.release();}res.json({ok:true});
 });
 router.get('/media/:id',async(req,res)=>{if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);const content=publicPortfolio(await load());if(!referencedMedia(content).has(req.params.id)&&!await admin(req))return res.sendStatus(404);const {rows:[file]}=await pool.query('select type from portfolio.media where id=$1 and ready',[req.params.id]);if(!file)return res.sendStatus(404);res.type(file.type);res.set({'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"});res.sendFile(await filePath(root,`portfolio/${req.params.id}`));});
 return router;
}
