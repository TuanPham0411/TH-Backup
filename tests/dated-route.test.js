import {placeRouteLabels,recoverRouteLabels} from '../site/route-labels.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderedEvents,eventLabel} from '../site/timeline-events.js';
import {datedRoute} from '../site/dated-route.js';
const entry=(id,date,end,kind='work')=>({id,date,end,kind,title:id,media:[]});
test('route maps equal elapsed times to equal cumulative distances through bends',()=>{
 const route=datedRoute([entry('a','2020-01-01','2024-01-01'),entry('b','2021-01-01','2023-01-01')]);
 for(const f of [.1,.4,.7])assert.ok(Math.abs((route.at(f+.1).distance-route.at(f).distance)-route.length*.1)<.00001);
 const point=route.points.find(p=>p.date==='2021-01-01');assert.equal(point.fraction,(Date.parse(point.date)-route.min)/(route.max-route.min));assert.ok(route.path.includes('L'));assert.doesNotMatch(route.path,/NaN/);
});
test('each closed phase has two endpoints and simultaneous events share one checkpoint',()=>{
 const route=datedRoute([entry('training','2020-01-01','2022-01-01','education'),entry('job','2022-01-01','2024-01-01')]);
 assert.equal(route.points.length,3);const shared=route.points[1];assert.deepEqual(shared.events.map(e=>[e.item.id,e.role]),[['training','end'],['job','start']]);assert.equal(route.intervals.length,2);assert.equal(route.intervals[0].end,route.intervals[1].start);
});
test('concurrent phases have distinct external paths, ongoing phases stop at present',()=>{
 const now=Date.parse('2025-01-01');const route=datedRoute([entry('a','2020-01-01',''),entry('b','2021-01-01','2024-01-01')],now);
 assert.notEqual(route.intervals[0].lane,route.intervals[1].lane);assert.notEqual(route.intervals[0].path,route.intervals[1].path);assert.equal(route.points.at(-1).date,'2025-01-01');assert.equal(route.points.at(-1).events[0].role,'ongoing');assert.equal(route.intervals[0].end,1);
});
test('single-day milestones and empty data remain finite without inventing duration',()=>{
 assert.equal(datedRoute([]).height,0);const route=datedRoute([entry('m','2020-01-01','', 'milestone')]);assert.equal(route.points.length,1);assert.equal(route.intervals.length,0);assert.ok(Number.isFinite(route.points[0].x));
});

test('out-of-range chapters expand the calendar, road bends and duration traces automatically',()=>{
 const original=[entry('job','2020-01-01','2026-01-01')],initial=datedRoute(original);
 const earlier=datedRoute([entry('early','2000-01-01','2005-01-01'),...original]);
 const later=datedRoute([...original,entry('future','2045-01-01','2050-01-01')]);
 assert.ok(earlier.rows>initial.rows);assert.ok(later.rows>initial.rows);assert.ok(earlier.min<initial.min);assert.ok(earlier.height>initial.height);assert.ok(later.max>initial.max);assert.ok(later.height>initial.height);
 assert.equal(later.points.at(-1).date,'2050-01-01');assert.equal(later.intervals.at(-1).end,1);assert.ok(later.path.length>initial.path.length/2);assert.doesNotMatch(later.intervals.at(-1).path,/NaN/);
});
test('handoffs put Complete or Graduate before Start and use precise English phase labels',()=>{
 const events=[{item:{title:'Engineer',kind:'work'},role:'start'},{item:{title:'Training',kind:'education'},role:'end'},{item:{title:'Technician',kind:'work'},role:'end'}];
 const ordered=orderedEvents(events);assert.deepEqual(ordered.map(eventLabel),['Graduate','Complete','Start']);assert.equal(eventLabel({item:{kind:'work'},role:'end'}),'Complete');
});

test('checkpoint labels stay centered on their own dates and avoid overlapping text',()=>{
 const items=[entry('training','2016-01-01','2019-12-31','education'),entry('apprentice','2016-10-01','2019-09-01'),entry('technician','2019-09-01','2022-04-01'),entry('study','2022-01-01','2025-12-31','education'),entry('assistant','2022-04-01','2023-07-01'),entry('senior','2023-06-01','2025-03-01'),entry('support','2025-03-01','2026-07-01'),entry('engineer','2026-07-01','')];
 const route=datedRoute(items,Date.parse('2026-10-27'),{labelHeights:{'2022-04-01':130}});
 for(const point of route.points){const label=point.label;assert.ok(Math.abs(label.left-point.x)<=label.width/2+104);assert.ok(label.gap<=100);assert.ok(label.top+label.height<point.y||label.top>point.y);assert.ok(label.top>=route.originY);assert.ok(label.top+label.height<=route.originY+route.height);}
 assert.ok(route.points.find(p=>p.date==='2022-04-01').label.height>=130);
 for(let i=0;i<route.points.length;i++)for(let j=i+1;j<route.points.length;j++){const a=route.points[i].label,b=route.points[j].label;assert.ok(Math.abs(a.left-b.left)>=(a.width+b.width)/2||a.top+a.height<=b.top||b.top+b.height<=a.top);}
});
test('year labels sit close to the opposite side of the lane from phase traces',()=>{
 const route=datedRoute([entry('long','2010-01-01','2030-01-01')]);for(const tick of route.ticks){const f=(Date.UTC(tick.year,0,1)-route.min)/(route.max-route.min),phase=route.at(f,23),dot=(phase.x-tick.x)*(tick.labelX-tick.x)+(phase.y-tick.y)*(tick.labelY-tick.y);assert.ok(dot<0);assert.ok(Math.abs(Math.hypot(tick.labelX-tick.x,tick.labelY-tick.y)-22)<.001);}
});

test('screenshot regression: dense June/July milestones keep full captions locally without crossing lanes',()=>{
 const items=[entry('training','2016-10-01','2019-09-01','education'),entry('apprentice','2016-10-01','2019-09-01'),entry('technician','2019-09-01','2022-04-01'),entry('study','2022-10-20','2025-10-20','education'),entry('assistant','2022-04-01','2023-07-01'),entry('senior','2023-06-01','2025-03-01'),entry('support','2025-03-01','2026-07-01'),entry('engineer','2026-07-01','')];
 const names={training:'Lilama 2 International College of Technology',apprentice:'Apprentice · TGA dual training',technician:'Technician',study:'Ho Chi Minh City University of Technology',assistant:'Assistant Test Engineer',senior:'Senior Assistant Test Engineer',support:'Operational Technical Support Engineer',engineer:'Operational Technical Engineer'};for(const item of items)item.title=names[item.id];
 const route=datedRoute(items,Date.parse('2026-10-27'));
 for(const point of route.points){assert.equal(point.label.compact,false);assert.equal(point.label.hidden,undefined);assert.ok(point.label.gap<=100);const coordinates=point.label.leader.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);assert.equal(coordinates.length,6);assert.equal(coordinates[3],coordinates[5]);for(let segment=0;segment<2;segment++){const [ax,ay,bx,by]=coordinates.slice(segment*2,segment*2+4),dx=bx-ax,dy=by-ay;for(let i=0;i<=500;i++){const road=route.at(i/500);if(Math.abs(road.distance-point.distance)<=42)continue;const t=Math.max(0,Math.min(1,((road.x-ax)*dx+(road.y-ay)*dy)/(dx*dx+dy*dy||1)));assert.ok(Math.hypot(road.x-ax-dx*t,road.y-ay-dy*t)>=12,'neither leader segment may cut through another lane');}}}

});

test('new earlier and future checkpoints and automatic reset always retain their event captions',()=>{
 const items=[entry('early','1990-01-01','1991-01-01'),entry('job','2020-01-01','2026-01-01'),entry('future','2090-01-01','2100-01-01')];for(const now of ['2026-10-27','2026-10-28']){const route=datedRoute(items,Date.parse(now));assert.equal(route.points.length,6);assert.ok(route.points.every(point=>!point.label.hidden&&!point.label.compact&&point.label.height>0&&point.events.length));}
});

test('a failed global label placement recovers individual full descriptions instead of hiding all',()=>{
 const points=[{date:'2026-01-01',x:150,y:70,distance:0,events:[{role:'start',item:{title:'First phase'}}]},{date:'2026-01-02',x:150,y:80,distance:0,events:[{role:'start',item:{title:'Next phase'}}]}],road=Array.from({length:60},(_,i)=>({x:150,y:i*4,distance:1000}));assert.equal(placeRouteLabels(points,road),false);recoverRouteLabels(points,road);assert.ok(points.every(point=>point.label.recovered&&!point.label.hidden&&!point.label.compact&&point.label.height>0&&point.events[0].item.title));
});

test('touch diagram skips caption placement and saved-label space without changing the time domain',()=>{
 const items=[entry('job','2020-01-01','2026-01-01'),entry('study','2022-01-01','2025-01-01','education')],full=datedRoute(items),touch=datedRoute(items,Date.now(),{labels:false});assert.equal(touch.path,full.path);assert.deepEqual(touch.points.map(p=>[p.date,p.x,p.y]),full.points.map(p=>[p.date,p.x,p.y]));assert.ok(touch.points.every(p=>p.label.hidden&&p.label.leader===''));assert.ok(touch.height<full.height);
});
