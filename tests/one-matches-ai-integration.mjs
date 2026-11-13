// One Matches stream: no AI hallucination from a heuristic score and no tabs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const js=readFileSync('app-v12.js','utf8');
const html=readFileSync('index.html','utf8');
const block=js.slice(js.indexOf('function aiVerdict('),
                     js.indexOf('function recordSnapshot('));
assert(block.includes('function sortJobs('));
assert(block.includes('function getVisibleJobs('));
assert(html.includes('data-filter="ALL">Matches'));
assert(!html.includes('data-filter="DAILY"'));
assert(!html.includes('data-filter="FOCUS"'));
assert(html.includes('data-filter="UNSEEN"'));
assert(js.includes("AI: review pending"));
assert(js.includes("line.textContent = 'AI: ' + review.verdict"));
assert(!js.includes('line.innerHTML'),'AI model explanations cannot be HTML');

const j=(id,verdict,score=66)=>({
  id,company:'Example '+id,title:'Junior SQL Developer',
  location:'Warszawa',fit_score:score,
  ai_review:verdict?{verdict,explanation:'AI says CHECK'}:null
});
const records=[j('apply','APPLY',78),j('check','CHECK',69),
  j('pending',null,95),j('skip','SKIP',100),j('applied','APPLY',91),
  j('dismissed','CHECK',85)];
const tracking={'applied':{status:'APPLIED'}}, feedback={'dismissed':{reason:'not_my_direction'}};
const ctx=createContext({
  jobs:records,activeFilter:'ALL',sortMode:'BEST',
  getTracker:()=>tracking,seenIds:()=>new Set(),savedIds:()=>new Set(),
  jobKey:job=>job.id,aiReviewFor:job=>job.ai_review,
  dailyFeedback:()=>feedback,
  historyAsJobs:()=>[],dateValue:()=>0,isFirstFoundToday:()=>true,
  responseStatuses:()=>new Set(),today:()=>new Date().toISOString(),
});
runInContext(block,ctx);
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),
  ['apply','check','pending'],'model APPLY/CHECK before unreviewed; SKIP, already applied and dismissed hidden');
ctx.sortMode='NEWEST';
assert.equal(ctx.getVisibleJobs().length,3);
ctx.activeFilter='ALL';
assert.equal(ctx.aiVerdict(records[2]),null);
ctx.activeFilter='UNSEEN';
assert.equal(ctx.getVisibleJobs().length,6,'optional Unseen filter unchanged');
ctx.activeFilter='ALL';
records[0].ai_review={verdict:'SKIP',explanation:'AI changed'};
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),
  ['check','pending'],'fresh AI SKIP no longer advertised as match');
console.log('One Matches stream PASS: 1 home view, real AI verdict order, pending visible, SKIP/applied/dismissed hidden, safe text');
