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
