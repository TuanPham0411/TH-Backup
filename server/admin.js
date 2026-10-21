import {Router} from 'express';
import {actorFor} from './security.js';
import {storageCommand,storageStatus,storageQuota} from './storage.js';
export function adminRouter(pool,root,gate){
 const router=Router();let job=null;
 const actor=req=>actorFor(req.cookies.th_mes,req.headers['x-mes-tester']);
 const dispatch=async(name,data,identity)=>(await pool.query('select public.mes_dispatch($1,$2,$3) result',[name,data,identity])).rows[0].result;
 router.use(async(req,res,next)=>{const s=await dispatch('getSession',{},actor(req));if(!s.isOwner)return res.sendStatus(403);next();});
 router.get('/storage',async(req,res)=>res.json({...await storageStatus(root),quota:storageQuota(),job}));
 router.post('/storage',async(req,res)=>{
  if(!['primary','overflow'].includes(req.body.mode)||!(req.body.id===null||typeof req.body.id==='string'))return res.sendStatus(400);
  await gate.exclusive(()=>storageCommand('select',req.body));res.json({ok:true});
 });
 router.post('/mount',async(req,res)=>{if(typeof req.body.id!=='string')return res.sendStatus(400);res.json(await gate.exclusive(()=>storageCommand('mount',{id:req.body.id})));});
 router.post('/backup',async(req,res)=>{
  if(typeof req.body.id!=='string')return res.sendStatus(400);
  if(job?.state==='running')return res.status(409).json({error:'Backup is already running'});
  job={state:'running',startedAt:Date.now()};
  gate.exclusive(()=>storageCommand('backup',{id:req.body.id},60*60*1000)).then(result=>{job={...job,state:'complete',finishedAt:Date.now(),result};}).catch(error=>{job={...job,state:'failed',finishedAt:Date.now(),error:error.expose?error.message:'Backup failed. Check the USB connection and available space.'};});
  res.status(202).json(job);
 });
 router.get('/access-log',async(req,res)=>{
  if(req.query.before&&!/^\d{1,19}$/.test(req.query.before))return res.sendStatus(400);
  const result=await dispatch('getAccessLog',{before:req.query.before,username:req.query.username},actor(req));res.json(result);
 });
 return router;
}
