const overlaps=(a,b,pad=8)=>Math.abs(a.left-b.left)<(a.width+b.width)/2+pad&&a.top<b.top+b.height+pad&&a.top+a.height+pad>b.top;
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);};
export function placeRouteLabels(points,road,{labelHeights={},maxGap=100,tracks=[],compact=false}={}){
 const obstacles=road.concat(tracks);
 const options=points.map(point=>{
 const candidates=[];
 for(const width of (compact?[120,100]:[220,190,160])){
 const characters=Math.max(12,Math.floor((width-12)/5.6)),measured=labelHeights[point.date];
 const height=compact?34:Math.max(typeof measured==='object'?measured.height*Math.max(1,measured.width/width):measured||0,24+point.events.reduce((sum,e)=>sum+Math.ceil((e.item.title.length+12)/characters)*16+4,0)+(point.events.some(e=>e.role==='end')&&point.events.some(e=>e.role==='start')?12:0));
 for(const shift of [0,-36,36,-72,72])for(const gap of [36,52,68,84,100].filter(n=>n<=maxGap))for(const side of ['below','above']){
 const left=point.x+shift;if(left-width/2<8||left+width/2>992)continue;
 const top=side==='above'?point.y-gap-height:point.y+gap,box={left,top,width,height,side,gap},x1=left-width/2,x2=left+width/2;
 if(points.some(p=>p.x>x1-18&&p.x<x2+18&&p.y>top-22&&p.y<top+height+22))continue;
 if(obstacles.some(p=>p.x>x1-8&&p.x<x2+8&&p.y>top-12&&p.y<top+height+12))continue;
 const a={x:point.x,y:point.y+(side==='above'?-20:20)},b={x:left,y:side==='above'?top+height+3:top-3};
 // A leader may leave its own checkpoint, but must never cross another lane.
 if(road.some(p=>Math.abs(p.distance-point.distance)>42&&segmentDistance(p,a,b)<13))continue;
 box.compact=compact;box.leader=`M ${a.x} ${a.y} L ${b.x} ${b.y}`;box.cost=gap*2+Math.abs(shift)*.7+(220-width)*.35;candidates.push(box);
 }
 }
 return candidates.sort((a,b)=>a.cost-b.cost);
 });
 const assigned=new Map();let attempts=0;
 function solve(){if(assigned.size===points.length)return true;if(++attempts>16000)return false;
 let next,available;for(let i=0;i<points.length;i++){if(assigned.has(i))continue;const choices=options[i].filter(box=>![...assigned.values()].some(other=>overlaps(box,other)));if(!choices.length)return false;if(!available||choices.length<available.length){next=i;available=choices;}}
 for(const box of available){assigned.set(next,box);if(solve())return true;assigned.delete(next);}return false;
 }
 if(!solve())return false;
 points.forEach((point,index)=>point.label=assigned.get(index));return true;
}

// Recover labels one at a time if a dense cluster cannot satisfy the global
// solver. A single conflict must never hide every checkpoint description.
export function recoverRouteLabels(points,road,{labelHeights={}}={}){
 const placed=[];
 for(const point of points){const width=190,measured=labelHeights[point.date],height=Math.max(typeof measured==='object'?measured.height:measured||0,28+point.events.reduce((n,event)=>n+Math.ceil((event.item.title.length+12)/30)*17+4,0));let best;
 for(const shift of [0,-36,36,-72,72])for(const gap of [36,52,68,84,100])for(const side of ['above','below']){
 const left=Math.max(width/2+8,Math.min(992-width/2,point.x+shift)),top=side==='above'?point.y-gap-height:point.y+gap,a={x:point.x,y:point.y+(side==='above'?-20:20)},b={x:left,y:side==='above'?top+height+3:top-3},box={left,top,width,height,side,gap,compact:false,recovered:true,leader:`M ${a.x} ${a.y} L ${b.x} ${b.y}`};
 const collision=placed.reduce((sum,other)=>sum+(overlaps(box,other)?1:0),0),cross=road.some(p=>Math.abs(p.distance-point.distance)>42&&segmentDistance(p,a,b)<13),textRoad=road.some(p=>Math.abs(p.x-left)<width/2+8&&p.y>top-8&&p.y<top+height+8);
 const cost=collision*100000+Number(cross)*20000+Number(textRoad)*10000+gap+Math.abs(shift)*.6;if(!best||cost<best.cost)best={...box,cost};
 }
 point.label=best;placed.push(best);
 }
}
