import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {driveApi,driveCredentials,driveToken,uploadDriveStream} from './drive-client.js';

const fail=(message,status=502)=>Object.assign(new Error(message),{status,expose:true});
export const versionOf=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function checked(response){if(!response.ok)throw fail('Google Drive is unavailable or access has not been granted.');return response;}
export function quickAccessStore(pool){
 async function root(){const value=await driveCredentials();if(!value?.folderId)throw fail('Connect Google Drive in MES Administration first.',409);return value.folderId;}
 async function find(key,parent){
  const q=`'${parent.replaceAll("'","\\'")}' in parents and trashed=false and appProperties has { key='quickAccessKey' and value='${key}' }`;
  const result=await (await checked(await driveApi('files?'+new URLSearchParams({q,fields:'files(id)',pageSize:'2'})))).json();
  if(result.files.length>1)throw fail('Duplicate Quick Access data files on Drive. Contact the administrator.',409);
  return result.files[0]?.id;
 }
 async function read(key,fallback){const parent=await root(),id=await find(key,parent);if(!id)return {value:fallback,version:versionOf(fallback)};
  const response=await checked(await driveApi(`files/${encodeURIComponent(id)}?alt=media`));
  const value=await response.json();return {value,version:versionOf(value),id};
 }
 async function write(key,value,{version,fallback={}}={}){
  // PostgreSQL serializes writers across processes/platform replicas; Drive remains the data store.
  const db=await pool.connect();
  try{await db.query('begin');await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['quick-access:'+key]);
   const previous=await read(key,fallback);
   if(version!==undefined&&version!==previous.version)throw fail('Content changed in another session. Reopen the editor before saving.',409);
   const bytes=Buffer.from(JSON.stringify(value));
   if(previous.id){const token=await driveToken();await checked(await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(previous.id)}?uploadType=media`,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:bytes,signal:AbortSignal.timeout(30000)}));}
   else await uploadDriveStream(Readable.from([bytes]),{name:`quick-access-${key}.json`,type:'application/json',parent:await root(),size:bytes.length,properties:{quickAccessKey:key}});
   await db.query('commit');return {version:versionOf(value)};
  }catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{db.release();}
 }
 async function upload(bytes,name,type){const result=await uploadDriveStream(Readable.from([bytes]),{name,type,parent:await root(),size:bytes.length,properties:{quickAccessResource:'1'}});return result.id;}
 async function resource(id,{uploaded=false,range}={}){
  if(uploaded){const meta=await (await checked(await driveApi(`files/${encodeURIComponent(id)}?fields=parents,appProperties`))).json();if(!meta.parents?.includes(await root())||meta.appProperties?.quickAccessResource!=='1')throw fail('Resource unavailable.',404);}
  const response=await driveApi(`files/${encodeURIComponent(id)}?alt=media`,{headers:range?{Range:range}:{}});
  if(response.status===416)return response;return checked(response);
 }
 return {read,write,upload,resource};
}
