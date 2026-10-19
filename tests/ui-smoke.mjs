// Dependency-free release gate for the static Job Radar PWA.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const read = path => readFileSync(path, 'utf8');
const html = read('index.html');
const serviceWorker = read('service-worker-v12.js');
const scripts = [...html.matchAll(/<script\s+src="([^"]+\.js)"/g)].map(match => match[1]);
const styles = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(match => match[1]);
assert(scripts.length >= 10, 'PWA scripts missing');
assert(scripts.includes('v24-workspace.js') && scripts.includes('v25-cloudflare-ai.js'));
assert(scripts.indexOf('v24-workspace.js') < scripts.indexOf('v25-cloudflare-ai.js'));
assert.equal(new Set(scripts).size, scripts.length, 'duplicate script elements');
for (const name of [...scripts, ...styles, 'service-worker-v12.js']) {
  assert(existsSync(name), 'missing asset ' + name);
}
for (const name of [...scripts, 'service-worker-v12.js']) {
  new Script(read(name), {filename:name});
}
for (const name of ['v24-workspace.js','v25-cloudflare-ai.js','styles-v24-workspace.css']) {
  assert(serviceWorker.includes("'./" + name + "'"), 'not precached: ' + name);
}
const workspace = read('v24-workspace.js');
const ai = read('v25-cloudflare-ai.js');
assert(workspace.includes("const TABS ="), 'workflow tabs absent');
assert(workspace.includes('recommended') || workspace.includes('recommendCv'), 'CV selection lost');
assert(ai.includes('ACCESS_TOKEN'), 'token must be manually supplied');
assert(ai.includes('type="password"'), 'token input must be masked');
assert(ai.includes('cache:"no-store"'), 'AI requests must not be cached');
assert(ai.includes('AbortController'), 'AI request cancellation missing');
assert(!ai.includes('localStorage.setItem("ACCESS_TOKEN"'), 'token persisted');
assert(!ai.includes('sessionStorage.setItem('), 'token persisted in session storage');
assert(!/sk-[A-Za-z0-9]{20,}/.test(ai), 'suspected hard-coded secret');
const requiredSections = [
  'applicationAssistant','assistantCvContent','assistantAnswerTemplates',
  'assistantQuickAnswers','assistantNotes','assistantMarkApplied'
];
for (const id of requiredSections) {
  assert((html + read('v15-cv-manager.js') + read('v14-templates.js')).includes(id), 'missing app component ' + id);
}
const localDrafts=read('v26-local-drafts.js');
assert(scripts.includes('v26-local-drafts.js'),'Local drafts not loaded');
assert(serviceWorker.includes("'./v26-local-drafts.js'"),'Local draft editor not cached');
assert(localDrafts.includes('local-template-editor'),'Editable template control missing');
assert(!localDrafts.includes('fetch('),'Local drafts must not use any API');
assert(!ai.includes('aiDraftTools') && !ai.includes('generateDraft('),'Quota-consuming AI application drafts still enabled');
console.log('Job Radar v0.7 smoke: script syntax, assets, cache, CV / Prepare / AI integration checks passed');
