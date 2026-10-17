import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activitySeries,resolutionSummary,submissionCohort} from '../mes/site/analytics.js';
const now=new Date('2026-10-17T12:00:00Z').getTime();
const day=86400000;
test('activity uses selected horizon, counts resolution independently and bounds chart density',()=>{
 const issues=[{createdAt:now-45*day,resolvedAt:now-day},{createdAt:now-2*day},{createdAt:now+day}];
 const series=activitySeries(issues,'7',now);
 assert.equal(series.length,7);assert.equal(series.reduce((a,b)=>a+b.created,0),1);assert.equal(series.reduce((a,b)=>a+b.resolved,0),1);
 assert.ok(activitySeries(issues,'90',now).length<=12);
 assert.equal(activitySeries(issues,'all',now).reduce((a,b)=>a+b.created,0),2);
 assert.equal(activitySeries([],'all',now).length,7);
});
test('resolution statistics exclude invalid durations and distinguish aging backlog',()=>{
 const summary=resolutionSummary([{status:'Resolved',createdAt:now-2*day,resolvedAt:now-day},{status:'Closed',createdAt:now},{status:'New',createdAt:now-9*day},{status:'In progress',createdAt:now-day}],now);
 assert.equal(summary.rate,50);assert.equal(summary.averageHours,24);assert.equal(summary.aged,1);assert.equal(summary.pending.length,2);
 assert.equal(resolutionSummary([]).averageHours,null);
});

test('submission cohort matches calendar-day activity boundaries',()=>{
 const issues=[{createdAt:Date.parse('2026-10-10T18:00:00Z')},{createdAt:Date.parse('2026-10-11T00:00:00Z')},{createdAt:now+day}];
 assert.equal(submissionCohort(issues,'7',now).length,1);
 assert.equal(activitySeries(issues,'7',now).reduce((sum,bin)=>sum+bin.created,0),1);
});
