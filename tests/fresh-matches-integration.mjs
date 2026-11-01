// Real JS integration tests: never call Cloudflare or the job boards.
import assert from 'node:assert/strict';
import {createContext, runInContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const entries=[
{id:'fresh-check',title:'AI Operations Specialist',company:'A'},
{id:'fresh-skip',title:'Workflow Automation Specialist',company:'B'},
{id:'fresh-applied',title:'Junior Python Developer',company:'C'},
{id:'old',title:'IT Support',company:'D'},
];
const ctx=createContext({
  jobs:entries,
  meta:{fresh_opportunity_ids:['fresh-check','fresh-skip','fresh-applied']},
  activeFilter:'FRESH',
  jobKey:j=>j.id,
  getTracker:()=>({'fresh-applied':{status:'applied'}}),
  dailyFeedback:()=>({}),
  aiReviewFor:j=>j.id==='fresh-skip'?{verdict:'SKIP'}:null,
  getVisibleJobs:()=>['fallback'],
  render:()=>{},
  document:{querySelector:()=>null,createElement:()=>({
    append:()=>{},replaceChildren:()=>{},hidden:false,
    textContent:'',className:'',id:''
  })},
});
runInContext(readFileSync('v28-fresh-opportunities.js','utf8'),ctx);
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),['fresh-check']);
ctx.activeFilter='ALL';
assert.deepEqual(Array.from(ctx.getVisibleJobs()),['fallback']);
assert.equal(ctx.jobs.length,4);
console.log('New matches JS integration test PASS: server IDs, device applied state, AI SKIP, non-fresh exclusion, delegation');
