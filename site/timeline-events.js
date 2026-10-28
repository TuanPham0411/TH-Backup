export const phaseKey=item=>`${item.sourceGroup||item.group||'journey'}:${item.id}`;
export const eventLabel=({item,role})=>role==='start'?'Start':role==='ongoing'?'Ongoing':item.kind==='education'?'Graduate':'Complete';
export const orderedEvents=events=>[...events].sort((a,b)=>(a.role==='end'?0:a.role==='start'?1:2)-(b.role==='end'?0:b.role==='start'?1:2));
// Content shared by a checkpoint stays explicit, without an invented group title.
export const eventText=event=>`${eventLabel(event)} - ${event.item.title}`;
export function eventLines(events,document){const list=document.createElement('div');list.className='checkpoint-event-list';let previous;for(const event of orderedEvents(events)){const line=document.createElement('span');line.className='checkpoint-event';line.dataset.phase=phaseKey(event.item);line.textContent=eventText(event);if(previous?.role==='end'&&event.role!=='end')line.classList.add('phase-handoff');list.append(line);previous=event;}return list;}

export function addMilestoneBadges(pin,events,document){
 const complete=events.some(event=>event.role==='end'&&event.item.kind!=='education'),graduate=events.some(event=>event.role==='end'&&event.item.kind==='education'),ns='http://www.w3.org/2000/svg';
 const shape=(tag,attrs)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
 if(complete){pin.classList.add('has-complete');const badge=shape('svg',{viewBox:'0 0 24 24',class:'milestone-border-badge complete-badge','aria-hidden':'true',focusable:'false'});badge.append(shape('path',{d:'M12 2.5 14.9 8.4 21.5 9.3 16.8 13.9 17.9 20.5 12 17.4 6.1 20.5 7.2 13.9 2.5 9.3 9.1 8.4Z'}));pin.append(badge);}
 if(graduate){pin.classList.add('has-graduate');const badge=shape('svg',{viewBox:'0 0 24 24',class:'milestone-border-badge graduate-badge','aria-hidden':'true',focusable:'false'});badge.append(shape('path',{d:'M11 21C2 18 2 8 7 3M13 21C22 18 22 8 17 3',class:'laurel-stem'}));for(const [x,y,angle]of [[5,6,-35],[3.8,10,-55],[5,14,-65],[7.5,18,-65],[19,6,35],[20.2,10,55],[19,14,65],[16.5,18,65]])badge.append(shape('ellipse',{cx:x,cy:y,rx:'1.65',ry:'3.1',transform:`rotate(${angle} ${x} ${y})`}));badge.append(shape('path',{d:'M9 21 12 19.5 15 21',class:'laurel-stem'}));pin.append(badge);}
}
