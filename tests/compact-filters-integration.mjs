// Static integration regression; no external network or browser storage.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const js=readFileSync('app-v12.js','utf8');
const sw=readFileSync('service-worker-v12.js','utf8');
const main=html.match(/<div class="primary-filters"[\s\S]*?<\/div>/)?.[0]||'';
const more=html.match(/<details class="extra-filters"[\s\S]*?<\/details>/)?.[0]||'';
const primary=[...main.matchAll(/data-filter="([^"]+)"/g)].map(x=>x[1]);
const optional=[...more.matchAll(/data-filter="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(primary,['DAILY','FOCUS','ALL','UNSEEN']);
assert.equal(new Set([...primary,...optional]).size,primary.length+optional.length);
assert(!html.includes('data-filter="FRESH"'));
assert(!html.includes('v28-fresh-opportunities.js'));
assert(!sw.includes("'./v28-fresh-opportunities.js'"));
for(const f of ['SAVED','APPLIED','REPLIED','QUEUE','UA_EMPLOYERS'])
 assert(optional.includes(f),'Secondary workflow filter lost: '+f);
assert(js.includes('if (optional && !optional.contains(button)) optional.open = false'));
assert(html.includes('styles-v29-compact-filters.css'));
console.log('Compact navigation PASS: four main views, optional views preserved, New Matches removed');
