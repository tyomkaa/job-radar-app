// A server-approved AI disagreement stays visible only as CHECK. The user's
// on-device SKIP overrides it. No new AI calls or private profile data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const daily=readFileSync('v22-daily.js','utf8');
const ai=readFileSync('v23-ai-review.js','utf8');
const prefix=daily.slice(daily.indexOf('const DAILY_FEEDBACK_KEY='),daily.indexOf('function dailyTechnicalScope'));
const recommendation=daily.slice(daily.indexOf('// A server-approved AI career disagreement'),
                                  daily.indexOf('const _dailyVisible='));
const postfilter=ai.slice(ai.indexOf('const _v23DailyScore='),
                         ai.indexOf('const _v23Render='));
assert(postfilter.includes('dailyNeedsManualCheck'));
assert(daily.includes('CHECK · AI career disagreement — not ready-to-apply'));
const item={id:'tech',title:'Junior IT Project Specialist',company:'Example',fit_score:76,
    recommendation_tier:'APPLY',ai_review:{verdict:'SKIP',explanation:'No Python automation'}};
const unrelated={id:'bad',title:'Unrelated role',fit_score:69,ai_review:{verdict:'SKIP'}};
const local={},storage=new Map();
const ctx=createContext({
  jobs:[item,unrelated],meta:{generated_at:'2026-11-04T14:00:00Z',
    daily_pick_ids:['tech','bad'],daily_review_ids:['tech']},
  localDateKey:()=> '2026-11-04',today:()=> '2026-11-04',
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  jobKey:j=>j.id,aiReviews:()=>local,
  aiReviewFor:j=>local[j.id]||j.ai_review,
  dailyFeedback:()=>({}),getTracker:()=>({}),
  dailyScore:j=>j.fit_score,dailyClassify:()=>({direction:'automation',boost:0}),
});
runInContext(prefix+'\n'+recommendation+'\n'+postfilter,ctx);
const ids=()=>Array.from(ctx.dailyRecommendations(),x=>x.job.id);
assert.deepEqual(ids(),['tech'],'only disputed server-approved job enters Daily');
assert.equal(ctx.dailyNeedsManualCheck(item),true);
assert.equal(ctx.dailyNeedsManualCheck(unrelated),false);
local.tech={verdict:'SKIP'};
assert.deepEqual(ids(),[],'manual local SKIP must hide');
assert.equal(ctx.dailyNeedsManualCheck(item),false);
local.tech={verdict:'CHECK'};
assert.deepEqual(ids(),['tech'],'manual CHECK should leave item visible');
delete local.tech;
ctx.meta.daily_review_ids=[];
assert.deepEqual(ids(),[],'no server approval means default SKIP veto');
ctx.meta.daily_review_ids=['tech'];
assert.deepEqual(ids(),['tech']);
console.log('Daily manual CHECK + AI SKIP override integration PASS');
