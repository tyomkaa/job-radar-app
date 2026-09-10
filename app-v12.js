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
const RETURN_ANCHOR_KEY = 'jobRadarReturnAnchorV2';

// iOS may perform its own late scroll restoration after returning from another
// app. Job Radar owns this restoration so the external-app handoff cannot move
// the user to a different vacancy.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

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

const REPLY_STOP_WORDS = new Set([
  'the','and','for','with','from','your','you','our','this','that','have','has','are','was','were','about','regarding','position','role','job','application','apply','applied','candidate','recruitment','recruiter','hiring','team','thank','thanks','hello','dear','best','regards',
  'oferta','praca','pracy','stanowisko','aplikacja','aplikacji','rekrutacja','rekrutacji','kandydat','kandydata','dziekujemy','dziękujemy','witam','pozdrawiam'
]);
function replyTokens(value) {
  return norm(value).split(/\s+/).filter(token => token.length >= 3 && !REPLY_STOP_WORDS.has(token));
}
function compactNorm(value) { return norm(value).replace(/\s+/g, ''); }
function emailDomains(value) {
  const found = String(value || '').toLowerCase().match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g) || [];
  return [...new Set(found.map(email => email.split('@')[1]))];
}
function domainStem(domain) {
  return String(domain || '').toLowerCase().split('.')[0].replace(/[^a-z0-9]+/g, '');
}
function tokenOverlapScore(sourceTokens, queryTokens, weight=10, cap=36) {
  if (!sourceTokens.length || !queryTokens.length) return 0;
  const q = new Set(queryTokens);
  let hits = 0;
  for (const token of new Set(sourceTokens)) if (q.has(token)) hits += 1;
  return Math.min(cap, hits * weight);
}
function replyConfidence(score) {
  if (score >= 90) return 99;
  if (score >= 70) return 97;
  if (score >= 55) return 93;
  if (score >= 42) return 87;
  if (score >= 30) return 79;
  if (score >= 20) return 68;
  return 55;
}
function scoreReplyRecord(record, rawQuery) {
  const job = record?.job || {};
  const query = norm(rawQuery);
  const compactQuery = compactNorm(rawQuery);
  const qTokens = replyTokens(rawQuery);
  const company = norm(job.company);
  const companyCompact = compactNorm(job.company);
  const title = norm(job.title);
  const reasons = [];
  let score = 0;

  if (company && query.includes(company)) { score += 70; reasons.push('company name'); }
  else if (companyCompact.length >= 4 && compactQuery.includes(companyCompact)) { score += 62; reasons.push('company name'); }
  else {
    const companyScore = tokenOverlapScore(replyTokens(job.company), qTokens, 18, 45);
    if (companyScore) { score += companyScore; reasons.push('company words'); }
  }

  if (title && title.length >= 8 && query.includes(title)) { score += 45; reasons.push('job title'); }
  else {
    const titleScore = tokenOverlapScore(replyTokens(job.title), qTokens, 9, 36);
    if (titleScore) { score += titleScore; reasons.push('title words'); }
  }

  const rawLower = String(rawQuery || '').toLowerCase();
  const contactEmail = String(job.contact_email || '').toLowerCase();
  if (contactEmail && rawLower.includes(contactEmail)) { score += 75; reasons.push('same email'); }

  const domains = emailDomains(rawQuery);
  const storedDomain = contactEmail.includes('@') ? contactEmail.split('@')[1] : '';
  for (const domain of domains) {
    if (storedDomain && domain === storedDomain) { score += 55; reasons.push('same email domain'); continue; }
    const stem = domainStem(domain);
    if (stem.length >= 4 && companyCompact.length >= 4 && (stem.includes(companyCompact) || companyCompact.includes(stem))) {
      score += 48; reasons.push('company domain');
    }
  }

  return {record, score: Math.min(120, score), confidence: replyConfidence(score), reasons:[...new Set(reasons)]};
}
function matchReplyRecords(query) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  return trackedRecords()
    .filter(record => record?.job)
    .map(record => scoreReplyRecord(record, text))
    .filter(item => item.score >= 12)
    .sort((a,b) => b.score - a.score || String(b.record.applied_at || '').localeCompare(String(a.record.applied_at || '')))
    .slice(0, 3);
}
function replyMatcherEls() {
  return {
    overlay: document.querySelector('#replyMatcher'),
    input: document.querySelector('#replyInput'),
    results: document.querySelector('#replyResults'),
    status: document.querySelector('#replyMatchStatus')
  };
}
function openReplyMatcher() {
  const {overlay, input, results, status} = replyMatcherEls();
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('reply-modal-open');
  if (results) results.innerHTML = '';
  if (status) status.textContent = '';
  setTimeout(() => input?.focus(), 60);
}
function closeReplyMatcher() {
  const {overlay} = replyMatcherEls();
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('reply-modal-open');
}
function updateReplyStatus(recordKey, status) {
  const tracker = getTracker();
  const record = tracker[recordKey];
  if (!record) return null;
  tracker[recordKey] = {
    ...record,
    status,
    response_date: record.response_date || today(),
    updated_at: new Date().toISOString()
  };
  setTracker(tracker);
  return tracker[recordKey];
}
function activateFilter(name) {
  document.querySelectorAll('.filter').forEach(button => button.classList.toggle('active', button.dataset.filter === name));
  activeFilter = name;
}
function openTrackedApplication(recordKey) {
  const record = getTracker()[recordKey];
  if (!record?.job) return;
  closeReplyMatcher();
  activateFilter('APPLIED');
  render();
  setTimeout(() => {
    const card = cardById(record.job.id);
    if (!card) return;
    card.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(() => {
      const details = card.querySelector('.tracking-wrap');
      if (details) { details.open = true; focusTracking(details); }
    }, 260);
  }, 80);
}
function renderReplyResults(query) {
  const {results, status} = replyMatcherEls();
  if (!results || !status) return;
  const text = String(query || '').trim();
  if (text.length < 2) {
    results.innerHTML = '';
    status.textContent = '';
    return;
  }
  const matches = matchReplyRecords(text);
  if (!matches.length) {
    status.textContent = 'No confident match';
    results.innerHTML = '<div class="reply-empty"><b>No application matched yet.</b><span>Try the company name, sender email, job title, or a longer piece of the message.</span></div>';
    return;
  }
  status.textContent = `${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'}`;
  results.innerHTML = matches.map(({record, confidence, reasons}, index) => {
    const job = record.job || {};
    const reason = reasons.length ? reasons.slice(0, 2).join(' + ') : 'text similarity';
    return `<article class="reply-result" data-record-key="${esc(record.key)}">
      <div class="reply-result-head"><div><span class="reply-rank">${index === 0 ? 'BEST MATCH' : `MATCH ${index + 1}`}</span><h3>${esc(job.company || 'Unknown company')}</h3><p>${esc(job.title || 'Unknown position')}</p></div><span class="reply-confidence">${confidence}%</span></div>
      <div class="reply-result-meta">Applied ${esc(record.applied_at || '—')} · matched by ${esc(reason)}</div>
      <div class="reply-status-actions">
        <button type="button" data-reply-status="REJECTED">Rejected</button>
        <button type="button" data-reply-status="INTERVIEW">Interview</button>
        <button type="button" data-reply-status="REPLIED">Reply</button>
        <button type="button" data-reply-status="OFFER">Offer</button>
      </div>
      <button type="button" class="reply-open-tracking">Open tracking</button>
    </article>`;
  }).join('');

  results.querySelectorAll('[data-reply-status]').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.reply-result');
    const recordKey = card?.dataset.recordKey;
    if (!recordKey) return;
    const updated = updateReplyStatus(recordKey, button.dataset.replyStatus);
    if (!updated) return;
    render();
    status.textContent = `Saved · ${updated.job?.company || 'application'} → ${statusLabel(updated.status)}`;
    card.querySelectorAll('[data-reply-status]').forEach(x => x.classList.toggle('selected', x.dataset.replyStatus === updated.status));
  }));
  results.querySelectorAll('.reply-open-tracking').forEach(button => button.addEventListener('click', () => {
    const recordKey = button.closest('.reply-result')?.dataset.recordKey;
    if (recordKey) openTrackedApplication(recordKey);
  }));
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
  try {
    // localStorage intentionally: iOS can terminate a standalone PWA while the
    // user is inside Pracuj/JustJoin/NoFluff. sessionStorage is not reliable
    // enough for that app-to-app handoff.
    localStorage.setItem(RETURN_ANCHOR_KEY, JSON.stringify({
      ...anchor,
      scrollY: window.scrollY,
      savedAt: Date.now()
    }));
  } catch (_) {}
}
function getReturnAnchor() {
  try {
    const anchor = JSON.parse(localStorage.getItem(RETURN_ANCHOR_KEY) || 'null');
    if (!anchor || Date.now() - Number(anchor.savedAt || 0) > 30 * 60 * 1000) {
      localStorage.removeItem(RETURN_ANCHOR_KEY);
      return null;
    }
    return anchor;
  } catch { return null; }
}
function clearReturnAnchor() {
  try { localStorage.removeItem(RETURN_ANCHOR_KEY); } catch (_) {}
}
function restoreReturnAnchor(anchor) {
  if (!anchor?.id) return;
  const started = Date.now();
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  window.addEventListener('pointerdown', cancel, {once:true, passive:true});
  window.addEventListener('touchstart', cancel, {once:true, passive:true});

  const apply = () => {
    if (cancelled) return;
    const card = cardById(anchor.id);
    if (!card) return;
    const desiredTop = Number(anchor.top);
    const currentTop = card.getBoundingClientRect().top;
    const targetY = Math.max(0, window.scrollY + currentTop - (Number.isFinite(desiredTop) ? desiredTop : 120));
    if (Math.abs(window.scrollY - targetY) > 1) window.scrollTo({top: targetY, behavior: 'auto'});
  };

  // WebKit can apply its native restoration a little after pageshow/focus.
  // Re-anchor a few times, then stop so normal user scrolling is untouched.
  [0, 90, 260, 650].forEach(delay => setTimeout(apply, delay));
  setTimeout(() => {
    if (!cancelled && Date.now() - started < 1800) apply();
    clearReturnAnchor();
  }, 950);
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
    const armExternalReturn = () => saveReturnAnchor(job.id);
    openJob.addEventListener('pointerdown', armExternalReturn, {passive:true});
    openJob.addEventListener('touchstart', armExternalReturn, {passive:true});
    openJob.addEventListener('click', () => {
      armExternalReturn();
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
    const trackingSummary = trackingDetails.querySelector('summary');
    let trackingReturnAnchor = null;

    // Capture the card position before the details element expands. When the user
    // closes Tracking (or saves/clears it), return to that exact vacancy instead
    // of leaving the viewport down at the form controls.
    trackingSummary.addEventListener('click', () => {
      if (!trackingDetails.open) trackingReturnAnchor = captureCardAnchor(job.id);
    });

    trackingDetails.addEventListener('toggle', () => {
      if (trackingDetails.open) {
        if (!trackingReturnAnchor) trackingReturnAnchor = captureCardAnchor(job.id);
        if (markSeen(job.id)) updateSeenUi(job.id);
        focusTracking(trackingDetails);
        return;
      }
      if (trackingReturnAnchor) {
        const anchorToRestore = trackingReturnAnchor;
        trackingReturnAnchor = null;
        setTimeout(() => restoreAnchor(anchorToRestore), 40);
      }
    });

    node.querySelector('.save-tracking').addEventListener('click', () => {
      const anchorNow = trackingReturnAnchor || captureCardAnchor(job.id);
      const st = status.value;
      if (st && !appliedDate.value) appliedDate.value = today();
      saveTracking(job, {status: st, applied_at: appliedDate.value, channel: channel.value, response_date: responseDate.value, notes: notes.value});
      markSeen(job.id);
      trackingReturnAnchor = null;
      render({anchor: anchorNow});
    });
    node.querySelector('.clear-tracking').addEventListener('click', () => {
      const anchorNow = trackingReturnAnchor || captureCardAnchor(job.id);
      saveTracking(job, {status: ''});
      trackingReturnAnchor = null;
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
        trackingReturnAnchor = captureCardAnchor(job.id);
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
    if (returnAnchor) restoreReturnAnchor(returnAnchor);
    return;
  }
  await loadJobs(true, anchor);
  if (returnAnchor) restoreReturnAnchor(returnAnchor);
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

document.querySelector('#openReplyMatcher')?.addEventListener('click', openReplyMatcher);
document.querySelector('#closeReplyMatcher')?.addEventListener('click', closeReplyMatcher);
document.querySelector('#matchReply')?.addEventListener('click', () => renderReplyResults(document.querySelector('#replyInput')?.value || ''));
let replyMatchTimer = null;
document.querySelector('#replyInput')?.addEventListener('input', event => {
  clearTimeout(replyMatchTimer);
  replyMatchTimer = setTimeout(() => renderReplyResults(event.target.value), 220);
});
document.querySelector('#replyMatcher')?.addEventListener('click', event => {
  if (event.target?.id === 'replyMatcher') closeReplyMatcher();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('#replyMatcher')?.hidden) closeReplyMatcher();
});

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
  navigator.serviceWorker.register('service-worker-v12.js', {updateViaCache:'none'})
    .then(registration => registration.update())
    .catch(() => {});
}
const startupReturnAnchor = getReturnAnchor();
loadJobs(false, startupReturnAnchor).then(() => {
  if (startupReturnAnchor) restoreReturnAnchor(startupReturnAnchor);
});
