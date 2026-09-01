const jobsEl = document.querySelector('#jobs');
const statsEl = document.querySelector('#stats');
const healthEl = document.querySelector('#sourceHealth');
const trackerSummaryEl = document.querySelector('#trackerSummary');
const lastUpdatedEl = document.querySelector('#lastUpdated');
const tpl = document.querySelector('#jobTemplate');

let jobs = [];
let meta = {};
let activeFilter = 'ALL';
let sortMode = 'BEST';

const TRACKER_KEY = 'jobRadarApplicationTrackerV1';

function readSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
}
const savedIds = () => readSet('savedJobs');
const seenIds = () => readSet('seenJobs');

function getTracker() {
  try { return JSON.parse(localStorage.getItem(TRACKER_KEY) || '{}'); }
  catch { return {}; }
}
function setTracker(value) { localStorage.setItem(TRACKER_KEY, JSON.stringify(value)); }
function norm(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function jobKey(job) { return [norm(job.company), norm(job.title), norm(job.location)].join('|'); }
function today() { return new Date().toISOString().slice(0, 10); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function toggleSaved(id) {
  const set = savedIds();
  set.has(id) ? set.delete(id) : set.add(id);
  localStorage.setItem('savedJobs', JSON.stringify([...set]));
  render();
}
function markSeen(id) {
  const set = seenIds();
  set.add(id);
  localStorage.setItem('seenJobs', JSON.stringify([...set]));
}

const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
function responseStatuses() { return new Set(['REPLIED', 'INTERVIEW', 'REJECTED', 'OFFER']); }
function trackedRecords() { return Object.values(getTracker()).filter(Boolean); }

function renderStats() {
  const tracker = getTracker();
  const seen = seenIds();
  const unseen = jobs.filter(j => !seen.has(j.id) && !tracker[jobKey(j)]).length;
  const records = Object.values(tracker);
  const replies = records.filter(r => responseStatuses().has(r.status)).length;
  const interviews = records.filter(r => r.status === 'INTERVIEW' || r.status === 'OFFER').length;
  const offers = records.filter(r => r.status === 'OFFER').length;
  statsEl.innerHTML = stat('FOUND', jobs.length) + stat('NEW', unseen) + stat('APPLIED', records.length) +
    stat('REPLIES', replies) + stat('INTERVIEWS', interviews) + stat('OFFERS', offers);
}

function renderTrackerSummary() {
  const records = trackedRecords();
  if (!records.length) {
    trackerSummaryEl.innerHTML = '<b>Application tracker ready.</b> Your application history stays only on this device.';
    return;
  }
  const replies = records.filter(r => responseStatuses().has(r.status)).length;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const thisWeek = records.filter(r => r.applied_at && new Date(r.applied_at + 'T12:00:00') >= weekAgo).length;
  const rate = Math.round((replies / records.length) * 100);
  trackerSummaryEl.innerHTML = `<b>${thisWeek}</b> applications in the last 7 days · <b>${rate}%</b> response rate · history: <b>${records.length}</b>`;
}

function renderHealth() {
  const entries = Object.entries(meta.sources || {});
  if (!entries.length) { healthEl.innerHTML = ''; return; }
  healthEl.innerHTML = '<div class="health-title">Sources</div><div class="health-row">' +
    entries.map(([name, s]) => `<span class="health ${s.status === 'ok' ? 'ok' : 'bad'}">${esc(name)} · ${s.status === 'ok' ? s.fetched : 'error'}</span>`).join('') +
    '</div>';
}

function renderUpdated() {
  if (!meta.generated_at) { lastUpdatedEl.textContent = 'Updated —'; return; }
  const date = new Date(meta.generated_at);
  lastUpdatedEl.textContent = Number.isNaN(date.getTime()) ? 'Updated —' :
    `Updated ${date.toLocaleString([], {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}`;
}

function historyAsJobs() {
  const currentKeys = new Set(jobs.map(jobKey));
  return trackedRecords().filter(r => r.job && !currentKeys.has(r.key)).map(r => ({...r.job, _historyOnly: true}));
}
function dateValue(job) {
  const t = Date.parse(job.published_at || '');
  return Number.isNaN(t) ? 0 : t;
}
function sortJobs(list) {
  const copy = [...list];
  if (sortMode === 'NEWEST') return copy.sort((a,b) => dateValue(b) - dateValue(a) || (b.fit_score || 0) - (a.fit_score || 0));
  return copy.sort((a,b) => (b.fit_score || 0) - (a.fit_score || 0) || dateValue(b) - dateValue(a));
}
function getVisibleJobs() {
  const tracker = getTracker(), seen = seenIds(), saved = savedIds();
  let pool = [...jobs];
  if (activeFilter === 'APPLIED' || activeFilter === 'REPLIED') pool = [...jobs, ...historyAsJobs()];
  const filtered = pool.filter(j => {
    const rec = tracker[jobKey(j)];
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'STRONG' || activeFilter === 'MEDIUM') return j.match_level === activeFilter;
    if (activeFilter === 'NEW') return !seen.has(j.id) && !rec;
    if (activeFilter === 'SAVED') return saved.has(j.id);
    if (activeFilter === 'APPLIED') return !!rec;
    if (activeFilter === 'REPLIED') return !!rec && responseStatuses().has(rec.status);
    return true;
  });
  return sortJobs(filtered);
}

function recordSnapshot(job, status='APPLIED') {
  return {
    key: jobKey(job), status, applied_at: today(), channel: '', response_date: '', notes: '',
    updated_at: new Date().toISOString(),
    job: {
      id: job.id, title: job.title, company: job.company, location: job.location,
      url: job.url, apply_url: job.apply_url, source: job.source, fit_score: job.fit_score,
      match_level: job.match_level, contract: job.contract, work_mode: job.work_mode,
      salary: job.salary, seniority: job.seniority, required_skills: job.required_skills,
      summary: job.summary, summary_tasks: job.summary_tasks, summary_expectations: job.summary_expectations,
      summary_offers: job.summary_offers, contact_email: job.contact_email,
      published_at: job.published_at,
    }
  };
}
function saveTracking(job, fields) {
  const tracker = getTracker(), key = jobKey(job);
  if (!fields.status) { delete tracker[key]; setTracker(tracker); return; }
  const existing = tracker[key] || recordSnapshot(job, fields.status);
  tracker[key] = {...existing, ...fields, key, updated_at: new Date().toISOString(), job: existing.job || recordSnapshot(job, fields.status).job};
  setTracker(tracker);
}
function statusLabel(status) {
  return ({APPLIED:'APPLIED', REPLIED:'REPLY', INTERVIEW:'INTERVIEW', REJECTED:'REJECTED', OFFER:'OFFER', WITHDRAWN:'WITHDRAWN', NO_RESPONSE:'NO RESPONSE'})[status] || '';
}

function fillSummaryList(listEl, items, emptyText) {
  listEl.innerHTML = '';
  const values = Array.isArray(items) ? items.filter(Boolean).slice(0, 3) : [];
  if (!values.length) {
    const li = document.createElement('li');
    li.className = 'summary-empty';
    li.textContent = emptyText;
    listEl.appendChild(li);
    return;
  }
  for (const value of values) {
    const li = document.createElement('li');
    li.textContent = value;
    listEl.appendChild(li);
  }
}

function renderQuickSummary(node, job) {
  const tasks = Array.isArray(job.summary_tasks) ? job.summary_tasks : [];
  const expectations = Array.isArray(job.summary_expectations) ? job.summary_expectations : [];
  const offers = Array.isArray(job.summary_offers) ? job.summary_offers : [];
  const structured = node.querySelector('.structured-summary');
  const fallback = node.querySelector('.summary-fallback');
  const hasStructured = tasks.length || expectations.length || offers.length;

  structured.hidden = !hasStructured;
  fallback.hidden = hasStructured;
  if (hasStructured) {
    fillSummaryList(node.querySelector('.summary-tasks'), tasks, 'Not clearly listed in the vacancy.');
    fillSummaryList(node.querySelector('.summary-expectations'), expectations, 'Not clearly listed in the vacancy.');
    fillSummaryList(node.querySelector('.summary-offers'), offers, 'No clear benefits listed in the vacancy.');
  } else {
    fallback.textContent = job.summary || 'No concise summary available.';
  }
}

function emailSubject(job) { return `Application – ${job.title}`; }
function emailBody(job) {
  return `Dear Hiring Team,\n\nI am reaching out regarding the ${job.title} position at ${job.company}. I saw the vacancy and would like to apply.\n\nPlease find my CV attached for your consideration. I would be happy to discuss my background and the role in more detail.\n\nBest regards`;
}
function prepareEmail(job) {
  if (!job.contact_email) return;
  markSeen(job.id);
  const href = `mailto:${job.contact_email}?subject=${encodeURIComponent(emailSubject(job))}&body=${encodeURIComponent(emailBody(job))}`;
  window.location.href = href;
}

function render() {
  renderStats(); renderTrackerSummary(); renderHealth(); renderUpdated();
  jobsEl.innerHTML = '';
  const saved = savedIds(), seen = seenIds(), tracker = getTracker(), visible = getVisibleJobs();
  if (!visible.length) { jobsEl.innerHTML = '<div class="empty">No jobs in this view yet.</div>'; return; }

  for (const job of visible) {
    const key = jobKey(job), rec = tracker[key];
    const node = tpl.content.cloneNode(true);
    node.querySelector('.score').textContent = `${job.fit_score || 0}%`;
    node.querySelector('.level').textContent = (!seen.has(job.id) && !rec && !job._historyOnly ? 'NEW · ' : '') + (job.match_level || '');
    const badge = node.querySelector('.application-badge');
    if (rec) { badge.textContent = statusLabel(rec.status); badge.classList.add('visible'); }
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company || 'Company not parsed';
    renderQuickSummary(node, job);

    const openJob = node.querySelector('.open-job');
    openJob.href = job.apply_url || job.url;
    openJob.addEventListener('click', () => markSeen(job.id));

    node.querySelector('.chips').innerHTML = [
      job.location || 'Location unknown', job.work_mode || 'Mode unknown',
      job.contract || 'Contract unknown', job.source || 'Source'
    ].map(x => `<span class="chip">${esc(x)}</span>`).join('');

    const extra = [];
    if (job.salary) extra.push(`<span><b>Salary:</b> ${esc(job.salary)}</span>`);
    if (job.seniority) extra.push(`<span><b>Level:</b> ${esc(job.seniority)}</span>`);
    if (job.published_at) {
      const pd = new Date(job.published_at);
      if (!Number.isNaN(pd.getTime())) extra.push(`<span><b>Published:</b> ${esc(pd.toLocaleDateString())}</span>`);
    }
    if ((job.required_skills || []).length) extra.push(`<span><b>Source skills:</b> ${esc(job.required_skills.slice(0,8).join(', '))}</span>`);
    if (rec?.applied_at) extra.push(`<span><b>Applied:</b> ${esc(rec.applied_at)}${rec.channel ? ' · ' + esc(rec.channel) : ''}</span>`);
    if (rec?.response_date) extra.push(`<span><b>Response:</b> ${esc(rec.response_date)}</span>`);
    node.querySelector('.meta-extra').innerHTML = extra.join('');

    const emailAction = node.querySelector('.email-action');
    if (job.contact_email) {
      emailAction.hidden = false;
      node.querySelector('.email-address').textContent = job.contact_email;
      node.querySelector('.prepare-email').addEventListener('click', () => prepareEmail(job));
    }

    const saveBtn = node.querySelector('.save-btn');
    saveBtn.textContent = saved.has(job.id) ? '★' : '☆';
    saveBtn.addEventListener('click', () => toggleSaved(job.id));

    const status = node.querySelector('.track-status');
    const appliedDate = node.querySelector('.track-applied-date');
    const channel = node.querySelector('.track-channel');
    const responseDate = node.querySelector('.track-response-date');
    const notes = node.querySelector('.track-notes');
    status.value = rec?.status || '';
    appliedDate.value = rec?.applied_at || '';
    channel.value = rec?.channel || '';
    responseDate.value = rec?.response_date || '';
    notes.value = rec?.notes || '';

    node.querySelector('.save-tracking').addEventListener('click', () => {
      const st = status.value;
      if (st && !appliedDate.value) appliedDate.value = today();
      saveTracking(job, {status: st, applied_at: appliedDate.value, channel: channel.value, response_date: responseDate.value, notes: notes.value});
      render();
    });
    node.querySelector('.clear-tracking').addEventListener('click', () => { saveTracking(job, {status: ''}); render(); });

    const quickApplied = node.querySelector('.quick-applied');
    quickApplied.textContent = rec ? 'Update status' : 'Mark applied';
    quickApplied.addEventListener('click', () => {
      if (!rec) {
        saveTracking(job, {status:'APPLIED', applied_at:today(), channel:'', response_date:'', notes:''});
        render();
      } else {
        const details = node.querySelector('.tracking-wrap');
        details.open = true;
        details.scrollIntoView({behavior:'smooth', block:'center'});
      }
    });

    if (job._historyOnly) node.querySelector('.level').textContent = (job.match_level || 'HISTORY') + ' · HISTORY';
    jobsEl.appendChild(node);
  }
}

async function loadJobs() {
  jobsEl.innerHTML = '<div class="loading">Refreshing Job Radar…</div>';
  try {
    const response = await fetch(`data/jobs.json?ts=${Date.now()}`, {cache:'no-store'});
    const payload = await response.json();
    meta = payload.meta || {};
    jobs = payload.jobs || [];
    render();
  } catch {
    jobsEl.innerHTML = '<div class="empty">Could not load jobs yet.</div>';
  }
}

function exportHistory() {
  const payload = {format:'job-radar-application-history', version:1, exported_at:new Date().toISOString(), records:getTracker()};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `job-radar-history-${today()}.json`; a.click(); URL.revokeObjectURL(url);
}
async function importHistory(file) {
  try {
    const payload = JSON.parse(await file.text()), incoming = payload.records || payload;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid history format');
    setTracker({...getTracker(), ...incoming}); render(); alert('Application history imported.');
  } catch { alert('Could not import this history file.'); }
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
  button.classList.add('active'); activeFilter = button.dataset.filter; render();
}));
document.querySelector('#sortSelect').addEventListener('change', e => { sortMode = e.target.value; render(); });
document.querySelector('#refreshBtn').addEventListener('click', loadJobs);
document.querySelector('#exportHistory').addEventListener('click', exportHistory);
document.querySelector('#importHistory').addEventListener('change', e => {
  if (e.target.files?.[0]) importHistory(e.target.files[0]);
  e.target.value = '';
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
loadJobs();
