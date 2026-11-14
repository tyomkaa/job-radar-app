// A blocked source's old listings remain visible but must not lead Matches.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

const app=readFileSync('app-v12.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('styles-v29-compact-filters.css','utf8');
const block=app.slice(app.indexOf('function cvSupportedAiSkip('),
                      app.indexOf('function recordSnapshot('));
assert(block.includes('function isSourceUnverified('));
assert(app.includes('notice.textContent ='));
assert(app.includes('Confirm the vacancy is still open before applying.'));
assert(!app.includes('notice.innerHTML'));
assert(css.includes('.source-stale-note'));
assert(html.includes('data-filter="ALL">Matches'));
assert(!html.includes('data-filter="STILL_LISTED"'));
const rows=[
  {id:'stale', title:'Junior Python',company:'Old',location:'Warszawa',
   fit_score:99,published_at:'2026-11-14T16:00:00Z',
   ai_review:{verdict:'APPLY'},source_unverified_since:'2026-11-14T09:00:00Z',
   source_last_seen_at:'2026-11-13T08:00:00Z'},
  {id:'fresh-check',title:'Junior SQL',company:'New',location:'Warszawa',
   fit_score:65,published_at:'2026-11-14T13:00:00Z',
   ai_review:{verdict:'CHECK'}},
  {id:'fresh-pending',title:'Junior Software',company:'Also new',location:'Warszawa',
   fit_score:0,published_at:'2026-11-14T12:00:00Z'},
];
const ctx=createContext({
  jobs:rows, meta:{ai_disputed_focus_ids:[]},
  activeFilter:'ALL', sortMode:'BEST',
  getTracker:()=>({}), seenIds:()=>new Set(), savedIds:()=>new Set(),
  jobKey:job=>job.id, aiReviewFor:job=>job.ai_review,
  dailyFeedback:()=>({}), historyAsJobs:()=>[],
  dateValue:job=>Date.parse(job.published_at||''),
});
runInContext(block,ctx);
assert.equal(ctx.isSourceUnverified(rows[0]),true);
assert.equal(ctx.isSourceUnverified(rows[1]),false);
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),
                 ['fresh-check','fresh-pending','stale']);
ctx.sortMode='NEWEST';
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),
                 ['fresh-check','fresh-pending','stale']);
assert.equal(rows[0].ai_review.verdict,'APPLY',
             'historical model verdict is not secretly modified');
console.log('Partial-source carryover PASS: preserved but unverified source offer shown last with clear warning; no new tabs');
