import {uploadPreview} from './media-preview.js';
import {t,getLanguage} from './i18n.js';
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=t(String(text));if(cls)el.className=cls;return el;};
const complete=i=>['Resolved','Closed'].includes(i.status);
const clock=i=>typeof i==='number'?i:new Date(i||0).getTime();
const date=n=>new Date(n).toLocaleString(getLanguage()==='vi'?'vi-VN':'en-GB');
const size=n=>`${(n/1073741824).toFixed(1)} GB`;
async function request(path,method='GET',body){
 const r=await fetch('/api/mes/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await r.json();if(!r.ok)throw new Error(result.error||'Request failed');return result;
}
function chartCard(title,subtitle){const c=make('article',undefined,'card detailed-chart');c.append(make('p',title,'eyebrow'),make('h2',subtitle));return c;}
function bars(card,rows){
 const max=Math.max(1,...rows.map(r=>r.value));
 for(const row of rows){const wrap=make('div',undefined,'detail-bar-row'),head=make('div');head.append(make('span',row.label),make('strong',row.value));const track=make('div',undefined,'detail-bar-track');const fill=make('i');fill.style.width=`${row.value/max*100}%`;track.append(fill);wrap.append(head,track);card.append(wrap);}
}
export function renderDetailedAnalytics(issues){
 const host=$('detailed-analytics');if(!host)return;host.replaceChildren();
 const now=Date.now(),open=issues.filter(i=>!complete(i));
 const age=chartCard('Backlog age','Open tickets by age');
 const ageBins=[{label:'Under 1 day',low:0,high:1},{label:'1–3 days',low:1,high:3},{label:'3–7 days',low:3,high:7},{label:'7–14 days',low:7,high:14},{label:'14+ days',low:14,high:Infinity}];
 bars(age,ageBins.map(b=>({label:b.label,value:open.filter(i=>{const v=(now-clock(i.createdAt))/86400000;return v>=b.low&&v<b.high;}).length})));age.append(make('p','Current age of open tickets in the selected submission cohort.','helper'));
 const priority=chartCard('Priority × status','Workload by priority');
 const legend=make('p','Open / Completed','helper');priority.append(legend);
 const max=Math.max(1,...['Critical','High','Medium','Low'].map(p=>issues.filter(i=>i.priority===p).length));
 for(const p of ['Critical','High','Medium','Low']){const items=issues.filter(i=>i.priority===p),done=items.filter(complete).length;const row=make('div',undefined,'detail-bar-row');const head=make('div');head.append(make('span',p),make('strong',`${items.length-done} / ${done}`));const track=make('div',undefined,'detail-bar-track stacked');track.setAttribute('aria-label',`${t(p)}: ${items.length-done} ${t('Open')}, ${done} ${t('Completed')}`);for(const [n,cls]of[[items.length-done,'open'],[done,'done']]){const fill=make('i',undefined,cls);fill.style.width=`${n/max*100}%`;track.append(fill);}row.append(head,track);priority.append(row);}
 const resolution=chartCard('Resolution time','Completed tickets by handling time');
 const resolved=issues.filter(complete).filter(i=>clock(i.resolvedAt)>=clock(i.createdAt)&&clock(i.resolvedAt)>0);
 bars(resolution,[{label:'Under 4 hours',low:0,high:4},{label:'4–24 hours',low:4,high:24},{label:'1–3 days',low:24,high:72},{label:'3–7 days',low:72,high:168},{label:'7+ days',low:168,high:Infinity}].map(b=>({label:b.label,value:resolved.filter(i=>{const hours=(clock(i.resolvedAt)-clock(i.createdAt))/3600000;return hours>=b.low&&hours<b.high;}).length})));
 resolution.append(make('p','Uses recorded creation and resolution times; tickets without a resolution timestamp are excluded.','helper'));
 const department=chartCard('Department detail','Department workload and completion');department.classList.add('department-detail');const wrap=make('div',undefined,'table-wrap'),table=make('table');const head=make('tr');for(const title of ['Department','Total','Open','Completed','Completion rate','Average resolution (hours)'])head.append(make('th',title));const thead=make('thead');thead.append(head);table.append(thead);const body=make('tbody');
 const groups=new Map();for(const i of issues){const key=i.departmentId||'__none';if(!groups.has(key))groups.set(key,{name:i.departmentName||t('Unclassified'),items:[]});groups.get(key).items.push(i);}
 for(const group of [...groups.values()].sort((a,b)=>b.items.length-a.items.length)){const list=group.items,done=list.filter(complete).length,times=list.filter(complete).map(i=>(clock(i.resolvedAt)-clock(i.createdAt))/3600000).filter(n=>Number.isFinite(n)&&n>=0);const row=make('tr');for(const value of [group.name,list.length,list.length-done,done,`${Math.round(done/list.length*100)}%`,times.length?(times.reduce((a,b)=>a+b,0)/times.length).toFixed(1):'—']){const cell=make('td',value);cell.dataset.userContent='';row.append(cell);}body.append(row);}table.append(body);wrap.append(table);department.append(wrap);if(!issues.length)department.append(make('p','No tickets in this period.','helper'));
 host.append(age,priority,resolution,department);
}
export function initUpgrade(){
 const analytics=make('section',undefined,'detailed-analytics');analytics.id='detailed-analytics';$('dashboard-page').append(analytics);
 const admin=make('section',undefined,'admin-upgrade');admin.innerHTML=`<article class="card"><p class="eyebrow">STORAGE / BACKUP</p><h2>Storage and USB backup</h2><p class="helper">Choose a USB drive already mounted on the Pi. Existing files and dashboard links stay unchanged. Do not unplug a storage drive while it is in use.</p><button type="button" id="storage-refresh" class="button">Refresh drives</button> <button type="button" id="preview-existing" class="button">Create previews for existing images</button><p id="preview-status" role="status"></p><p id="storage-summary"></p><div class="account-actions"><label>Unmounted USB partition<select id="usb-unmounted"></select></label><button type="button" id="usb-mount" class="button">Mount existing partition</button></div><div class="storage-controls"><label>New file storage<select id="storage-primary"></select></label><button id="storage-save" type="button" class="button">Use for new files</button><label>Overflow USB when internal space is low<select id="storage-overflow"></select></label><button id="overflow-save" type="button" class="button">Save overflow</button><label>Backup destination<select id="backup-drive"></select></label><button id="backup-start" type="button" class="button primary">Back up now</button></div><p class="helper">Backup includes the database, ticket history and original attachments. Writes pause during backup; viewing remains available. Backups are separate copies and do not change live links. Store a copy on a different removable drive for protection against drive failure.</p><p id="storage-message" role="status"></p><div id="backup-list"></div></article><article class="card"><p class="eyebrow">SECURITY / ACCESS</p><h2>User access history</h2><p class="helper">Sign-in attempts, activation, sign-out and visited application pages. Passwords and activation codes are never logged.</p><div class="account-actions"><label>Username<input id="access-username" maxlength="64" /></label><button id="access-refresh" type="button" class="button">Load history</button><button id="access-older" type="button" class="button">Older entries</button></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Username</th><th>Action</th><th>Page / ticket</th><th>Result</th><th>Address / browser</th></tr></thead><tbody id="access-rows"></tbody></table></div><p id="access-message" role="status"></p></article>`;
 $('settings-page').append(admin);
 let context={},timer,lastId=null,storageBusy=false;
 const show=(id,error)=>$(id).textContent=error.message||String(error);
 function options(id,items,selected){const select=$(id);select.replaceChildren();for(const [value,label]of items){const o=make('option',label);o.value=value;select.append(o);}if(selected!==undefined)select.value=selected;}
 async function loadStorage(){if(!context.isOwner||context.preview||storageBusy)return;storageBusy=true;try{const data=await request('admin/storage');$('storage-summary').textContent=`${t('Internal free')}: ${size(data.internal.free)} / ${size(data.internal.total)} · ${t('File quota')}: ${size(data.quota)}`;
  options('usb-unmounted',(data.unmounted||[]).map(v=>[v.id,`${v.device} · ${v.filesystem||t('Unknown filesystem')} · ${v.id}`]));$('usb-mount').disabled=!(data.unmounted||[]).length;
  const drives=data.disks.map(v=>[v.id,`${v.mount} · ${size(v.free)} ${t('free')} · ${v.filesystem}`]);
  for(const v of data.volumes)if(!data.disks.some(d=>d.id===v.id))drives.push([v.id,`${v.id} (${t('Disconnected')})`]);
  options('storage-primary',[['internal',t('Internal storage')],...drives],data.primary);options('storage-overflow',[['',t('Disabled')],...drives],data.overflow||'');options('backup-drive',data.disks.map(v=>[v.id,`${v.mount} · ${size(v.free)} ${t('free')}`]));
  $('backup-start').disabled=!data.disks.length||data.job?.state==='running';
  $('backup-list').replaceChildren();for(const backup of data.backups){const row=make('p');row.dataset.userContent='';row.textContent=`${date(backup.createdAt)} · ${backup.files} ${t('files')} · ${size(backup.bytes)} · ${backup.folder}`;$('backup-list').append(row);}
  if(!data.disks.length)$('storage-message').textContent=t('No mounted USB found. Ask the Pi administrator to mount the existing partition under /mnt or /media.');
  if(data.job){$('storage-message').textContent=data.job.state==='running'?t('Backup in progress. Do not unplug the USB drive.'):data.job.state==='complete'?`${t('Backup complete')}: ${data.job.result.folder}`:data.job.error;}
 }catch(e){show('storage-message',e);}finally{storageBusy=false;}}
 async function logs(older=false){try{const username=$('access-username').value.trim();const result=await request(`admin/access-log?username=${encodeURIComponent(username)}${older&&lastId?'&before='+lastId:''}`);if(!older)$('access-rows').replaceChildren();for(const r of result.rows){const tr=make('tr');for(const value of [date(r.created_at),r.username||'—',r.event,[r.page,r.ticket_id].filter(Boolean).join(' / '),r.success?t('Success'):t('Denied'),`${r.ip||'—'} · ${r.agent||'—'}`]){const td=make('td');td.dataset.userContent='';td.textContent=value;tr.append(td);}$('access-rows').append(tr);}lastId=result.rows.at(-1)?.id;$('access-older').disabled=result.rows.length<100;$('access-message').textContent=result.rows.length?'':t('No access history yet.');}catch(e){show('access-message',e);}}
 $('preview-existing').onclick=async()=>{
  const button=$('preview-existing');button.disabled=true;let created=0,skipped=0,failed=0;
  try{
   const tickets=await request('','POST',{name:'read',data:{path:'issues'}}),workspace=await request('workspace','POST',{action:'read'});const images=[];
   for(const i of tickets.rows)for(const f of i.attachments||[])if(f.type?.startsWith('image/'))images.push({kind:'ticket',path:f.path,url:'/api/mes/attachments/'+f.path.split('/').slice(1).map(encodeURIComponent).join('/')});
   const media=new Map();for(const a of workspace.announcements)for(const f of a.media||[])if(f.type?.startsWith('image/'))media.set(f.id,f);
   for(const f of media.values())images.push({kind:'media',path:f.id,url:'/api/mes/media/'+f.id});
   for(const f of images){
    await new Promise(resolve=>setTimeout(resolve,1250));
    const head=await fetch(f.url+'?preview=1',{method:'HEAD'});if(head.headers.get('x-media-preview')==='ready'){skipped++;continue;}
    const source=await fetch(f.url);if(!source.ok){failed++;continue;}
    if(await uploadPreview(f.kind,f.path,await source.blob()))created++;else failed++;
    $('preview-status').textContent=`${t('Previews created')}: ${created} / ${images.length} · ${t('Skipped')}: ${skipped} · ${t('Failed')}: ${failed}`;
   }
   $('preview-status').textContent=`${t('Previews created')}: ${created} · ${t('Skipped')}: ${skipped} · ${t('Failed')}: ${failed}`;
  }catch(e){show('preview-status',e);}finally{button.disabled=false;}
 };
 $('storage-refresh').onclick=loadStorage;
 $('usb-mount').onclick=async()=>{if(!confirm(t('Mount the selected existing USB partition without formatting it?')))return;try{await request('admin/mount','POST',{id:$('usb-unmounted').value});await loadStorage();}catch(e){show('storage-message',e);}};
 for(const [button,mode,select]of [['storage-save','primary','storage-primary'],['overflow-save','overflow','storage-overflow']])$(button).onclick=async()=>{try{await request('admin/storage','POST',{mode,id:$(select).value||null});$('storage-message').textContent=t('Storage selection saved. Existing files remain available.');await loadStorage();}catch(e){show('storage-message',e);}};
 $('backup-start').onclick=async()=>{if(!confirm(t('Start a complete backup to the selected USB? Writes pause until it finishes.')))return;try{await request('admin/backup','POST',{id:$('backup-drive').value});await loadStorage();}catch(e){show('storage-message',e);}};
 $('access-refresh').onclick=()=>logs();$('access-older').onclick=()=>logs(true);
 document.addEventListener('mes:navigate',event=>{context=event.detail;clearInterval(timer);if(context.page==='settings'&&context.isOwner&&!context.preview){loadStorage();logs();timer=setInterval(loadStorage,5000);}});
 const translated=new Map();let currentId;
 document.addEventListener('mes:ticket',event=>{
  const {issue,user,isOwner,preview}=event.detail;currentId=issue.id;
  if(!user||preview||(!isOwner&&![issue.createdBy,issue.reporterUid].includes(user.uid)))return;
  const b=make('button','Translate my feedback to English','button');b.type='button';$('detail-heading').append(b);
  const section=make('section',undefined,'translation-panel');section.dataset.userContent='';section.hidden=true;$('detail-heading').append(section);
  const key=JSON.stringify([issue.id,issue.subject,issue.description]);
  const display=result=>{section.hidden=false;const title=make('h3'),text=make('p');title.textContent=result.subject;text.textContent=result.description;section.replaceChildren(make('h2','English translation'),title,text,make('small','Automatic translation · original feedback unchanged'));};
  if(translated.has(key))display(translated.get(key));
  b.onclick=async()=>{if(!confirm(t('Send this ticket title and feedback text to Google Cloud Translation? The original is kept unchanged.')))return;b.disabled=true;section.hidden=false;section.textContent=t('Translating…');try{const result=await request('translation','POST',{id:issue.id});if(currentId!==issue.id)return;translated.set(key,result);if(translated.size>20)translated.delete(translated.keys().next().value);display(result);}catch(e){section.textContent=t(e.message);}finally{b.disabled=false;}};
 });
}
