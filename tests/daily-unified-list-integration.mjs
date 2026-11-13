// Daily is a SINGLE list. No extra tabs or stacked sub-sections.
// This test exercises older full cards + unverified source-card rows, without
// browser, network, Cloudflare or OpenAI calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync('v22-daily.js','utf8');
const html=readFileSync('index.html','utf8');
const serviceWorker=readFileSync('service-worker-v12.js','utf8');
assert(!html.includes('v30-manual-review-leads.js'));
assert(!html.includes('v31-still-listed.js'));
assert(!html.includes('styles-v30-manual-leads.css'));
assert(!serviceWorker.includes("'/v30-manual-review-leads.js'"));
assert(!serviceWorker.includes("'/v31-still-listed.js'"));
assert(serviceWorker.includes('v41-one-matches'));
assert(html.includes('data-filter="ALL"'),'single Matches stream must remain');
assert(!html.includes('data-filter="DAILY"')&&!html.includes('data-filter="FOCUS"'),
       'Legacy Daily/Focus must not return as separate tabs');
assert(!html.includes('id="manualReviewLeads"'));
assert(!html.includes('id="stillListedReview"'));
assert(source.includes("dailyDecorateAdditionalCards()"));
assert(source.includes("dailyStillListedJobs()"));

const helpers=source.slice(source.indexOf('// One Daily list, three honestly labelled'),
                           source.indexOf('function dailyRecommendations()'));
const visible=source.slice(source.indexOf('const _dailyVisible=getVisibleJobs;'),
                           source.indexOf('function dailySelectionProgress()'));
const output=source.slice(source.indexOf('function dailyDecorateAdditionalCards()'),
                          source.indexOf('function dailyRecommendations()'));
assert(!output.includes('innerHTML'),'new Daily rows must use inert DOM text');
assert(!output.includes('createElement("section")'),'no separate new section');

class FakeEl {
  constructor(tag='div'){
    this.tag=tag;this.children=[];this.className='';this.id='';
    this.dataset={};this.listeners={};this.textContent='';this.hidden=false;
    this.classList={
      add:(...names)=>{this.className+=' '+names.join(' ')},
      remove:(...names)=>{for(const n of names)this.className=this.className.replace(n,'')}
    };
  }
  appendChild(el){this.children.push(el);el.parent=this;return el}
  replaceChildren(...els){this.children=[...els]}
  querySelector(selector){
    const cls=selector.startsWith('.')?selector.slice(1):null;
    return this.children.find(x=>cls&&x.className.split(' ').includes(cls))||null;
  }
  addEventListener(name,callback){this.listeners[name]=callback}
  insertAdjacentElement(where,el){
    if(where==='afterend'&&this.parent){
      const i=this.parent.children.indexOf(this);
      this.parent.children.splice(i+1,0,el);
      el.parent=this.parent;
    }else{this.children.push(el);el.parent=this}
  }
  remove(){this.removed=true}
}
const main=new FakeEl('div');
main.id='jobs';
const oldCard=new FakeEl('article');
oldCard.className='job-card';
oldCard.dataset.jobId='older';
const label=new FakeEl('span');label.className='level tier-possible';
const actions=new FakeEl('div');actions.className='actions';
oldCard.appendChild(label);oldCard.appendChild(actions);main.appendChild(oldCard);

const p={
 id:'priority',title:'AI Automation Specialist',company:'Main',
 url:'https://justjoin.it/job-offer/priority',
 contract:'Umowa o pracę',seniority:'junior',
 recommendation_tier:'APPLY',experience_required_years:0
};
const old={
 id:'older',title:'Junior Marketing Automation Specialist',company:'Publicis',
 url:'https://www.pracuj.pl/praca/junior-marketing-automation,oferta,1001',
 contract:'Umowa o pracę',seniority:'junior',
 first_found_at:'2026-10-31T07:49:00Z',
 recommendation_tier:'POSSIBLE',experience_required_years:1
};
const mid={...old,id:'mid',seniority:'junior, mid',url:'https://justjoin.it/job-offer/mid'};
const b2b={...old,id:'b2b',contract:'B2B only',url:'https://justjoin.it/job-offer/b2b'};
const skip={...old,id:'skip',ai_review:{verdict:'SKIP'},url:'https://justjoin.it/job-offer/skip'};
const jobs=[p,old,mid,b2b,skip];
const uopLead={
 title:'Junior WEBCON Developer',company:'VINCI',
 url:'https://www.pracuj.pl/praca/junior-webcon-developer,oferta,9002',
 location:'Warszawa',work_mode:'Hybrid',
 board_contract_unverified:'Umowa o pracę / Employment contract',
 board_seniority_unverified:'junior',review_status:'UNVERIFIED',
 board_skills_unverified:['SQL','<script>alert(1)</script>']
};
const unknown={
 title:'Junior Integration Developer',company:'Other',
 url:'https://justjoin.it/job-offer/junior-integration-developer',
 location:'Warszawa',board_contract_unverified:'',
 review_status:'UNVERIFIED'
};
const data={
 daily_pick_ids:['priority'],
 still_listed_ids:['older','mid','b2b','skip'],
 manual_review_leads:[
  uopLead,unknown,
  {...uopLead,url:'javascript:alert(1)'},
  {...uopLead,url:'https://evil.example.com/job'},
  {...uopLead,url:old.url},
  {...uopLead,url:'https://justjoin.it/job-offer/b2b-lead',board_contract_unverified:'B2B only'},
  {...uopLead,url:'https://justjoin.it/job-offer/fake-apply',review_status:'APPLY'}
 ]
};
const storage=new Map(),feedback={},tracking={};
let redraws=0;
const ctx=createContext({
 URL,meta:data,jobs,activeFilter:'DAILY',render:()=>{redraws++},
 localStorage:{
  getItem:key=>storage.get(key)||null,
  setItem:(key,v)=>storage.set(key,v)
 },
 dailyFeedback:()=>feedback,getTracker:()=>tracking,
 jobKey:j=>j.id,aiReviewFor:j=>j.ai_review||null,
 getVisibleJobs:()=>[],
 dailyRecommendations:()=>[{job:p}],
 document:{
  createElement:tag=>new FakeEl(tag),
  querySelector:sel=>sel==='#jobs'?main:null,
  querySelectorAll:sel=>sel==='#jobs .job-card'?
    main.children.filter(el=>el.className.split(' ').includes('job-card')):[]
 }
});
runInContext(helpers+'\n'+visible,ctx);
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),['priority','older']);
assert.equal(ctx.dailyStillListedJobs().length,1);
assert.equal(ctx.dailyManualCandidates().length,2);
assert.equal(ctx.dailyOriginalUrl('javascript:alert(1)'),null);
assert.equal(ctx.dailyOriginalUrl('https://justjoin.it.evil.example.com/job'),null);
ctx.dailyDecorateAdditionalCards();
assert.equal(main.children.length,3,'one old full card and two source leads');
assert.equal(label.textContent,'STILL LISTED · CHECK');
const note=oldCard.querySelector('.daily-reseen-note');
assert(note.textContent.includes('First seen 2026-10-31'));
const lead=main.children[1];
assert.equal(lead.className,'manual-lead-card daily-unverified-card');
assert.equal(lead.querySelector('.manual-lead-status').textContent,'CHECK · NOT VERIFIED');
assert(lead.querySelector('.manual-lead-skills').textContent.includes('<script>'));
assert(!lead.children.some(x=>x.tag==='script'));
const links=main.children[1].querySelector('.manual-lead-actions');
assert.equal(links.children[0].target,'_blank');
assert.equal(links.children[0].rel,'noopener noreferrer');
assert.equal(links.children[0].href,uopLead.url);
assert(main.children[2].querySelector('.manual-lead-facts').textContent.includes('Contract unknown'));
links.children[1].listeners.click();
assert.equal(redraws,1);
assert.equal(ctx.dailyManualCandidates().length,1,'dismissal retained on this device');
assert.equal(JSON.parse(storage.get('jobRadarManualLeadsHiddenV1'))[uopLead.url],true);
ctx.activeFilter='FOCUS';
assert.deepEqual(Array.from(ctx.getVisibleJobs(),x=>x.id),[]);
data.still_listed_ids=[];
assert.equal(ctx.dailyStillListedJobs().length,0,'new feed replaces older IDs');
console.log('Unified Daily PASS: 4 existing tabs; one list; source checks; normal full-card actions retained; no fake APPLY; safe links; local dismissals');
