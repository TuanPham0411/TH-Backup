import {priorityHeight,priorityAt,departmentColor} from './incident-load.js';
import {t,getLanguage} from './i18n.js';
const NS='http://www.w3.org/2000/svg';
const S=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
export function countScale(maximum,minimum=3){
 const target=Math.max(minimum,maximum),raw=target/3,base=10**Math.floor(Math.log10(Math.max(raw,.001))),step=[1,2,5,10].map(n=>n*base).find(n=>n>=raw),integerStep=Math.max(1,Math.ceil(step)),max=Math.ceil(target/integerStep)*integerStep;
 return {max,ticks:Array.from({length:Math.round(max/integerStep)+1},(_,i)=>i*integerStep)};
}
export function createIncidentChart(result,{width=960,fontSize=14,night=true,unit='day',onBucket=()=>{},onTime=()=>{},onTicket=()=>{},onHover=()=>{},onLeave=()=>{}}={}){
 const s=fontSize/14,w=Math.max(360,width),left=42*s,right=w-20*s,top=26*s,bottom=222*s,height=254*s,plot=right-left;
 const c=night?{ink:'#e7eef4',muted:'#a3b2be',grid:'#354149',line:'#8ed1ff',bg:'#1b2227'}:{ink:'#233244',muted:'#617284',grid:'#dce4ea',line:'#165fbf',bg:'#fff'};
 const maximum=Math.max(8,Math.ceil(result.peak/2)*2),step=Math.max(2,Math.ceil(maximum/10/2)*2),max=Math.ceil(maximum/step)*step;
 const x=time=>left+(time-result.start)/(result.end-result.start)*plot,y=n=>bottom-n/max*(bottom-top);
 const svg=S('svg',{xmlns:NS,viewBox:`0 0 ${w} ${height}`,width:w,height,role:'group',tabindex:0,'aria-label':t('Combined incident timeline'),'aria-description':t('Line: concurrent tickets. Columns: priority height. Colors: departments.'),class:'incident-analysis-svg','data-count-max':max,'data-peak':result.peak,style:`font-family:inherit;font-size:${fontSize}px;width:${w}px;height:${height}px;max-width:none;isolation:isolate`});
 svg.append(S('title',{},t('Combined incident timeline')));
 const text=(value,px,py,attrs={})=>S('text',{x:px,y:py,fill:c.muted,'font-size':fontSize,'font-family':'inherit',...attrs},value);
 svg.append(text(t('Quantity / priority level'),left,15*s,{fill:c.ink,'font-weight':600}));
 for(let n=0;n<=max;n+=step)svg.append(S('line',{x1:left,x2:right,y1:y(n),y2:y(n),stroke:c.grid,'stroke-width':1}),text(n,left-10*s,y(n)+4*s,{'text-anchor':'end'}));
 const defs=S('defs'),clip=S('clipPath',{id:'incident-plot-clip'});clip.append(S('rect',{x:left,y:top-2*s,width:plot,height:bottom-top+4*s}));defs.append(clip);svg.append(defs);
 const highlight=S('rect',{x:left,y:top,width:0,height:bottom-top,fill:c.line,opacity:.06,'pointer-events':'none'});svg.append(highlight);
 const layers=S('g',{'clip-path':'url(#incident-plot-clip)'}),columns=S('g',{class:'incident-columns'}),paths=S('g',{class:'incident-trajectories'});layers.append(columns,paths);svg.append(layers);
 if(result.buckets.some(b=>!b.matches))for(const b of result.buckets)if(b.matches)layers.prepend(S('rect',{x:x(b.start),y:top,width:Math.max(1,x(b.end)-x(b.start)),height:bottom-top,fill:c.line,'fill-opacity':.07,class:'incident-frequency-window','pointer-events':'none'}));
 const allReports=result.entries.flatMap(entry=>entry.reported.map(report=>({entry,report}))).sort((a,b)=>priorityHeight(priorityAt(b.entry,b.report.start))-priorityHeight(priorityAt(a.entry,a.report.start)));
 const bases=new Map();for(const {entry,report}of allReports){if(report.column===false||report.start<result.start||report.start>=result.end)continue;bases.set(report.start,Math.max(bases.get(report.start)||0,priorityHeight(priorityAt(entry,report.start))));}
 for(const [time,h]of bases)columns.append(S('rect',{x:x(time)-6*s,y:y(h),width:12*s,height:bottom-y(h),fill:night?'#dbe4e9':'#fff','fill-opacity':.9,'pointer-events':'none'}));
 for(const {entry,report}of allReports){
  const from=Math.max(result.start,report.start),to=Math.min(result.end,report.end),initial=priorityAt(entry,report.start),color=departmentColor(entry.issue.departmentId);
  const group=S('g',{class:'incident-range',role:'button',tabindex:0,'data-kind':report.kind,'data-ticket':entry.id,'aria-label':`${entry.issue.ticketNumber||entry.id} · ${entry.issue.departmentName||t('Unclassified')} · ${t(initial)}`});
  group.append(S('title',{},`${entry.issue.ticketNumber||entry.id} · ${entry.issue.subject||''}\n${entry.issue.departmentName||t('Unclassified')} · ${t(initial)} (${priorityHeight(initial)})`));
  if(report.column!==false&&report.start>=result.start&&report.start<result.end){const column=S('rect',{x:x(report.start)-6*s,y:y(priorityHeight(initial)),width:12*s,height:bottom-y(priorityHeight(initial)),fill:color,'fill-opacity':.48,stroke:color,'stroke-width':.8*s,class:'incident-start-column','data-severity':initial,'data-height':priorityHeight(initial),'data-start':report.start,'data-ticket':entry.id,'data-department':entry.issue.departmentId||'__none',style:'mix-blend-mode:multiply'});columns.append(column);column.addEventListener('mouseenter',event=>onHover({entry,report},event));column.addEventListener('mouseleave',onLeave);column.addEventListener('click',event=>{event.stopPropagation();onTime(report.start);});}
  let d=`M${x(from)},${y(priorityHeight(priorityAt(entry,from)))}`;
  for(const change of entry.history){if(change.at<=from||change.at>=to||!change.priority||change.priority===change.beforePriority)continue;d+=` H${x(change.at)} V${y(priorityHeight(change.priority))}`;}
  d+=` H${x(to)}`;
  if(report.completedAt!==null&&report.completedAt<=result.end&&report.completedAt>=result.start)d+=` V${bottom}`;
  group.append(S('path',{d,fill:'none',stroke:color,'stroke-width':2*s,'stroke-dasharray':`${5*s} ${4*s}`,'stroke-linejoin':'round',class:'incident-continuation','data-initial-height':priorityHeight(initial)}));
  // Wide invisible target preserves hover/click access without making the plot heavier.
  group.append(S('path',{d,fill:'none',stroke:'transparent','stroke-width':10*s}));
  if(report.completedAt!==null&&report.completedAt<=result.end&&report.completedAt>=result.start)group.append(S('circle',{cx:x(report.completedAt),cy:bottom,r:2.5*s,fill:color,class:'incident-completion'}));
  group.addEventListener('mouseenter',event=>onHover({entry,report},event));group.addEventListener('mouseleave',onLeave);group.addEventListener('click',event=>{event.stopPropagation();onTime(from);});group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();onTicket(entry.issue.id);}});paths.append(group);
 }
 // Draw exact concurrency on the same axis, without converting counts into ratios.
 let d='';for(const segment of result.segments){d+=`${d?' L':'M'}${x(segment.start)},${y(segment.count)} H${x(segment.end)}`;}
 layers.append(S('path',{d,fill:'none',stroke:c.bg,'stroke-width':5*s,'stroke-linejoin':'round','pointer-events':'none'}),S('path',{d,fill:'none',stroke:c.line,'stroke-width':2.5*s,'stroke-linejoin':'round',class:'incident-total-line','pointer-events':'none'}));
 let previous=null;
 for(const segment of result.segments){if(segment.count===previous)continue;previous=segment.count;if(!segment.count)continue;
  const active=result.entries.filter(e=>e.ranges.some(r=>r.start<=segment.start&&segment.start<r.end)),lowest=Math.min(...active.map(e=>priorityHeight(priorityAt(e,segment.start)))),px=Math.min(right-9*s,Math.max(left+9*s,x(segment.start))),py=y(lowest*.5);
  layers.append(S('circle',{cx:x(segment.start),cy:y(segment.count),r:3*s,fill:c.line,stroke:c.bg,'stroke-width':1*s,class:'incident-load-dot'}));
  const label=S('g',{class:'incident-count-label','data-time':segment.start,'data-count':segment.count,'pointer-events':'none'});label.append(S('rect',{x:px-9*s,y:py-10*s,width:18*s,height:18*s,rx:4*s,fill:c.bg,'fill-opacity':.92}),text(segment.count,px,py+4*s,{'text-anchor':'middle',fill:c.ink,'font-weight':700}));layers.append(label);
 }
 const showTime=unit==='hour'||result.end-result.start<=2*86400000,ticks=Math.max(2,Math.min(8,Math.floor(plot/((showTime?160:95)*s))));
 for(let i=0;i<ticks;i++){const time=result.start+(result.end-result.start)*i/(ticks-1),value=new Date(time).toLocaleString(getLanguage()==='vi'?'vi-VN':'en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',...(showTime?{hour:'2-digit',minute:'2-digit'}:{})});svg.append(text(value,x(time),bottom+23*s,{'text-anchor':i===0?'start':i===ticks-1?'end':'middle'}));}
 let selected=Math.max(0,result.buckets.findIndex(b=>b.count===result.peak));
 const inspect=(index,event)=>{selected=Math.max(0,Math.min(result.buckets.length-1,index));const b=result.buckets[selected];if(!b)return;highlight.setAttribute('x',x(b.start));highlight.setAttribute('width',Math.max(1,x(b.end)-x(b.start)));onHover({bucket:b},event);};
 const timeAt=event=>{const bounds=svg.getBoundingClientRect();return result.start+((event.clientX-bounds.left)*w/(bounds.width||w)-left)/plot*(result.end-result.start);};
 svg.addEventListener('mousemove',event=>{if(event.target.closest('.incident-range,.incident-start-column'))return;const time=timeAt(event),index=result.buckets.findIndex(b=>b.start<=time&&time<b.end);if(index>=0)inspect(index,event);else onLeave();});
 svg.addEventListener('mouseleave',()=>{highlight.setAttribute('width',0);onLeave();});
 svg.addEventListener('click',event=>{const time=timeAt(event);if(time>=result.start&&time<result.end)onTime(time);});
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(event.key))return;event.preventDefault();if(['Enter',' '].includes(event.key))onBucket(result.buckets[selected],'load');else inspect(event.key==='Home'?0:event.key==='End'?result.buckets.length-1:selected+(event.key==='ArrowLeft'?-1:1));});
 return svg;
}
