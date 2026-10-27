import {datedRoute} from './dated-route.js';
import {addMilestoneBadges,orderedEvents,eventText} from './timeline-events.js';
const ns='http://www.w3.org/2000/svg',svg=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
export function renderMobileJourney(host,items,{openStory,dateLabel}){
 const layout=datedRoute(items,Date.now(),{labels:false}),hint=document.createElement('p'),canvas=document.createElement('div');host.className='journey-track dated-journey touch-timeline';hint.className='touch-timeline-hint';hint.textContent='Swipe timeline · tap a checkpoint for details';canvas.className='route-canvas';canvas.style.aspectRatio=`1000 / ${layout.height}`;host.append(hint,canvas);
 const art=svg('svg',{viewBox:`0 0 1000 ${layout.height}`,class:'journey-road','aria-hidden':'true'});for(const cls of ['road-shadow','road-base','road-lane'])art.append(svg('path',{d:layout.path,class:cls}));canvas.append(art);
 for(const interval of layout.intervals){const path=svg('path',{d:interval.path,class:'journey-duration'+(interval.item.kind==='education'?' education-duration':'' )});art.append(path);for(const [p,end]of [[interval.a,false],[interval.b,true]])art.append(svg('circle',{cx:p.x,cy:p.y,r:3,class:'journey-range-cap',style:`stroke:${interval.item.kind==='education'?'#b8a1ff':'#79d7c4'};fill:${end?'#0b1925':'#79d7c4'}`}));}
 for(const tick of layout.ticks){if(layout.points.some(point=>Math.hypot(tick.labelX-point.x,tick.labelY-point.y)<45))continue;const text=svg('text',{x:tick.labelX,y:tick.labelY,class:'route-year',style:`text-anchor:${tick.anchor}`,'dominant-baseline':'middle'});text.textContent=tick.year;art.append(text);}
 const markers=[];
 layout.points.forEach((point,index)=>{
 const events=orderedEvents(point.events),unique=[...new Map(events.map(e=>[e.item.sourceGroup+':'+e.item.id,e.item])).values()],labels=events.map(eventText),near=layout.points.some(other=>other!==point&&Math.hypot(other.x-point.x,other.y-point.y)<52),offset=near?(index%2?22:-22):0;
 const stop=document.createElement('div');stop.className='journey-stop route-checkpoint'+(unique.every(item=>item.kind==='education')?' education-stop':'');stop.style.setProperty('--checkpoint-x',point.x/10+'%');stop.style.setProperty('--checkpoint-y',point.y/layout.height*100+'%');stop.style.setProperty('--touch-pin-offset',offset+'px');stop.style.setProperty('--chapter-hue',unique.every(item=>item.kind==='education')?'270':'165');stop.dataset.date=point.date;
 const pin=document.createElement('button');pin.className='journey-pin';pin.type='button';pin.textContent=String(index+1).padStart(2,'0');pin.setAttribute('aria-label',point.date+': '+labels.join('; '));addMilestoneBadges(pin,events,document);
 pin.onclick=()=>openStory({...unique[0],title:point.date,date:point.date,end:point.date,kind:'milestone',checkpointEvents:events,subtitle:labels.join('\n'),description:unique.map(item=>`${item.title}\n${dateLabel(item)}\n${item.description}`).join('\n\n'),media:[...new Set(unique.flatMap(item=>item.media||[]))],tags:[...new Set(unique.flatMap(item=>item.tags||[]))],public:unique.every(item=>item.public!==false)});
 if(offset){const stem=svg('line',{x1:point.x,y1:point.y,x2:point.x,y2:point.y,class:'touch-pin-stem'});art.append(stem,svg('circle',{cx:point.x,cy:point.y,r:2.5,class:'route-year-dot'}));markers.push({stem,point,offset});}
 stop.append(pin);canvas.append(stop);
 });
 const fit=()=>{const scale=(canvas.clientWidth||720)/1000;for(const {stem,point,offset}of markers)stem.setAttribute('y2',point.y+offset/scale);};fit();const observer='ResizeObserver'in window?new ResizeObserver(fit):null;observer?.observe(canvas);return{dispose:()=>observer?.disconnect()};
}
