export const eventLabel=({item,role})=>role==='start'?'Start':role==='ongoing'?'Ongoing':item.kind==='education'?'Graduate':'Complete';
export const orderedEvents=events=>[...events].sort((a,b)=>(a.role==='end'?0:a.role==='start'?1:2)-(b.role==='end'?0:b.role==='start'?1:2));
// Content shared by a checkpoint stays explicit, without an invented group title.
export const eventText=event=>`${eventLabel(event)} - ${event.item.title}`;
export function eventLines(events,document){const list=document.createElement('div');list.className='checkpoint-event-list';let previous;for(const event of orderedEvents(events)){const line=document.createElement('span');line.className='checkpoint-event';line.textContent=eventText(event);if(previous?.role==='end'&&event.role!=='end')line.classList.add('phase-handoff');list.append(line);previous=event;}return list;}
