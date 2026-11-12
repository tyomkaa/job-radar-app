// End-to-end Daily's separate re-observed job shelf; zero network or AI.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const js=readFileSync('v31-still-listed.js','utf8');
const html=readFileSync('index.html','utf8');
const sw=readFileSync('service-worker-v12.js','utf8');
assert(html.includes('<script src="v31-still-listed.js"></script>'));
assert(sw.includes("'./v31-still-listed.js'"));
assert(sw.includes("url.pathname.endsWith('/v31-still-listed.js')"));
assert(!js.includes('innerHTML'));

let host=null;
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.hidden=false;this.textContent='';
    this.listeners={};this.className='';this.id='';}
  appendChild(v){this.children.push(v);return v;}
  replaceChildren(...children){this.children=children;}
  insertAdjacentElement(how, el){
    assert(['beforebegin','afterend'].includes(how));host=el;
  }
  addEventListener(event,cb){this.listeners[event]=cb;}
}
const daily=new Element('section'),manual=new Element('section');
const old={
 id:'old',title:'AI <script>Workflow</script> Automation Specialist',
 company:'Automation Co',location:'Warszawa',work_mode:'Hybrid',
 url:'https://www.pracuj.pl/praca/ai-workflow-warszawa,oferta,1005500000',
 recommendation_tier:'POSSIBLE',contract:'Umowa o pracę',
 seniority:'junior',experience_required_years:0,
 first_found_at:'2026-10-31T12:00:00Z'
};
const fresh={...old,id:'fresh',url:'https://www.pracuj.pl/praca/fresh,oferta,1005500001'};
const b2b={...old,id:'b2b',url:'https://justjoin.it/job-offer/b2b',contract:'B2B only'};
const mid={...old,id:'mid',url:'https://justjoin.it/job-offer/mid',seniority:'junior, mid'};
const badUrl={...old,id:'badurl',url:'javascript:alert(1)'};
const skip={...old,id:'skip',url:'https://justjoin.it/job-offer/skip',
 ai_review:{verdict:'SKIP'}};
const aiCheck={...old,id:'check',url:'https://justjoin.it/job-offer/check',
 ai_review:{verdict:'CHECK'}};
const jobs=[old,fresh,b2b,mid,badUrl,skip,aiCheck];
const ignored={};const tracked={};
const ctx=createContext({
 URL,jobs,
 meta:{still_listed_ids:['old','fresh','b2b'],daily_pick_ids:['fresh']},
 activeFilter:'DAILY',
 dailyFeedback:()=>ignored,getTracker:()=>tracked,jobKey:j=>j.id,
 saveDailyFeedback:(j,r)=>{ignored[j.id]={reason:r};},
 aiReviewFor:j=>j.ai_review||null,
 document:{
   querySelector(sel){return sel==='#dailyBrief'?daily:
     sel==='#manualReviewLeads'?manual:
     sel==='#stillListedReview'?host:null;},
   createElement(tag){return new Element(tag);}
 },
 render(){}
});
runInContext(js,ctx);
assert(host);
assert.equal(host.hidden,false);
assert.equal(host.children[1].children.length,1,'fresh and B2B excluded');
const card=host.children[1].children[0];
assert(card.children.find(x=>x.className==='manual-lead-title')
 .textContent.includes('<script>'),'title is inert text');
assert(card.children.find(x=>x.className==='manual-lead-status')
 .textContent.includes('STILL LISTED'));
assert(host.children[0].children[1].textContent.includes('Not new postings'));
const actions=card.children.at(-1);
assert.equal(actions.children[0].href,old.url);
assert.equal(actions.children[0].target,'_blank');
assert.equal(actions.children[0].rel,'noopener noreferrer');
ctx.activeFilter='FOCUS';ctx.render();assert.equal(host.hidden,true);
ctx.activeFilter='DAILY';ctx.render();assert.equal(host.hidden,false);
ctx.meta.still_listed_ids=['mid','badurl','skip'];ctx.render();
assert.equal(host.hidden,true,'mid, bad URLs and AI SKIP rejected');
ctx.meta.still_listed_ids=['check'];ctx.render();
assert.equal(host.children[1].children.length,1);
assert(host.children[1].children[0].children[0].textContent.includes('AI CHECK'));
ctx.meta.still_listed_ids=['old'];ctx.render();
const click=host.children[1].children[0].children.at(-1).children[1];
click.listeners.click();
assert.equal(ignored.old.reason,'Other');
assert.equal(host.hidden,true,'dismissed job stays hidden');
ctx.meta.still_listed_ids=[];ctx.render();assert.equal(host.hidden,true);
console.log('Still-listed Daily integration PASS: source links, no fake fresh, strict safety, no extra tab, local dismissal');
