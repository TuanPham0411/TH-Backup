import express,{Router} from 'express';
import {runtimeSites,hostOf} from './sites.js';
import cookieParser from 'cookie-parser';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {actorFor,sameOrigin,hash} from './security.js';
import {quickAccessStore} from './quick-access-store.js';

const invalid=message=>Object.assign(new Error(message),{status:400,expose:true});
export function validateQuickAccess(config){
 const text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>4000)throw invalid(`Invalid ${n}.`);};
 const resource=p=>{text(p,'resource path');if(!p.startsWith('./resources/')||p.includes('..')||/[\\\x00-\x1f]/.test(p))throw invalid('Invalid resource path.');};
 if(!config||!Array.isArray(config.lines)||!config.lines.length||config.lines.length>200)throw invalid('Production lines are required.');
 const ids=new Set();
 for(const line of config.lines){text(line.id,'line ID');text(line.name,'line name');if(!/^[a-zA-Z0-9_-]+$/.test(line.id)||ids.has(line.id)||!Array.isArray(line.stations)||line.stations.length>1000)throw invalid('Invalid production line.');ids.add(line.id);
  for(const station of line.stations){text(station.operation,'station name');if(typeof station.workCenter!=='string'||!Array.isArray(station.pcs)||station.pcs.some(pc=>typeof pc!=='string'))throw invalid('Invalid station.');if(station.url){let url;try{url=new URL(station.url);}catch{throw invalid('Invalid station URL.');}if(!['http:','https:'].includes(url.protocol))throw invalid('Invalid station URL.');}}
 }
 if(!ids.has(config.defaultLine))throw invalid('Select an existing default line.');
 for(const env of ['LIVE','TEST'])if(!/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(config.environments?.[env]||''))throw invalid('Invalid MES domain.');
 for(const key of ['managementPath','taskPath']){text(config.urls?.[key],key);if(!config.urls[key].startsWith('/')||config.urls[key].startsWith('//'))throw invalid('Invalid MES path.');}
 if(!Array.isArray(config.guidelines)||config.guidelines.length>1000)throw invalid('Invalid document catalogue.');
 for(const item of config.guidelines){text(item.title,'document title');text(item.category,'document category');text(item.type,'document type');resource(item.path);}
 for(const [id,layout]of Object.entries(config.layouts||{})){if(!ids.has(id))throw invalid('Unknown layout line.');resource(layout.image);}
 return config;
}

export function quickAccessRouter(pool,{siteRoot=resolve(process.env.QUICK_ACCESS_ROOT||'quick-access/site'),store=quickAccessStore(pool),seedPath=resolve(process.env.QUICK_ACCESS_DATA_ROOT||'quick-access','default-config.json'),sourcePath=resolve(process.env.QUICK_ACCESS_DATA_ROOT||'quick-access','source-files.json')}={}){
 const router=Router();let seed,sourceFiles;
 const defaults=async()=>seed??=JSON.parse(await readFile(seedPath,'utf8'));
 const sources=async()=>sourceFiles??=JSON.parse(await readFile(sourcePath,'utf8'));
 router.use(cookieParser(),sameOrigin);
 router.use(async(req,res,next)=>{
  if(req.hostname!==hostOf((req.app.locals.sites||runtimeSites()).mes))return res.sendStatus(404);
  const actor=actorFor(req.cookies.th_mes);
  if(!actor.session)return req.path.startsWith('/api/')?res.status(401).json({error:'Sign in to MES first.'}):res.redirect('/?returnTo=%2Fquick-access');
  try{const session=(await pool.query('select public.mes_dispatch($1,$2,$3) result',['getSession',{},actor])).rows[0]?.result;
   if(!session?.user||session.errorCode)throw Object.assign(new Error('Session expired'),{code:'28000'});
   req.quickSession=session;req.quickActor=actor;next();
  }catch(error){if(['28000','P0001'].includes(error.code))return req.path.startsWith('/api/')?res.status(401).json({error:'MES session expired. Sign in again.'}):res.redirect('/?returnTo=%2Fquick-access');throw error;}
 });
 const owner=(req,res,next)=>req.quickSession.isOwner?next():res.status(403).json({error:'MES owner required.'});
 router.get('/api/me',(req,res)=>res.json({...req.quickSession.user,role:req.quickSession.isOwner?'Admin':'User',isOwner:!!req.quickSession.isOwner,authMode:'MES',auto:false,mustChangePassword:false}));
 router.post('/api/logout',async(req,res)=>{await pool.query('select public.mes_dispatch($1,$2,$3) result',['logout',{},req.quickActor]);res.clearCookie('th_mes',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});res.json({ok:true});});
 router.get('/api/config',async(req,res)=>{const result=await store.read('content',await defaults());res.json({config:result.value,version:result.version});});
 router.get('/api/content',owner,async(req,res)=>{const result=await store.read('content',await defaults());res.json({config:result.value,version:result.version});});
 router.put('/api/content',owner,async(req,res)=>{if(typeof req.body?.version!=='string')throw invalid('Content version required.');validateQuickAccess(req.body.config);res.json({ok:true,...await store.write('content',req.body.config,{version:req.body.version,fallback:await defaults()})});});
 const settingsKey=req=>'settings-'+hash(req.quickSession.user.uid);
 const ownSettings=(req,res,next)=>req.params.username===req.quickSession.user.username?next():res.status(403).json({error:'Access your own settings only.'});
 router.get('/api/settings/:username',ownSettings,async(req,res)=>res.json((await store.read(settingsKey(req),{})).value));
 router.put('/api/settings/:username',ownSettings,async(req,res)=>{if(!req.body||Array.isArray(req.body)||JSON.stringify(req.body).length>32768)throw invalid('Invalid settings.');await store.write(settingsKey(req),req.body);res.json({ok:true});});
 router.post('/api/client-log',(req,res)=>res.json({ok:true}));
 router.post('/api/content/upload',owner,express.raw({type:'application/octet-stream',limit:'30mb'}),async(req,res)=>{
  const name=String(req.query.name||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
  if(!/\.(pdf|png|jpe?g|webp|txt|ps1|bat|cmd|zip|ttf|exe|lnk)$/i.test(name)||!Buffer.isBuffer(req.body)||!req.body.length)throw invalid('Select a supported, non-empty resource.');
  const id=await store.upload(req.body,name,'application/octet-stream');res.json({path:`./resources/uploads/${id}/${name}`});
 });
 router.use('/resources',async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method))return res.sendStatus(405);
  const path='./resources'+decodeURIComponent(req.path);const upload=/^\.\/resources\/uploads\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/.exec(path);
  const source=(await sources()).find(f=>f.path===path);if(!upload&&!source)return res.sendStatus(404);
  const response=await store.resource(upload?.[1]||source.id,{uploaded:!!upload,range:req.headers.range});
  res.status(response.status);for(const key of ['content-length','content-range','accept-ranges'])if(response.headers.has(key))res.set(key,response.headers.get(key));
  const extension=path.split('.').at(-1).toLowerCase();const type=({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'})[extension]||'application/octet-stream';
  res.set({'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"});
  if(type==='application/octet-stream')res.attachment(path.split('/').at(-1));
  if(req.method==='HEAD'){await response.body?.cancel();return res.end();}if(response.status===416)return res.end();
  await pipeline(Readable.fromWeb(response.body),res);
 });
 router.use('/api',(_req,res)=>res.status(404).json({error:'Use MES account management for login and account changes.'}));
 router.use(express.static(siteRoot,{index:'index.html',dotfiles:'deny',setHeaders:res=>res.set('Cache-Control','private, no-store')}));
 router.use((_req,res)=>res.sendStatus(404));
 return router;
}
