export const checkpointLayoutKey=point=>point.events.every(event=>event.role==='ongoing')?'present':point.date;
export function validateTimelineLayout(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>400)throw Error('Invalid timeline layout');
 for(const [key,position]of Object.entries(value)){
 if(key!=='present'&&(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(Date.parse(key))||new Date(key).toISOString().slice(0,10)!==key))throw Error('Invalid timeline checkpoint');
 if(!position||typeof position!=='object'||Array.isArray(position)||Object.keys(position).some(key=>!['dx','dy'].includes(key))||!Number.isFinite(position.dx)||!Number.isFinite(position.dy)||Math.abs(position.dx)>900||Math.abs(position.dy)>1000)throw Error('Invalid timeline label position');
 }
 return value;
}
export function applyTimelinePositions(layout,positions={}){
 for(const point of layout.points){const saved=positions[checkpointLayoutKey(point)];if(!saved)continue;const label=point.label;label.left=Math.max(label.width/2+8,Math.min(992-label.width/2,point.x+saved.dx));label.top=point.y+saved.dy;label.side=label.top+label.height/2<point.y?'above':'below';label.hidden=false;label.compact=false;label.manual=true;label.leader=labelLeader(point);}
 const labels=layout.points.filter(p=>!p.label.hidden).map(p=>p.label),bottom=layout.originY+layout.height;
 layout.originY=Math.min(layout.originY,...labels.map(label=>label.top-12));layout.height=Math.max(bottom,...labels.map(label=>label.top+label.height+24))-layout.originY;return layout;
}
export function labelLeader(point){const label=point.label,left=label.left-label.width/2,right=label.left+label.width/2;const x=Math.max(left,Math.min(right,point.x)),y=point.y<label.top?label.top-3:point.y>label.top+label.height?label.top+label.height+3:point.y,dx=x-point.x,dy=y-point.y,distance=Math.hypot(dx,dy)||1;return`M ${point.x+dx/distance*20} ${point.y+dy/distance*20} L ${x} ${y}`;}
