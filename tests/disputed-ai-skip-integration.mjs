// Browser-side conflict guard: manual user SKIP wins over server's dispute flag.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const job={id:'n1',title:'Junior EPM / BI Engineer',company:'FLEXI',
  ai_review:{verdict:'SKIP'},fit_score:74,work_mode:'Hybrid',location:'Warszawa'};
const plain={id:'s1',title:'Weak junior BI candidate',company:'Other',
  ai_review:{verdict:'SKIP'},fit_score:64,work_mode:'Hybrid',location:'Warszawa'};
const local={};
const ctx=createContext({
  // No initial render: test only shortlist and decision precedence.
  jobs:[],meta:{focus_job_ids:['n1','s1'],ai_disputed_focus_ids:['n1']},
  getTracker:()=>({}),dailyFeedback:()=>({}),aiReviews:()=>local,
  jobKey:j=>j.id,aiReviewFor:j=>local[j.id]||j.ai_review,
  tierFor:()=> 'APPLY',hasInterestTag:()=>false,recommendCv:()=>null,
  cvDefaultId:()=>'',getVisibleJobs:()=>[],render:()=>{},
  document:{
    querySelector:()=>null,
    createElement:()=>({id:'',className:'',hidden:false,
      append:()=>{},replaceChildren:()=>{}}),
  },
});
runInContext(readFileSync('v21-focus-cv.js','utf8'),ctx);
ctx.jobs.push(job, plain);
assert.equal(ctx.v21DisputedAiSkip(job),true);
assert.deepEqual(Array.from(ctx.v21FocusList(),x=>x.id),['n1']);
local.n1={verdict:'SKIP'};
assert.equal(ctx.v21DisputedAiSkip(job),false);
assert.deepEqual(Array.from(ctx.v21FocusList(),x=>x.id),[]);
local.n1={verdict:'CHECK'};
assert.deepEqual(Array.from(ctx.v21FocusList(),x=>x.id),['n1']);
ctx.meta.ai_disputed_focus_ids=[];
assert.equal(ctx.v21DisputedAiSkip(job),false);
local.n1={verdict:'SKIP'};
assert.deepEqual(Array.from(ctx.v21FocusList(),x=>x.id),[]);
assert.equal(ctx.v21DisputedAiSkip(plain),false);
console.log('Disputed AI SKIP guard PASS: only server-approved strong jobs; local SKIP wins');
