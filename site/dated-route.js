import {placeRouteLabels,recoverRouteLabels} from './route-labels.js';
// Time is mapped to cumulative distance, including the bends, never to item index.
export function datedRoute(items,now=Date.now(),{labelHeights={}}={}){
 const present=new Date(now+7*3600000).toISOString().slice(0,10),endDate=item=>item.end||(item.date>present?item.date:present);
 const grouped=new Map(),add=(date,item,role)=>{const key=date;let point=grouped.get(key);if(!point){point={date,events:[]};grouped.set(key,point);}point.events.push({item,role});};
 for(const item of items){add(item.date,item,'start');if(item.kind!=='milestone')add(endDate(item),item,item.end?'end':'ongoing');}
 const points=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));if(!points.length)return{points:[],intervals:[],ticks:[],height:0};
 const min=Date.parse(points[0].date),max=Date.parse(points.at(-1).date),span=Math.max(86400000,max-min),rows=Math.max(2,Math.ceil(points.length/6),Math.ceil(span/(6*365.2425*86400000))),pitch=130,height=rows*pitch;
 const samples=[];let length=0;const push=(x,y)=>{const last=samples.at(-1);if(last)length+=Math.hypot(x-last.x,y-last.y);samples.push({x,y,length});};
 for(let row=0;row<rows;row++){const reverse=row%2,start=reverse?850:150,end=reverse?150:850,y=70+row*pitch;for(let i=0;i<=140;i++)push(start+(end-start)*i/140,y);if(row<rows-1)for(let i=1;i<=100;i++){const t=i/100;push(end+(reverse?-1:1)*38*Math.sin(Math.PI*t),y+pitch*(1-Math.cos(Math.PI*t))/2);}}
 const at=(fraction,offset=0)=>{const distance=Math.max(0,Math.min(1,fraction))*length;let lo=1,hi=samples.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].length<distance)lo=mid+1;else hi=mid;}const b=samples[lo],a=samples[lo-1],t=(distance-a.length)/Math.max(.001,b.length-a.length),dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1;return{x:a.x+dx*t+dy/n*offset,y:a.y+dy*t-dx/n*offset,distance};};
 const fraction=date=>(Date.parse(date)-min)/span;
 const path=(from=0,to=1,offset=0)=>{const count=Math.max(2,Math.ceil((to-from)*700));return Array.from({length:count+1},(_,i)=>{const p=at(from+(to-from)*i/count,offset);return`${i?'L':'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;}).join(' ');};
 const lanes=[];const intervals=items.filter(i=>i.kind!=='milestone').map(item=>{const start=fraction(item.date),end=fraction(endDate(item));let lane=lanes.findIndex(e=>e<=start);if(lane<0)lane=lanes.length;lanes[lane]=end;const offset=23+lane*9;return{item,start,end,lane,path:path(start,end,offset),a:at(start,offset),b:at(end,offset)};});
 // Keep captions in a bounded neighborhood of their actual date pins.
 // Solve nearby placements together instead of pushing conflicts across lanes.
 for(const point of points){Object.assign(point,at(fraction(point.date)));point.fraction=fraction(point.date);}
 const tracks=[];samples.forEach((p,index)=>{const next=samples[Math.min(index+1,samples.length-1)],prev=samples[Math.max(0,index-1)],dx=next.x-prev.x,dy=next.y-prev.y,n=Math.hypot(dx,dy)||1;for(const phase of intervals)if(p.length/length>=phase.start&&p.length/length<=phase.end){const offset=23+phase.lane*9;tracks.push({x:p.x+dy/n*offset,y:p.y-dx/n*offset});}});
 if(!placeRouteLabels(points,samples,{labelHeights,tracks}))recoverRouteLabels(points,samples,{labelHeights});
 const captions=points.map(point=>point.label);

 const ticks=[];for(let year=new Date(min).getUTCFullYear()+1;year<=new Date(max).getUTCFullYear();year++){const f=(Date.UTC(year,0,1)-min)/span;const p=at(f);const label=at(f,-22);ticks.push({year,...p,labelX:label.x,labelY:label.y,anchor:label.x<p.x-8?'end':label.x>p.x+8?'start':'middle'});}
 const originY=Math.min(0,...captions.map(p=>p.top-12));
 return{min,max,length,rows,originY,height:Math.max(height,...captions.map(p=>p.top+p.height+24))-originY,points,intervals,ticks,path:path(),at};
}
