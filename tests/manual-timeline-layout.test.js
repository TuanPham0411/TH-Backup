import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTimelineLayout,applyTimelinePositions,checkpointLayoutKey} from '../site/manual-timeline-layout.js';
import {datedRoute} from '../site/dated-route.js';
import {normalizePortfolio,defaultPortfolio,publicPortfolio} from '../site/portfolio-model.js';
test('manual label positions leave the chronological road, pins and phases unchanged',()=>{
 const items=[{id:'job',date:'2020-01-01',end:'2024-01-01',title:'Engineer',kind:'work'}],layout=datedRoute(items),road=layout.path,pins=layout.points.map(p=>({x:p.x,y:p.y})),phase=layout.intervals[0].path;
 applyTimelinePositions(layout,{'2020-01-01':{dx:40,dy:-120}});assert.equal(layout.path,road);assert.equal(layout.intervals[0].path,phase);assert.deepEqual(layout.points.map(p=>({x:p.x,y:p.y})),pins);assert.equal(layout.points[0].label.left,layout.points[0].x+40);assert.equal(layout.points[0].label.top,layout.points[0].y-120);assert.equal(layout.points[0].label.manual,true);
});
test('ongoing checkpoint layout remains attached when the calendar day changes',()=>{
 const items=[{id:'job',date:'2020-01-01',end:'',title:'Engineer',kind:'work'}];for(const day of ['2026-10-27','2026-10-28']){const layout=datedRoute(items,Date.parse(day));assert.equal(checkpointLayoutKey(layout.points.at(-1)),'present');applyTimelinePositions(layout,{present:{dx:0,dy:75}});assert.equal(layout.points.at(-1).label.top,layout.points.at(-1).y+75);}
});
test('layout validation rejects unsafe keys, invalid coordinates and excessive positions',()=>{
 validateTimelineLayout({'2020-01-01':{dx:0,dy:-100},present:{dx:40,dy:80}});for(const value of [[],null,{'2020-02-31':{dx:1,dy:1}},{foo:{dx:0,dy:0}},{present:{dx:Infinity,dy:0}},{present:{dx:901,dy:0}},{present:{dx:0,dy:1001}},{present:{dx:0,dy:0,html:'bad'}}])assert.throws(()=>validateTimelineLayout(value));
});
test('public output removes positions belonging only to private milestone dates',()=>{
 const value=normalizePortfolio(defaultPortfolio);value.journey.push({id:'private-date',date:'2001-02-03',end:'2002-03-04',title:'Private',subtitle:'',description:'',tags:[],media:[],public:false});value.timelineLayout={'2001-02-03':{dx:10,dy:20},'2016-10-01':{dx:0,dy:60}};const visible=publicPortfolio(value);assert.equal(visible.timelineLayout['2001-02-03'],undefined);assert.deepEqual(visible.timelineLayout['2016-10-01'],{dx:0,dy:60});
});
