import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTimelineLayout,applyTimelinePositions,checkpointLayoutKey,labelConnector} from '../site/manual-timeline-layout.js';
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

test('manual caption width and height are validated, applied and reset without touching event data',()=>{
 const positions={'2020-01-01':{dx:10,dy:50,width:280,height:120}};validateTimelineLayout(positions);const items=[{id:'job',date:'2020-01-01',end:'2024-01-01',title:'Engineer',kind:'work'}];const layout=applyTimelinePositions(datedRoute(items),positions);assert.equal(layout.points[0].label.width,280);assert.equal(layout.points[0].label.height,120);assert.equal(layout.points[0].label.sized,true);const reset=applyTimelinePositions(datedRoute(items),{});assert.ok(reset.points.every(p=>!p.label.hidden&&p.events.length));for(const position of [{dx:0,dy:0,width:10},{dx:0,dy:0,height:2000}])assert.throws(()=>validateTimelineLayout({present:position}));
});

test('manual callout connectors have a diagonal segment and a horizontal segment meeting the frame edge',()=>{
 for(const left of [80,220]){const point={x:150,y:150,label:{left,top:20,width:120,height:60}},connector=labelConnector(point);assert.equal(connector.elbow.y,connector.end.y);assert.equal(connector.end.y,50);assert.ok(connector.end.x===left-60||connector.end.x===left+60);assert.equal((connector.path.match(/ L /g)||[]).length,2);assert.ok(Math.abs(Math.hypot(connector.start.x-point.x,connector.start.y-point.y)-20)<.001);}
});
