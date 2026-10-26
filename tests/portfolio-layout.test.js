import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultPortfolio,normalizePortfolio,publicPortfolio,referencedMedia,validatePortfolio} from '../site/portfolio-model.js';
import {timelineEntries,routePoint,dateSlot,rangePath} from '../site/journey-layout.js';
test('education is included in the dated journey and legacy year precision is explicit',()=>{
 const value=normalizePortfolio(defaultPortfolio),entries=timelineEntries(value);
 assert.equal(entries.length,value.journey.length+value.education.length);
 assert.equal(entries.filter(e=>e.kind==='education').length,2);
 assert.equal(value.education[0].datePrecision,'year');assert.equal(value.education[0].date,'2022-01-01');assert.equal(value.education[0].end,'2025-12-31');
 assert.deepEqual(entries.map(e=>e.date),entries.map(e=>e.date).toSorted());validatePortfolio(value);
});
test('duration geometry follows the winding road from start to end, including turns',()=>{
 assert.deepEqual(routePoint(0),{x:120,y:100});assert.deepEqual(routePoint(3),{x:880,y:360});
 const entries=[{date:'2020-01-01',end:'2021-01-01'},{date:'2022-01-01',end:'2023-01-01'},{date:'2024-01-01',end:''}];
 const slot=dateSlot(entries,Date.parse('2021-01-01'),Date.parse('2026-01-01'));assert.ok(slot>0&&slot<1);
 const curve=rangePath(2,3.5,1);assert.ok(curve.startsWith('M 880.00 113.00'));assert.match(curve,/373\.00/);assert.doesNotMatch(curve,/NaN/);
});
test('image description media inherits parent visibility and cycles are bounded',()=>{
 const value=normalizePortfolio(defaultPortfolio);value.family=[{id:'private',title:'Private',subtitle:'',description:'',tags:[],media:['private-img'],public:false}];
 value.mediaDescriptions={'private-img':{title:'Private description',description:'Do not expose',media:['private-video']},'asset:/images/profile.webp':{title:'Avatar',description:'Public',media:['public-gif']},'public-gif':{title:'Cycle',description:'',media:['asset:/images/profile.webp']}};value.mediaTypes={'private-img':'image/jpeg','private-video':'video/mp4','public-gif':'image/gif'};
 const visible=publicPortfolio(value);assert.equal(visible.mediaDescriptions['private-img'],undefined);assert.equal(visible.mediaTypes['private-video'],undefined);assert.equal(visible.mediaTypes['public-gif'],'image/gif');assert.ok(referencedMedia(visible).has('public-gif'));assert.equal(referencedMedia(visible).has('private-video'),false);
});
test('title styles reject unsafe fonts, invalid sizes and arbitrary CSS colors',()=>{
 const value=normalizePortfolio(defaultPortfolio);value.titleStyles={'profile-name':{font:'Georgia',size:45,color:'#336699'}};validatePortfolio(value);
 for(const style of [{font:'url(https://evil.test/font)'},{size:-2},{size:300},{color:'red;display:none'}])assert.throws(()=>validatePortfolio({...value,titleStyles:{'profile-name':style}}));
});
test('individual toolkit skills can be edited and hidden separately from skill categories',()=>{
 const value=normalizePortfolio(defaultPortfolio);assert.ok(value.toolkit.some(e=>e.title==='Python'));
 const skill=value.toolkit.find(e=>e.title==='Python');skill.title='Python tools';skill.public=false;assert.equal(publicPortfolio(value).toolkit.some(e=>e.id===skill.id),false);
});
