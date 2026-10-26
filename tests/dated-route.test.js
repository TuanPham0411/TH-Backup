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
