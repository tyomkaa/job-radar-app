// Regression: a new backend feed on the SAME local date must replace stale
// Daily IDs without deleting user actions. No network or browser required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const code=readFileSync('v22-daily.js','utf8');
const prefix=code.slice(code.indexOf("const DAILY_FEEDBACK_KEY="),
                        code.indexOf("function dailyTechnicalScope"));
const selection=code.slice(code.indexOf("// A server-approved AI career disagreement"),
                           code.indexOf("const _dailyVisible="));
assert(prefix.includes('feed_revision:dailyFeedRevision()'));
assert(selection.includes('const snapshot=dailySnapshot()'));
const kv=new Map();
const rejected=new Set();
const jobs=['a','b','c'].map(id=>({id,title:'Python Automation '+id,fit_score:75}));
const ctx=createContext({
  jobs,meta:{generated_at:'2026-11-03T07:30:00Z',daily_pick_ids:['a','b']},
  localDateKey:()=> '2026-11-03',today:()=> '2026-11-03',
  localStorage:{
    getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v),
  },
  jobKey:j=>j.id,
  dailyFeedback:()=>Object.fromEntries([...rejected].map(id=>[id,{reason:'Not for me'}])),
  getTracker:()=>({}),aiReviewFor:()=>null,
  dailyScore:j=>j.fit_score,
  dailyClassify:()=>({direction:'automation',boost:0}),
});
runInContext(prefix+'\n'+selection,ctx);
const ids=()=>Array.from(ctx.dailyRecommendations(),x=>x.job.id);
assert.deepEqual(ids(),['a','b']);
assert.equal(ctx.dailySnapshot()?.feed_revision,'2026-11-03T07:30:00Z');
// A second render of the identical feed must remain stable.
assert.deepEqual(ids(),['a','b']);
// A new real discovery run on the same day replaces server recommendation IDs.
ctx.meta.generated_at='2026-11-03T09:30:00Z';
ctx.meta.daily_pick_ids=['b','c'];
assert.equal(ctx.dailySnapshot(),null);
assert.deepEqual(ids(),['b','c']);
assert.equal(ctx.dailySnapshot()?.feed_revision,'2026-11-03T09:30:00Z');
// Local feedback remains in effect after feed updates; don't refill with a
// dismissed vacancy or silently restore an earlier snapshot.
rejected.add('b');
assert.deepEqual(ids(),['c']);
// No new feed: the same IDs remain stable, irrespective of browser refresh.
assert.deepEqual(ids(),['c']);
// Pre-upgrade snapshots lack a revision and must be replaced, not reused.
kv.set('jobRadarDailySnapshotV3',JSON.stringify({
  day:'2026-11-03',keys:['a'],created_at:'2026-11-03T07:00:00Z'
}));
assert.equal(ctx.dailySnapshot(),null);
assert.deepEqual(ids(),['c']);
console.log('Daily feed revision integration PASS: same-day updates, stable repeat, feedback preserved');
