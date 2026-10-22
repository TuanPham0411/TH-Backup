import {api} from './backend.js';
import {t} from './i18n.js';
const widgets=[['metrics','Summary metrics','#metrics'],['notices','Notice board','.broadcast-panel'],['video','Workspace video','.video-panel'],['activity','Feedback activity','#activity-chart'],['status','Status overview','#status-chart'],['performance','Resolution performance','#resolution-insights'],['priority','Backlog by priority','#priority-chart'],['types','Tickets by issue type','#issue-type-chart'],['department-progress','Department ticket progress','#department-progress'],['departments','By department','#department-chart'],['recent','Recent feedback','#recent-issues'],['aging','Open tickets by age','#detailed-analytics article:nth-child(1)'],['priority-detail','Workload by priority','#detailed-analytics article:nth-child(2)'],['resolution-detail','Completed tickets by handling time','#detailed-analytics article:nth-child(3)'],['department-detail','Department workload and completion','#detailed-analytics article:nth-child(4)']];
let hidden=new Set(),key='viewer',generation=0;
export function applyDashboardPreferences(){
 for(const [id,,selector]of widgets){const element=document.querySelector(selector);if(!element)continue;const target=['metrics','notices','video','aging','priority-detail','resolution-detail','department-detail'].includes(id)?element:element.closest('article');if(target)target.hidden=hidden.has(id);}
 for(const grid of document.querySelectorAll('#dashboard-page .chart-grid,#dashboard-page .workspace-board,#detailed-analytics'))grid.classList.toggle('widgets-empty',![...grid.children].some(c=>!c.hidden));
 if(hidden.has('video'))document.getElementById('workspace-video')?.pause();
}
export async function loadDashboardPreferences(user,preview=false){
 const epoch=++generation;key=user?.uid||'viewer';let value={hidden:[]};
 try{value=JSON.parse(localStorage.getItem('th-mes-widgets:'+key)||'{"hidden":[]}');}catch{}
 hidden=new Set((value.hidden||[]).filter(id=>widgets.some(w=>w[0]===id)));applyDashboardPreferences();
 if(user&&!preview){try{const stored=await api('getDashboardPreferences');if(epoch!==generation)return;hidden=new Set(stored.hidden);localStorage.setItem('th-mes-widgets:'+key,JSON.stringify(stored));applyDashboardPreferences();}catch{}}
}
export function initDashboardPreferences(getContext){
 const button=document.createElement('button');button.className='button';button.type='button';button.id='customize-dashboard';button.textContent='Customize dashboard';document.querySelector('#dashboard-page .heading-actions').prepend(button);
 const dialog=document.createElement('dialog');dialog.id='dashboard-preferences';dialog.innerHTML='<h2>Customize dashboard</h2><p>Select the widgets to show. Your choices do not change ticket data.</p><form><div id="widget-options"></div><div class="account-actions"><button type="submit" class="button primary">Save layout</button><button type="button" id="widgets-reset" class="button">Show all</button><button type="button" id="widgets-cancel" class="button">Cancel</button></div><p id="widgets-status" role="status"></p></form>';document.body.append(dialog);
 function render(){const list=dialog.querySelector('#widget-options');list.replaceChildren();for(const [id,title]of widgets){const label=document.createElement('label');label.className='checkbox';const input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=!hidden.has(id);label.append(input,document.createTextNode(t(title)));list.append(label);}}
 button.onclick=()=>{render();dialog.querySelector('#widgets-status').textContent='';dialog.showModal();};dialog.querySelector('#widgets-cancel').onclick=()=>dialog.close();dialog.querySelector('#widgets-reset').onclick=()=>dialog.querySelectorAll('input').forEach(c=>c.checked=true);
 dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const value={hidden:[...dialog.querySelectorAll('input')].filter(c=>!c.checked).map(c=>c.value)},context=getContext(),savedKey=key,epoch=generation;const save=dialog.querySelector('button[type="submit"]');save.disabled=true;
  try{if(context.user&&!context.preview)await api('saveDashboardPreferences',value);localStorage.setItem('th-mes-widgets:'+savedKey,JSON.stringify(value));if(epoch!==generation)return;hidden=new Set(value.hidden);applyDashboardPreferences();dialog.close();}catch{dialog.querySelector('#widgets-status').textContent=t('Could not save layout. Please try again.');}finally{save.disabled=false;}
 };
}
