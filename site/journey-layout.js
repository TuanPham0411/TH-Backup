export function timelineEntries(value){
 return [...value.journey.map(item=>({...item,sourceGroup:'journey',kind:item.kind||'work'})),...value.education.filter(item=>item.date).map(item=>({...item,sourceGroup:'education',kind:'education'}))].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
export function routePoint(index){const row=Math.floor(index/3),local=index%3;return{x:row%2?880-local*380:120+local*380,y:100+row*260};}
export function routeAt(slot){const i=Math.floor(slot),t=slot-i,a=routePoint(i),b=routePoint(i+1);if(a.y===b.y)return{x:a.x+(b.x-a.x)*t,y:a.y};const direction=a.x>500?1:-1,control=a.x+140*direction,u=1-t;return{x:u*u*u*a.x+3*u*u*t*control+3*u*t*t*control+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*b.y};}
export function dateSlot(entries,time,now=Date.now()){
 const dates=entries.map(e=>Date.parse(e.date)),max=Math.max(now,...entries.map(e=>e.end?Date.parse(e.end):now),...dates);
 if(time<=dates[0])return 0;for(let i=0;i<dates.length-1;i++)if(time<dates[i+1])return i+(time-dates[i])/Math.max(1,dates[i+1]-dates[i]);return Math.min(entries.length,entries.length-1+(time-dates.at(-1))/Math.max(1,max-dates.at(-1)));
}
export function rangePath(start,end,lane=0){let d='';const step=.08;for(let slot=start;slot<end;slot+=step){const p=routeAt(slot);d+=(d?' L ':'M ')+p.x.toFixed(2)+' '+(p.y+8+lane*5).toFixed(2);}const p=routeAt(end);d+=(d?' L ':'M ')+p.x.toFixed(2)+' '+(p.y+8+lane*5).toFixed(2);return d;}

// Every dated chapter gets a separate lane; one shared linear time axis makes
// overlaps visible without sharing or crossing the chapter's actual bar.
export function phaseTimelineLayout(entries,now=Date.now()) {
 if(!entries.length)return {ticks:[],rows:[],now:0};
 const times=entries.flatMap(item=>[Date.parse(item.date),item.end?Date.parse(item.end):Math.max(now,Date.parse(item.date))]);
 const first=Math.min(...times),last=Math.max(...times),day=86400000;
 const padding=Math.max(30*day,(last-first)*.035),min=first-padding,max=last+padding,span=max-min;
 const position=time=>Math.max(0,Math.min(100,(time-min)/span*100));
 const firstYear=new Date(min).getUTCFullYear(),lastYear=new Date(max).getUTCFullYear(),step=Math.max(1,Math.ceil((lastYear-firstYear)/6));
 const ticks=[];for(let year=Math.ceil(firstYear/step)*step;year<=lastYear;year+=step){const value=Date.UTC(year,0,1);if(value>=min&&value<=max)ticks.push({label:String(year),position:position(value)});}
 if(!ticks.length)ticks.push({label:String(new Date(first).getUTCFullYear()),position:position(first)});
 return {min,max,ticks,now:position(now),rows:entries.map(item=>{
  const start=Date.parse(item.date),end=item.end?Date.parse(item.end):Math.max(now,start),point=item.kind==='milestone'||end===start;
  const days=Math.max(0,Math.round((end-start)/day)),months=Math.round(days/30.4375),years=Math.floor(months/12),remaining=months%12;
  const duration=point?'Milestone':months<1?`${Math.max(1,days)}d`:[years?`${years}y`:'',remaining?`${remaining}m`:''].filter(Boolean).join(' ');
  return {item,start,end,left:position(start),width:Math.max(0,position(end)-position(start)),point,ongoing:!item.end&&!point,duration};
 })};
}
