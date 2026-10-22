import {incidentSeries,vietnamInput,vietnamTime} from './incident-analytics.js';
import {t,getLanguage} from './i18n.js';
export function initIncidentTimeline(getIssues,isReady=()=>true){
 const card=document.createElement('article');card.className='card incident-card';card.id='incident-timeline';
 card.innerHTML=`<div class="card-heading"><div><h2>Incident timeline</h2><p>Based on reported incident times, including closed tickets.</p></div></div><div class="incident-controls"><label>Incident period<select id="incident-period"><option value="1">Last 24 hours</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label><label>From (UTC+7)<input id="incident-from" type="datetime-local"></label><label>To (UTC+7)<input id="incident-to" type="datetime-local"></label><label>Group by<select id="incident-unit"><option value="hour">Hour</option><option value="day" selected>Day</option></select></label><label>Frequency<select id="incident-frequency"><option value="all">All intervals</option><option value="high">At least threshold</option><option value="low">At most threshold</option></select></label><label>Ticket threshold<input id="incident-threshold" type="number" min="0" max="1000000" step="1" value="3"></label></div><p id="incident-summary" role="status"></p><div class="incident-scroll"><div id="incident-bars" class="incident-bars" aria-label="Incident frequency by time interval"></div></div><div id="incident-axis" class="incident-axis"></div><p id="incident-selection" data-user-content></p><details><summary>Matching time intervals</summary><ol id="incident-intervals" class="incident-intervals"></ol></details><p class="helper">Each ticket is counted once per overlapping interval. Missing incident times are excluded. Zero means no reported ticket in that interval.</p><p class="helper">Updates every 60 seconds while this dashboard is visible. Times use Vietnam time (UTC+7).</p><p id="incident-updated" class="helper"></p>`;
 document.querySelector('#dashboard-page .workspace-board').after(card);
 const $=id=>card.querySelector('#incident-'+id);let lastIssues,updated=0;
 const label=value=>new Date(value).toLocaleString(getLanguage()==='vi'?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 function render(){
  if(!isReady()){$('bars').replaceChildren();$('intervals').replaceChildren();$('summary').textContent=t('Loading…');$('updated').textContent='';return;}
  const issues=getIssues();if(issues!==lastIssues){updated=Date.now();lastIssues=issues;}
  const custom=$('period').value==='custom';$('from').disabled=$('to').disabled=!custom;
  const now=Date.now();if(!custom){$('from').value=vietnamInput(now-Number($('period').value)*86400000);$('to').value=vietnamInput(now);}
  $('bars').replaceChildren();$('axis').replaceChildren();$('intervals').replaceChildren();$('selection').textContent='';
  try{
   const result=incidentSeries(issues,{start:custom?vietnamTime($('from').value):now-Number($('period').value)*86400000,end:custom?vietnamTime($('to').value):now,unit:$('unit').value,frequency:$('frequency').value,threshold:Number($('threshold').value)});
   $('summary').textContent=`${t('Tickets in range')}: ${result.total} · ${t('Missing incident time')}: ${result.missing} · ${t('Matching intervals')}: ${result.ranked.length}/${result.buckets.length}`;
   const maximum=Math.max(1,...result.buckets.map(b=>b.count));
   for(const value of [result.buckets[0].start,result.buckets.at(-1).end]){const span=document.createElement('span');span.textContent=label(value);$('axis').append(span);}
   const describe=b=>`${label(b.start)} → ${label(b.end)} · ${b.count} ${t('tickets')}`;
   const select=b=>{$('selection').textContent=describe(b)+(b.tickets.length?' · '+b.tickets.map(i=>i.ticketNumber||i.id).join(', '):'');};
   for(const b of result.buckets){const button=document.createElement('button');button.type='button';button.className='incident-bar'+(b.matches?'':' muted');button.style.height=`${Math.max(4,b.count/maximum*150)}px`;button.title=describe(b);button.setAttribute('aria-label',describe(b));button.onclick=()=>{for(const node of $('bars').children)node.removeAttribute('aria-pressed');button.setAttribute('aria-pressed','true');select(b);};$('bars').append(button);}
   for(const b of result.ranked.slice(0,20)){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=describe(b);button.onclick=()=>select(b);li.append(button);$('intervals').append(li);}
   if(result.ranked.length>20){const li=document.createElement('li');li.textContent=t('Showing the first 20 matching intervals. Narrow the filters to see others.');$('intervals').append(li);}
   $('updated').textContent=`${t('Data loaded')}: ${label(updated)}`;
  }catch(error){$('summary').textContent=t(error.message);}
 }
 for(const input of card.querySelectorAll('select,input'))input.addEventListener('change',render);
 return {render,visible:()=>!card.hidden&&!document.getElementById('dashboard-page').hidden};
}
