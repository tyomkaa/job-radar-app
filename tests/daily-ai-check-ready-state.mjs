// Effective AI CHECK is a manual-review state, never a ready-to-apply count.
// Verify on actual model-backed Daily PICK, without network or browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const src=readFileSync('v22-daily.js','utf8');
const head=src.slice(src.indexOf('const DAILY_FEEDBACK_KEY='),
                     src.indexOf('function dailyTechnicalScope'));
const body=src.slice(src.indexOf('// A server-approved AI career disagreement'),
                     src.indexOf('const _dailyVisible='));
const progress=src.slice(src.indexOf('function dailySelectionProgress()'),
                         src.indexOf('function dailyQuotaTop()'));
assert(src.includes("level.textContent='CHECK · AI review'"));
assert(src.includes('AI recommends verifying requirements before applying'));

const sportano={
  id:'sportano',title:'AI Implementation & Automation Specialist',
  company:'Sportano.com',fit_score:77,recommendation_tier:'APPLY',
  ai_review:{verdict:'CHECK',explanation:'Verify precise must-haves.'}
};
const local={};
const kv=new Map();
const ctx=createContext({
 jobs:[sportano],meta:{generated_at:'2026-11-12T01:15:10Z',
  daily_pick_ids:['sportano'],daily_review_ids:[]},
 localDateKey:()=> '2026-11-12',today:()=> '2026-11-12',
 localStorage:{getItem:key=>kv.get(key)||null,setItem:(key,v)=>kv.set(key,v)},
 jobKey:j=>j.id,aiReviewFor:j=>local[j.id]||j.ai_review,
 aiReviews:()=>local, dailyFeedback:()=>({}),getTracker:()=>({}),
 dailyScore:j=>j.fit_score,dailyClassify:()=>({direction:'automation',boost:0}),
 isFirstFoundToday:()=>true,
});
runInContext(head+'\n'+body+'\n'+progress,ctx);
const ready=()=>ctx.dailySelectionProgress();
assert.equal(ctx.dailyRequiresCheck(sportano),true);
assert.equal(ready().ready,0);
assert.equal(ready().reviewOnly,1);
assert.equal(ready().total,1);
assert.equal(ctx.dailyRecommendations().length,1,'CHECK remains discoverable');

// A saved manual APPLY (not invented by automation) can override for the
// current device; a manual SKIP must still suppress the recommendation.
local.sportano={verdict:'APPLY'};
assert.equal(ready().ready,1);
assert.equal(ready().reviewOnly,0);
local.sportano={verdict:'SKIP'};
assert.equal(ready().aiSkipped,1);
assert.equal(ctx.dailyRecommendations().length,0);

// No job without AI review is wrongly called "requires CHECK".
local.sportano={verdict:'CHECK'};
assert.equal(ready().reviewOnly,1);
delete local.sportano;
sportano.ai_review=undefined;
assert.equal(ready().ready,1);
assert.equal(ready().reviewOnly,0);
console.log('Daily AI CHECK visibility PASS: no false ready-to-apply, overrides preserved');
