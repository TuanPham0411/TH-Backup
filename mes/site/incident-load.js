import {incidentSeries} from './incident-analytics.js';
export const severityOrder=['Low','Medium','High','Critical','Unclassified'];
export const severityColors={Low:'#36b7a0',Medium:'#e9b44c',High:'#f18743',Critical:'#ef626e',Unclassified:'#94a3b8'};
const timestamp=value=>typeof value==='number'?value:Date.parse(value);
// Merge each ticket's intervals before sweeping: multiple reports must never
// inflate its simultaneous contribution. End events precede starts at a boundary.
export function incidentLoad(issues,options={}){
 const {start,end,now=Date.now(),continuePoints=true,department='All',issueType='All',severity='All'}=options;
 const filtered=issues.filter(i=>(department==='All'||(i.departmentId||'__none')===department)&&(issueType==='All'||(i.issueTypeId||'__none')===issueType)&&(severity==='All'||(severityOrder.includes(i.priority)?i.priority:'Unclassified')===severity));
 const {buckets}=incidentSeries([],{...options,frequency:'all'}),events=new Map(),entries=[],seen=new Set();let missing=0;
 const event=time=>{if(!events.has(time))events.set(time,{add:[],remove:[]});return events.get(time);};event(Number(start));event(Number(end));
 for(const [index,issue]of filtered.entries()){
  const id=issue.id??index;if(seen.has(id))continue;seen.add(id);
  const valid=(Array.isArray(issue.occurrences)?issue.occurrences:[]).flatMap(o=>{
   if(!o||!['point','range'].includes(o.kind)||!o.start||(o.kind==='range'&&!o.end))return [];
   const from=timestamp(o.start),actualEnd=o.kind==='range'?timestamp(o.end):from;
   if(!Number.isFinite(from)||!Number.isFinite(actualEnd)||actualEnd<from)return [];
   const to=o.kind==='point'&&continuePoints?Math.max(from,now):actualEnd;
   return [{start:from,end:to,kind:o.kind,reportedEnd:actualEnd}];
  });
  if(!valid.length){missing++;continue;}
  const visible=valid.filter(r=>r.start<end&&(r.end>=start));if(!visible.length)continue;
  const priority=severityOrder.includes(issue.priority)?issue.priority:'Unclassified';
  const ranges=visible.map(r=>({start:Math.max(Number(start),r.start),end:Math.min(Number(end),r.end===r.start?r.end+1:r.end)})).filter(r=>r.start<r.end).sort((a,b)=>a.start-b.start);
  const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}
  if(!merged.length)continue;
  const entry={id,issue,priority,ranges:merged,reported:visible};entries.push(entry);
  for(const r of merged){event(r.start).add.push(entry);event(r.end).remove.push(entry);}
 }
 const active=new Map(),segments=[],times=[...events.keys()].sort((a,b)=>a-b);let peak=0;
 for(let k=0;k<times.length-1;k++){
  const at=times[k],change=events.get(at);for(const e of change.remove)active.delete(e.id);for(const e of change.add)active.set(e.id,e);
  const counts=Object.fromEntries(severityOrder.map(p=>[p,0]));for(const e of active.values())counts[e.priority]++;
  const count=active.size;peak=Math.max(peak,count);segments.push({start:at,end:times[k+1],count,counts});
 }
 let cursor=0;
 for(const b of buckets){
  while(cursor<segments.length&&segments[cursor].end<=b.start)cursor++;
  b.count=0;b.starts=0;b.startCounts=Object.fromEntries(severityOrder.map(p=>[p,0]));b.tickets=[];b.counts=Object.fromEntries(severityOrder.map(p=>[p,0]));
  for(let j=cursor;j<segments.length&&segments[j].start<b.end;j++)if(segments[j].count>b.count){b.count=segments[j].count;b.counts=segments[j].counts;}
  for(const e of entries){if(e.ranges.some(r=>r.start<b.end&&r.end>b.start))b.tickets.push(e.issue);if(e.reported.some(r=>r.start>=b.start&&r.start<b.end)){b.starts++;b.startCounts[e.priority]++;}}
  b.matches=options.frequency==='high'?b.count>=Number(options.threshold??3):options.frequency==='low'?b.count<=Number(options.threshold??3):true;
 }
 return {segments,buckets,entries,peak,missing,total:entries.length,ranked:buckets.filter(b=>b.matches).sort((a,b)=>(options.frequency==='low'?a.count-b.count:b.count-a.count)||a.start-b.start)};
}
