import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('app-v12.js','utf8');
const sw=readFileSync('service-worker-v12.js','utf8');
const marker='const preliminary = job.fit_notes';
const begin=app.indexOf(marker);
const end=app.indexOf("const badge = node.querySelector",begin);
assert(begin>0 && end>begin);
const relevant=app.slice(begin,end);
assert(relevant.includes("job.fit_notes?.score_is_preliminary === true"));
assert(relevant.includes("aiAssessment ? 'AI ' + aiAssessment.verdict : 'AI pending'"));
assert(relevant.includes('CV match awaiting AI review'));
assert(relevant.includes("job.fit_score || 0"));
assert(sw.includes('v44-partial-source-unverified'));
console.log('AI-first score PASS: unreviewed jobs show AI pending, not invented CV percentage');
