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
let lastAutoRefresh = 0;
let seenObserver = null;
const seenTimers = new Map();

const TRACKER_KEY = 'jobRadarApplicationTrackerV1';
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const FOCUS_REFRESH_MIN_MS = 30 * 1000;
const SEEN_DWELL_MS = 1300;
const RETURN_ANCHOR_KEY = 'jobRadarReturnAnchorV1';

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
function localDateKey(value=new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function today() { return localDateKey(); }
function isFirstFoundToday(job) { return !!job.first_found_at && localDateKey(job.first_found_at) === today(); }
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
  const changed = !set.has(id);
  set.add(id);
  localStorage.setItem('seenJobs', JSON.stringify([...set]));
  return changed;
}

const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
function responseStatuses() { return new Set(['REPLIED', 'INTERVIEW', 'REJECTED', 'OFFER']); }
function trackedRecords() { return Object.values(getTracker()).filter(Boolean); }

function renderStats() {
  const tracker = getTracker();
  const seen = seenIds();
  const unseen = jobs.filter(j => !seen.has(j.id) && !tracker[jobKey(j)]).length;
  const addedToday = jobs.filter(isFirstFoundToday).length;
  const records = Object.values(tracker);
  const replies = records.filter(r => responseStatuses().has(r.status)).length;
  const interviews = records.filter(r => r.status === 'INTERVIEW' || r.status === 'OFFER').length;
  const offers = records.filter(r => r.status === 'OFFER').length;
  const emails = jobs.filter(j => j.contact_email).length;
  statsEl.innerHTML = stat('FOUND', jobs.length) + stat('TODAY', `+${addedToday}`) + stat('UNSEEN', unseen) +
    stat('APPLIED', records.length) + stat('EMAILS', emails) + stat('REPLIES', replies) +
    stat('INTERVIEWS', interviews) + stat('OFFERS', offers);
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
function getVisibleJobs(pinnedId="") {
  const tracker = getTracker(), seen = seenIds(), saved = savedIds();
  let pool = [...jobs];
  if (activeFilter === 'APPLIED' || activeFilter === 'REPLIED') pool = [...jobs, ...historyAsJobs()];
  const filtered = pool.filter(j => {
    const rec = tracker[jobKey(j)];
    if (pinnedId && String(j.id) === String(pinnedId)) return true;
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'STRONG' || activeFilter === 'MEDIUM') return j.match_level === activeFilter;
    if (activeFilter === 'EMAIL') return !!j.contact_email;
    if (activeFilter === 'TODAY') return isFirstFoundToday(j);
    if (activeFilter === 'UNSEEN') return !seen.has(j.id) && !rec;
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
      contact_email_kind: job.contact_email_kind, published_at: job.published_at, first_found_at: job.first_found_at,
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
  const generic = job.contact_email_kind === 'company_contact';
  const forwarding = generic ? '\n\nIf this is not the correct recruitment inbox, I would appreciate it if you could forward my application to the appropriate person.' : '';
  return `Dear Hiring Team,\n\nI am reaching out regarding the ${job.title} position at ${job.company}. I saw the vacancy and would like to apply.${forwarding}\n\nPlease find my CV attached for your consideration. I would be happy to discuss my background and the role in more detail.\n\nBest regards`;
}
function prepareEmail(job) {
  if (!job.contact_email) return;
  markSeen(job.id);
  updateSeenUi(job.id);
  saveReturnAnchor(job.id);
  const href = `mailto:${job.contact_email}?subject=${encodeURIComponent(emailSubject(job))}&body=${encodeURIComponent(emailBody(job))}`;
  setTimeout(() => { window.location.href = href; }, 0);
}

function cardById(id) {
  return [...document.querySelectorAll('.job-card')].find(card => card.dataset.jobId === String(id)) || null;
}
function captureCardAnchor(id) {
  const card = cardById(id);
  if (!card) return null;
  return {id: String(id), top: card.getBoundingClientRect().top};
}
function captureViewportAnchor() {
  const cards = [...document.querySelectorAll('.job-card')];
  if (!cards.length) return null;
  const targetTop = Math.max(88, Math.min(window.innerHeight * 0.18, 150));
  const visible = cards.filter(card => {
    const rect = card.getBoundingClientRect();
    return rect.bottom > targetTop && rect.top < window.innerHeight;
  });
  if (!visible.length) return null;
  visible.sort((a, b) => Math.abs(a.getBoundingClientRect().top - targetTop) - Math.abs(b.getBoundingClientRect().top - targetTop));
  const card = visible[0];
  return {id: card.dataset.jobId, top: card.getBoundingClientRect().top};
}
function restoreAnchor(anchor) {
  if (!anchor?.id) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = cardById(anchor.id);
    if (!card) return;
    const delta = card.getBoundingClientRect().top - Number(anchor.top || 0);
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }));
}
function saveReturnAnchor(id) {
  const anchor = captureCardAnchor(id);
  if (!anchor) return;
  try { sessionStorage.setItem(RETURN_ANCHOR_KEY, JSON.stringify({...anchor, savedAt: Date.now()})); }
  catch (_) {}
}
function getReturnAnchor() {
  try {
    const anchor = JSON.parse(sessionStorage.getItem(RETURN_ANCHOR_KEY) || 'null');
    if (!anchor || Date.now() - Number(anchor.savedAt || 0) > 15 * 60 * 1000) return null;
    return anchor;
  } catch { return null; }
}
function scheduleReturnAnchorClear() {
  setTimeout(() => { try { sessionStorage.removeItem(RETURN_ANCHOR_KEY); } catch (_) {} }, 1600);
}
function updateSeenUi(id) {
  const job = jobs.find(j => String(j.id) === String(id));
  const card = cardById(id);
  if (job && card) {
    const rec = getTracker()[jobKey(job)];
    const prefix = isFirstFoundToday(job) ? 'TODAY · ' : (!rec && !seenIds().has(job.id) ? 'UNSEEN · ' : '');
    card.querySelector('.level').textContent = prefix + (job.match_level || '');
  }
  renderStats();
}
function setupSeenObserver() {
  if (seenObserver) seenObserver.disconnect();
  for (const timer of seenTimers.values()) clearTimeout(timer);
  seenTimers.clear();
  if (!('IntersectionObserver' in window)) return;
  seenObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const id = entry.target.dataset.jobId;
      if (!id) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
        if (seenTimers.has(id)) continue;
        const timer = setTimeout(() => {
          seenTimers.delete(id);
          if (!entry.target.isConnected) return;
          const rect = entry.target.getBoundingClientRect();
          const visiblePx = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          if (visiblePx <= 0 || visiblePx / Math.max(1, rect.height) < 0.55) return;
          if (markSeen(id)) updateSeenUi(id);
        }, SEEN_DWELL_MS);
        seenTimers.set(id, timer);
      } else if (seenTimers.has(id)) {
        clearTimeout(seenTimers.get(id));
        seenTimers.delete(id);
      }
    }
  }, {threshold:[0.55, 0.62, 0.8]});
  const tracker = getTracker(), seen = seenIds();
  document.querySelectorAll('.job-card').forEach(card => {
    const job = jobs.find(j => String(j.id) === card.dataset.jobId);
    if (job && !job._historyOnly && !seen.has(job.id) && !tracker[jobKey(job)]) seenObserver.observe(card);
  });
}
function focusTracking(details) {
  requestAnimationFrame(() => setTimeout(() => {
    const rect = details.getBoundingClientRect();
    const usable = window.innerHeight - 90;
    details.scrollIntoView({behavior:'smooth', block: rect.height <= usable ? 'center' : 'start'});
  }, 40));
}

function render({anchor=null, preserveViewport=false}={}) {
  renderStats(); renderTrackerSummary(); renderHealth(); renderUpdated();
  jobsEl.innerHTML = '';
  const saved = savedIds(), seen = seenIds(), tracker = getTracker(), visible = getVisibleJobs(anchor?.id || "");
  if (!visible.length) { if (seenObserver) seenObserver.disconnect(); jobsEl.innerHTML = '<div class="empty">No jobs in this view yet.</div>'; return; }

  for (const job of visible) {
    const key = jobKey(job), rec = tracker[key];
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector('.job-card');
    card.dataset.jobId = String(job.id);
    node.querySelector('.score').textContent = `${job.fit_score || 0}%`;
    const levelPrefix = job._historyOnly ? '' : (isFirstFoundToday(job) ? 'TODAY · ' : (!seen.has(job.id) && !rec ? 'UNSEEN · ' : ''));
    node.querySelector('.level').textContent = levelPrefix + (job.match_level || '');
    const badge = node.querySelector('.application-badge');
    if (rec) { badge.textContent = statusLabel(rec.status); badge.classList.add('visible'); }
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company || 'Company not parsed';
    renderQuickSummary(node, job);

    const openJob = node.querySelector('.open-job');
    openJob.href = job.apply_url || job.url;
    openJob.addEventListener('click', () => {
      saveReturnAnchor(job.id);
      markSeen(job.id);
      updateSeenUi(job.id);
    });

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
    const hasEmail = Boolean(job.contact_email);
    emailAction.hidden = !hasEmail;
    emailAction.style.display = hasEmail ? 'grid' : 'none';
    if (hasEmail) {
      const generic = job.contact_email_kind === 'company_contact';
      node.querySelector('.email-found').textContent = generic ? '✓ Official company email found' : '✓ Recruitment email found';
      node.querySelector('.email-address').textContent = job.contact_email;
      node.querySelector('.email-hint').textContent = generic
        ? 'General official company inbox, not necessarily recruitment-specific. Review the email before sending and attach your CV.'
        : 'Opens your mail app with To, Subject and Body filled in. Attach your CV before sending.';
      node.querySelector('.prepare-email').addEventListener('click', () => prepareEmail(job));
    }

    const saveBtn = node.querySelector('.save-btn');
    saveBtn.textContent = saved.has(job.id) ? '★' : '☆';
    saveBtn.addEventListener('click', () => {
      const anchorNow = captureCardAnchor(job.id);
      const set = savedIds();
      set.has(job.id) ? set.delete(job.id) : set.add(job.id);
      localStorage.setItem('savedJobs', JSON.stringify([...set]));
      render({anchor: anchorNow});
    });

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

    const trackingDetails = node.querySelector('.tracking-wrap');
    trackingDetails.addEventListener('toggle', () => {
      if (!trackingDetails.open) return;
      if (markSeen(job.id)) updateSeenUi(job.id);
      focusTracking(trackingDetails);
    });

    node.querySelector('.save-tracking').addEventListener('click', () => {
      const anchorNow = captureCardAnchor(job.id);
      const st = status.value;
      if (st && !appliedDate.value) appliedDate.value = today();
      saveTracking(job, {status: st, applied_at: appliedDate.value, channel: channel.value, response_date: responseDate.value, notes: notes.value});
      markSeen(job.id);
      render({anchor: anchorNow});
    });
    node.querySelector('.clear-tracking').addEventListener('click', () => {
      const anchorNow = captureCardAnchor(job.id);
      saveTracking(job, {status: ''});
      render({anchor: anchorNow});
    });

    const quickApplied = node.querySelector('.quick-applied');
    quickApplied.textContent = rec ? 'Update status' : 'Mark applied';
    quickApplied.addEventListener('click', () => {
      if (!rec) {
        const anchorNow = captureCardAnchor(job.id);
        saveTracking(job, {status:'APPLIED', applied_at:today(), channel:'', response_date:'', notes:''});
        markSeen(job.id);
        render({anchor: anchorNow});
      } else {
        const details = node.querySelector('.tracking-wrap');
        details.open = true;
        focusTracking(details);
      }
    });

    if (job._historyOnly) node.querySelector('.level').textContent = (job.match_level || 'HISTORY') + ' · HISTORY';
    jobsEl.appendChild(node);
  }
  setupSeenObserver();
  if (anchor || preserveViewport) restoreAnchor(anchor || captureViewportAnchor());
}

async function loadJobs(silent=false, anchor=null) {
  const restore = anchor || captureViewportAnchor();
  if (!silent) jobsEl.innerHTML = '<div class="loading">Refreshing Job Radar…</div>';
  try {
    const response = await fetch(`data/jobs.json?ts=${Date.now()}`, {cache:'no-store'});
    const payload = await response.json();
    meta = payload.meta || {};
    jobs = payload.jobs || [];
    lastAutoRefresh = Date.now();
    render({anchor: restore});
  } catch {
    if (!silent && !jobs.length) jobsEl.innerHTML = '<div class="empty">Could not load jobs yet.</div>';
  }
}

async function refreshWhenActive(force=false) {
  if (document.hidden) return;
  const returnAnchor = getReturnAnchor();
  const anchor = returnAnchor || captureViewportAnchor();
  render({anchor});
  const now = Date.now();
  if (!force && now - lastAutoRefresh < FOCUS_REFRESH_MIN_MS) {
    if (returnAnchor) scheduleReturnAnchorClear();
    return;
  }
  await loadJobs(true, anchor);
  if (returnAnchor) scheduleReturnAnchorClear();
}

function exportHistory() {
  const payload = {
    format:'job-radar-application-history', version:2, exported_at:new Date().toISOString(),
    records:getTracker(), seen_jobs:[...seenIds()], saved_jobs:[...savedIds()]
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `job-radar-history-${today()}.json`; a.click(); URL.revokeObjectURL(url);
}
async function importHistory(file) {
  try {
    const payload = JSON.parse(await file.text()), incoming = payload.records || payload;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid history format');
    setTracker({...getTracker(), ...incoming});
    if (Array.isArray(payload.seen_jobs)) localStorage.setItem('seenJobs', JSON.stringify([...new Set([...seenIds(), ...payload.seen_jobs])]));
    if (Array.isArray(payload.saved_jobs)) localStorage.setItem('savedJobs', JSON.stringify([...new Set([...savedIds(), ...payload.saved_jobs])]));
    render(); alert('Application history imported.');
  } catch { alert('Could not import this history file.'); }
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
  button.classList.add('active'); activeFilter = button.dataset.filter; render();
}));
document.querySelector('#sortSelect').addEventListener('change', e => { sortMode = e.target.value; render(); });
document.querySelector('#refreshBtn').addEventListener('click', () => loadJobs(false, captureViewportAnchor()));
document.querySelector('#exportHistory').addEventListener('click', exportHistory);
document.querySelector('#importHistory').addEventListener('change', e => {
  if (e.target.files?.[0]) importHistory(e.target.files[0]);
  e.target.value = '';
});

window.addEventListener('pageshow', () => refreshWhenActive(false));
window.addEventListener('focus', () => refreshWhenActive(false));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshWhenActive(false);
});
setInterval(() => refreshWhenActive(true), AUTO_REFRESH_MS);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js?v=8', {updateViaCache:'none'})
    .then(registration => registration.update())
    .catch(() => {});
}
loadJobs(false);
