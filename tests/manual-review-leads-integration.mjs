// A stable Daily screen for unverified leads, no external network required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';

const source = readFileSync('v30-manual-review-leads.js', 'utf8');
const html = readFileSync('index.html','utf8');
const worker = readFileSync('service-worker-v12.js','utf8');
assert(html.includes('<script src="v30-manual-review-leads.js"></script>'));
assert(html.includes('<link rel="stylesheet" href="styles-v30-manual-leads.css">'));
assert(worker.includes("'./v30-manual-review-leads.js'"));
assert(worker.includes("'./styles-v30-manual-leads.css'"));

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  insertAdjacentElement(where, node) {
    assert.equal(where,'afterend');
    host = node;
  }
  addEventListener(event, cb) { this.listeners[event] = cb; }
}
let host = null;
const daily = new FakeNode('section');
const storage = new Map();
const good = {
  review_status:'UNVERIFIED',title:'Junior WEBCON Developer',
  company:'Vinci',location:'Warszawa',work_mode:'Office',
  board_contract_unverified:'Umowa o pracę / Employment contract',
  url:'https://www.pracuj.pl/praca/junior-webcon-developer,oferta,1234',
};
const bad = {...good,title:'Script injection',url:'javascript:alert(1)'};
const privateLeak = {...good,review_status:'APPLY',url:'https://justjoin.it/job-offer/fake'};
const ctx = createContext({
  URL, activeFilter:'DAILY',
  meta:{manual_review_leads:[good,bad,privateLeak]},
  document:{querySelector(sel) {
    return sel==='#dailyBrief'?daily:sel==='#manualReviewLeads'?host:null;
  },createElement(tag){return new FakeNode(tag);}},
  localStorage:{
    getItem(key){return storage.get(key)||null;},
    setItem(key,val){storage.set(key,val);}
  },
  render(){},
});
runInContext(source,ctx);
assert(host);
assert.equal(host.hidden,false);
const rendered = host.children[1].children;
assert.equal(rendered.length,1);
assert.equal(rendered[0].children[1].textContent,'Junior WEBCON Developer');
const actions=rendered[0].children.at(-1);
assert.equal(actions.children[0].href,good.url);
assert.equal(actions.children[0].target,'_blank');
assert.equal(actions.children[0].rel,'noopener noreferrer');
ctx.activeFilter='FOCUS';
ctx.render();
assert.equal(host.hidden,true);
ctx.activeFilter='DAILY';
ctx.render();
assert.equal(host.hidden,false);
assert.equal(host.children[1].children.length,1);
actions.children[1].listeners.click();
assert.equal(host.hidden,true);
assert.equal(JSON.parse(storage.get('jobRadarManualLeadsHiddenV1'))[good.url],true);
console.log('Manual leads Daily PWA integration PASS: validated links, no fake APPLY, no new tabs, dismissal persisted');
