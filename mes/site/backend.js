import {uploadPreview} from './media-preview.js';
import {uploadChunks} from "./uploads.js";

let listener;
let tester = sessionStorage.getItem('th-mes-tester') === 'true';
const watchers = new Set();
let loading = false,refreshTimer,watcherVersion=0;
function scheduleRefresh(){if(refreshTimer!==undefined)return;refreshTimer=setTimeout(()=>{refreshTimer=undefined;refreshRecords();},0);}
export async function refreshRecords() {
  if (loading || !watchers.size || document.hidden) return;
  loading = true;
  const active = [...watchers],version=watcherVersion;
  try {
    const result = await api("readBundle", { paths: [...new Map(active.map(w=>[w.path+":"+(w.order||""),{path:w.path,order:w.order}])).values()] });
    for (const w of active) if (watchers.has(w)) w.onData(result.snapshots[w.path].rows);
  } catch (error) { for (const w of active) if (watchers.has(w)) w.onError(error); }
  finally { loading = false;if(version!==watcherVersion&&watchers.size)scheduleRefresh(); }
}
export function initializeBackend() {}
export async function api(name, data = {}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
  const response = await fetch('/api/mes', {
    signal:controller.signal,
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(tester ? { 'X-MES-Tester': 'true' } : {}) },
    body: JSON.stringify({ name, data }),
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Request failed'), { code: body.code || 'unavailable',status:response.status });
  if (!['getDashboardPreferences','getProfile','getAppearanceDefaults','getAppearancePreferences','read','readBundle','getDirectory','getSession','listDevices','downloadUrl','uploadUrl'].includes(name))
    scheduleRefresh();
  return body;
  }finally{clearTimeout(timeout);}
}
export function watchAuth(callback,onError=()=>{}) {
 listener=callback;
 setTimeout(async()=>{
  let user;
  try{const session=await api('getSession');user={id:'local',session};}
  catch(error){if(error.status===401||error.code==='unauthenticated')user=null;else{onError(error);return;}}
  try{await callback(user);}catch(error){onError(error);}
 },0);
}
export async function ownerLogin() { location.href='/api/oauth/start'+(new URLSearchParams(location.search).get('returnTo')==='/quick-access'?'?returnTo=%2Fquick-access':''); }
export async function managedLogin() { tester = false; sessionStorage.removeItem('th-mes-tester'); await listener?.({ id: 'local' }); }
export async function setTesterMode(enabled) {
  tester = enabled;
  sessionStorage.setItem('th-mes-tester', String(enabled));
  await listener?.({ id: 'local' });
}
export async function logout() {
  try { await api('logout'); } finally { tester = false; sessionStorage.removeItem('th-mes-tester'); await listener?.(null); }
}
export function watchRecords(path, onData, onError, order) {
  const watcher = { path, onData, onError, order };
  watchers.add(watcher);watcherVersion++;
  scheduleRefresh();
  return () => {
    if(watchers.delete(watcher))watcherVersion++;
  };
}
export async function uploadAttachment(path, file, type) {
  await uploadChunks({kind:'ticket',path,file,type,headers:tester?{'X-MES-Tester':'true'}:{}});
  await uploadPreview('ticket',path,file,tester?{'X-MES-Tester':'true'}:{});
}
export async function downloadAttachment(path) {
  const { url } = await api('downloadUrl', { path });
  const response = await fetch(url);
  if (!response.ok) throw new Error('Attachment download failed');
  return response.blob();
}
