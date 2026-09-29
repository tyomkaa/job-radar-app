// Job Radar v0.3 UI overlay. Keeps the stable v12 interaction/tracking code intact
// while changing the discovery presentation to ACTIVE / SCANNED and
// APPLY / POSSIBLE / STRETCH, plus a local Application Queue and Assistant.

const QUEUE_KEY = 'jobRadarApplicationQueueV1';
const ASSISTANT_KEY = 'jobRadarApplicationAssistantV1';
const APPLICATION_DATA_KEY = 'jobRadarApplicationDataV1';
let assistantJobId = '';
let reopenAssistantAfterData = false;

function queueIds() {
  try { return new Set(JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')); }
  catch { return new Set(); }
}
function setQueueIds(set) { localStorage.setItem(QUEUE_KEY, JSON.stringify([...set])); }
function toggleQueue(id) {
  const set = queueIds();
  set.has(id) ? set.delete(id) : set.add(id);
  setQueueIds(set);
  render({anchor:captureCardAnchor(id)});
}

function getAssistantState() {
  try { return JSON.parse(localStorage.getItem(ASSISTANT_KEY) || '{}'); }
  catch { return {}; }
}
function setAssistantState(value) { localStorage.setItem(ASSISTANT_KEY, JSON.stringify(value)); }
function assistantRecord(job) {
  const state = getAssistantState();
  return state[jobKey(job)] || {checks:{}, notes:'', prepared:false, updated_at:''};
}
function saveAssistantRecord(job, patch) {
  const state = getAssistantState();
  const key = jobKey(job);
  const current = state[key] || {checks:{}, notes:'', prepared:false};
  state[key] = {...current, ...patch, updated_at:new Date().toISOString()};
  setAssistantState(state);
  return state[key];
}

function getApplicationData() {
  try { return JSON.parse(localStorage.getItem(APPLICATION_DATA_KEY) || '{}'); }
  catch { return {}; }
}
function setApplicationData(value) { localStorage.setItem(APPLICATION_DATA_KEY, JSON.stringify(value)); }
function applicationDataFields() {
  return [
    ['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Current location'],
    ['linkedin', 'LinkedIn'], ['portfolio', 'GitHub / portfolio'], ['work_authorization', 'Work authorization'],
    ['notice_period', 'Notice period'], ['available_start', 'Available start'], ['salary_expectation', 'Salary expectation'],
    ['languages', 'Languages'], ['short_profile', 'Short profile']
  ];
}
function fillApplicationDataForm() {
  const data = getApplicationData();
  document.querySelectorAll('[data-profile-field]').forEach(input => { input.value = data[input.dataset.profileField] || ''; });
  const status = document.querySelector('#applicationDataStatus');
  if (status) status.textContent = Object.values(data).some(Boolean) ? 'Saved locally on this device.' : 'No reusable application data saved yet.';
}
function openApplicationData(fromAssistant=false) {
  reopenAssistantAfterData = !!fromAssistant;
  if (fromAssistant) document.querySelector('#applicationAssistant').hidden = true;
  fillApplicationDataForm();
  const overlay = document.querySelector('#applicationData');
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('reply-modal-open');
}
function closeApplicationData() {
  const overlay = document.querySelector('#applicationData');
  if (!overlay) return;
  overlay.hidden = true;
  if (reopenAssistantAfterData && assistantJob()) {
    reopenAssistantAfterData = false;
    openApplicationAssistant(assistantJob());
    return;
  }
  reopenAssistantAfterData = false;
  document.body.classList.remove('reply-modal-open');
}
function saveApplicationDataForm() {
  const data = {};
  document.querySelectorAll('[data-profile-field]').forEach(input => { data[input.dataset.profileField] = String(input.value || '').trim(); });
  setApplicationData(data);
  const status = document.querySelector('#applicationDataStatus');
  if (status) status.textContent = 'Saved locally ✓';
  renderAssistantQuickAnswers();
}
async function copyText(value, button) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (button) { const original = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => { button.textContent = original; }, 900); }
  } catch (_) {
    const area = document.createElement('textarea'); area.value = value; area.style.position='fixed'; area.style.opacity='0';
    document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    if (button) { const original = button.textContent; button.textContent = 'Copied ✓'; setTimeout(() => { button.textContent = original; }, 900); }
  }
}
function renderAssistantQuickAnswers() {
  const host = document.querySelector('#assistantQuickAnswers');
  if (!host) return;
  const data = getApplicationData();
  const values = applicationDataFields().filter(([key]) => String(data[key] || '').trim());
  if (!values.length) {
    host.innerHTML = '<div class="quick-answer-empty">Add your reusable application data once, then copy answers here with one tap.</div>';
    return;
  }
  host.innerHTML = values.map(([key,label]) => `<div class="quick-answer"><div><b>${esc(label)}</b><span>${esc(data[key])}</span></div><button type="button" data-copy-profile="${esc(key)}">Copy</button></div>`).join('');
  host.querySelectorAll('[data-copy-profile]').forEach(button => button.addEventListener('click', () => {
    const value = getApplicationData()[button.dataset.copyProfile] || '';
    copyText(value, button);
  }));
}

function tierFor(job) {
  const explicit = String(job?.recommendation_tier || '').toUpperCase();
  if (['APPLY', 'POSSIBLE', 'STRETCH'].includes(explicit)) return explicit;
  const score = Number(job?.fit_score || 0);
  const level = String(job?.match_level || '').toUpperCase();
  if (score >= 72 && level === 'STRONG') return 'APPLY';
  if (score >= 58) return 'POSSIBLE';
  return 'STRETCH';
}

function experienceLabel(job) {
  const years = Number(job?.experience_required_years || 0);
  if (!years) return 'Not stated';
  if (years >= 4) return `${years}+ years`;
  if (years === 3) return '3+ years';
  if (years === 2) return '2 years';
  return '1 year';
}

function sourceChannel(job) {
  const source = String(job?.source || '').toLowerCase();
  if (source.startsWith('greenhouse:') || source.startsWith('lever:')) return 'Company site';
  if (source.includes('pracuj') || source.includes('justjoin') || source.includes('nofluff') || source.includes('theprotocol') || source.includes('rocketjobs')) return 'Job board';
  return '';
}

function assistantRequirements(job) {
  const skills = Array.isArray(job.required_skills) ? job.required_skills.filter(Boolean) : [];
  if (skills.length) return skills.slice(0, 6);
  const expectations = Array.isArray(job.summary_expectations) ? job.summary_expectations.filter(Boolean) : [];
  if (expectations.length) return expectations.slice(0, 6);
  return ['Review the vacancy requirements on the application page before submitting.'];
}

function assistantJob() {
  return jobs.find(j => String(j.id) === String(assistantJobId)) || null;
}

function closeApplicationAssistant() {
  const overlay = document.querySelector('#applicationAssistant');
  if (!overlay) return;
  overlay.hidden = true;
  assistantJobId = '';
  document.body.classList.remove('reply-modal-open');
}

function persistAssistantForm() {
  const job = assistantJob();
  if (!job) return null;
  const checks = {};
  document.querySelectorAll('[data-assistant-check]').forEach(input => { checks[input.dataset.assistantCheck] = !!input.checked; });
  const notes = document.querySelector('#assistantNotes')?.value || '';
  return saveAssistantRecord(job, {checks, notes});
}

function openApplicationAssistant(job) {
  const overlay = document.querySelector('#applicationAssistant');
  if (!overlay || !job) return;
  assistantJobId = String(job.id);
  const state = assistantRecord(job);
  const tier = tierFor(job);
  const tierEl = document.querySelector('#assistantTier');
  tierEl.textContent = tier;
  tierEl.className = `level tier-${tier.toLowerCase()}`;
  document.querySelector('#assistantJobTitle').textContent = job.title || 'Vacancy';
  document.querySelector('#assistantCompany').textContent = job.company || 'Company not parsed';
  document.querySelector('#assistantFacts').innerHTML = [
    `<span><b>Score</b> ${Number(job.fit_score || 0)}%</span>`,
    `<span><b>Experience</b> ${esc(experienceLabel(job))}</span>`,
    `<span><b>Contract</b> ${esc(job.contract || 'Not confirmed')}</span>`,
    `<span><b>Mode</b> ${esc(job.work_mode || 'Not stated')}</span>`,
    `<span><b>Location</b> ${esc(job.location || 'Not stated')}</span>`
  ].join('');
  const req = document.querySelector('#assistantRequirements');
  req.innerHTML = assistantRequirements(job).map(x => `<li>${esc(x)}</li>`).join('');
  renderAssistantQuickAnswers();
  document.querySelectorAll('[data-assistant-check]').forEach(input => {
    input.checked = !!state.checks?.[input.dataset.assistantCheck];
  });
  document.querySelector('#assistantNotes').value = state.notes || '';
  const prepared = document.querySelector('#assistantPrepared');
  prepared.textContent = state.prepared ? 'Prepared ✓' : 'Mark prepared';
  prepared.classList.toggle('prepared', !!state.prepared);
  const open = document.querySelector('#assistantOpenJob');
  open.href = job.apply_url || job.url;
  overlay.hidden = false;
  document.body.classList.add('reply-modal-open');
}

function markAssistantApplied() {
  const job = assistantJob();
  if (!job) return;
  persistAssistantForm();
  const channel = sourceChannel(job);
  saveTracking(job, {status:'APPLIED', applied_at:today(), channel, response_date:'', notes:assistantRecord(job).notes || ''});
  markSeen(job.id);
  const set = queueIds();
  set.delete(job.id); setQueueIds(set);
  closeApplicationAssistant();
  render({anchor:captureCardAnchor(job.id)});
}

renderStats = function() {
  const tracker = getTracker();
  const seen = seenIds();
  const unseen = jobs.filter(j => !seen.has(j.id) && !tracker[jobKey(j)]).length;
  const addedToday = jobs.filter(isFirstFoundToday).length;
  const records = Object.values(tracker);
  const replies = records.filter(r => responseStatuses().has(r.status)).length;
  const interviews = records.filter(r => r.status === 'INTERVIEW' || r.status === 'OFFER').length;
  const offers = records.filter(r => r.status === 'OFFER').length;
  const scanned = Number(meta.found || 0);
  const queued = jobs.filter(j => queueIds().has(j.id)).length;
  statsEl.innerHTML = stat('ACTIVE', jobs.length) + stat('TODAY', `+${addedToday}`) + stat('UNSEEN', unseen) +
    stat('SCANNED', scanned || '—') + stat('QUEUE', queued) + stat('APPLIED', records.length) +
    stat('REPLIES', replies) + stat('INTERVIEWS', interviews) + stat('OFFERS', offers);
};

getVisibleJobs = function(pinnedId='') {
  const tracker = getTracker(), seen = seenIds(), saved = savedIds(), queued = queueIds();
  let pool = [...jobs];
  if (activeFilter === 'APPLIED' || activeFilter === 'REPLIED') pool = [...jobs, ...historyAsJobs()];
  const filtered = pool.filter(j => {
    const rec = tracker[jobKey(j)];
    if (pinnedId && String(j.id) === String(pinnedId)) return true;
    if (activeFilter === 'ALL') return true;
    if (['APPLY', 'POSSIBLE', 'STRETCH'].includes(activeFilter)) return tierFor(j) === activeFilter;
    if (activeFilter === 'TODAY') return isFirstFoundToday(j);
    if (activeFilter === 'UNSEEN') return !seen.has(j.id) && !rec;
    if (activeFilter === 'QUEUE') return queued.has(j.id);
    if (activeFilter === 'SAVED') return saved.has(j.id);
    if (activeFilter === 'APPLIED') return !!rec;
    if (activeFilter === 'REPLIED') return !!rec && responseStatuses().has(rec.status);
    return true;
  });
  return sortJobs(filtered);
};

const _v12RecordSnapshot = recordSnapshot;
recordSnapshot = function(job, status='APPLIED') {
  const record = _v12RecordSnapshot(job, status);
  if (record?.job) {
    record.job.recommendation_tier = tierFor(job);
    record.job.experience_required_years = Number(job.experience_required_years || 0);
  }
  return record;
};

function decorateJobCard(card) {
  if (!card || card.dataset.v13Decorated === '1') return;
  const job = jobs.find(j => String(j.id) === String(card.dataset.jobId));
  if (!job) return;
  const rec = getTracker()[jobKey(job)];
  const tier = tierFor(job);
  const level = card.querySelector('.level');
  if (level) {
    const prefix = job._historyOnly ? '' : (isFirstFoundToday(job) ? 'TODAY · ' : (!seenIds().has(job.id) && !rec ? 'UNSEEN · ' : ''));
    level.textContent = job._historyOnly ? `${tier} · HISTORY` : `${prefix}${tier}`;
    level.classList.remove('tier-apply', 'tier-possible', 'tier-stretch');
    level.classList.add(`tier-${tier.toLowerCase()}`);
  }
  const metaExtra = card.querySelector('.meta-extra');
  if (metaExtra && !metaExtra.querySelector('.experience-required')) {
    const span = document.createElement('span');
    span.className = 'experience-required';
    span.innerHTML = `<b>Experience:</b> ${esc(experienceLabel(job))}`;
    metaExtra.prepend(span);
  }

  const actions = card.querySelector('.actions');
  if (actions && !actions.querySelector('.queue-btn')) {
    const queued = queueIds().has(job.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `queue-btn ${queued ? 'queued' : ''}`;
    button.textContent = queued ? 'Queued ✓' : 'Add to queue';
    button.addEventListener('click', () => toggleQueue(job.id));
    actions.appendChild(button);
  }
  if (actions && queueIds().has(job.id) && !actions.querySelector('.assistant-btn')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assistant-btn';
    const state = assistantRecord(job);
    button.textContent = state.prepared ? 'Prepared ✓' : 'Prepare';
    button.addEventListener('click', () => openApplicationAssistant(job));
    actions.appendChild(button);
  }
  card.dataset.v13Decorated = '1';
}

function decorateAllCards() {
  document.querySelectorAll('.job-card').forEach(card => {
    card.dataset.v13Decorated = '0';
    decorateJobCard(card);
  });
}

const _v12UpdateSeenUi = updateSeenUi;
updateSeenUi = function(id) {
  _v12UpdateSeenUi(id);
  const card = cardById(id);
  if (card) {
    card.dataset.v13Decorated = '0';
    decorateJobCard(card);
  }
};

exportHistory = function() {
  const payload = {
    format:'job-radar-application-history', version:5, exported_at:new Date().toISOString(),
    records:getTracker(), seen_jobs:[...seenIds()], saved_jobs:[...savedIds()], queued_jobs:[...queueIds()],
    application_assistant:getAssistantState(), application_data:getApplicationData()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `job-radar-history-${today()}.json`; a.click(); URL.revokeObjectURL(url);
};

importHistory = async function(file) {
  try {
    const payload = JSON.parse(await file.text()), incoming = payload.records || payload;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Invalid history format');
    setTracker({...getTracker(), ...incoming});
    if (Array.isArray(payload.seen_jobs)) localStorage.setItem('seenJobs', JSON.stringify([...new Set([...seenIds(), ...payload.seen_jobs])]));
    if (Array.isArray(payload.saved_jobs)) localStorage.setItem('savedJobs', JSON.stringify([...new Set([...savedIds(), ...payload.saved_jobs])]));
    if (Array.isArray(payload.queued_jobs)) localStorage.setItem(QUEUE_KEY, JSON.stringify([...new Set([...queueIds(), ...payload.queued_jobs])]));
    if (payload.application_assistant && typeof payload.application_assistant === 'object' && !Array.isArray(payload.application_assistant)) setAssistantState({...getAssistantState(), ...payload.application_assistant});
    if (payload.application_data && typeof payload.application_data === 'object' && !Array.isArray(payload.application_data)) setApplicationData({...getApplicationData(), ...payload.application_data});
    render(); alert('Application backup imported.');
  } catch { alert('Could not import this backup file.'); }
};

document.querySelector('#openApplicationData')?.addEventListener('click', () => openApplicationData(false));
document.querySelector('#closeApplicationData')?.addEventListener('click', closeApplicationData);
document.querySelector('#applicationData')?.addEventListener('click', event => { if (event.target?.id === 'applicationData') closeApplicationData(); });
document.querySelector('#saveApplicationData')?.addEventListener('click', saveApplicationDataForm);
document.querySelector('#clearApplicationData')?.addEventListener('click', () => {
  localStorage.removeItem(APPLICATION_DATA_KEY); fillApplicationDataForm(); renderAssistantQuickAnswers();
  const status = document.querySelector('#applicationDataStatus'); if (status) status.textContent = 'Saved application data cleared.';
});
document.querySelector('#editApplicationDataFromAssistant')?.addEventListener('click', () => { persistAssistantForm(); openApplicationData(true); });

document.querySelector('#closeApplicationAssistant')?.addEventListener('click', closeApplicationAssistant);
document.querySelector('#applicationAssistant')?.addEventListener('click', event => {
  if (event.target?.id === 'applicationAssistant') closeApplicationAssistant();
});
document.querySelector('#assistantNotes')?.addEventListener('input', persistAssistantForm);
document.querySelectorAll('[data-assistant-check]').forEach(input => input.addEventListener('change', persistAssistantForm));
document.querySelector('#assistantPrepared')?.addEventListener('click', () => {
  const job = assistantJob(); if (!job) return;
  const current = persistAssistantForm() || assistantRecord(job);
  const updated = saveAssistantRecord(job, {prepared:!current.prepared});
  const button = document.querySelector('#assistantPrepared');
  button.textContent = updated.prepared ? 'Prepared ✓' : 'Mark prepared';
  button.classList.toggle('prepared', !!updated.prepared);
  const card = cardById(job.id); if (card) { card.dataset.v13Decorated='0'; decorateJobCard(card); }
});
document.querySelector('#assistantOpenJob')?.addEventListener('click', () => {
  const job = assistantJob(); if (!job) return;
  persistAssistantForm(); markSeen(job.id); saveReturnAnchor(job.id); updateSeenUi(job.id);
});
document.querySelector('#assistantMarkApplied')?.addEventListener('click', markAssistantApplied);
document.querySelector('#assistantRemoveQueue')?.addEventListener('click', () => {
  const job = assistantJob(); if (!job) return;
  persistAssistantForm(); const set = queueIds(); set.delete(job.id); setQueueIds(set);
  closeApplicationAssistant(); render({anchor:captureCardAnchor(job.id)});
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!document.querySelector('#applicationData')?.hidden) closeApplicationData();
  else if (!document.querySelector('#applicationAssistant')?.hidden) closeApplicationAssistant();
});

const jobsObserverV13 = new MutationObserver(() => decorateAllCards());
jobsObserverV13.observe(jobsEl, {childList:true});

// If the base script already rendered before this overlay loaded, refresh the
// presentation immediately without refetching data.
if (jobs.length) render();
