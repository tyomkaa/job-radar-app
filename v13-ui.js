// Job Radar v0.3 UI overlay. Keeps the stable v12 interaction/tracking code intact
// while changing the discovery presentation to ACTIVE / SCANNED and
// APPLY / POSSIBLE / STRETCH.

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
  statsEl.innerHTML = stat('ACTIVE', jobs.length) + stat('TODAY', `+${addedToday}`) + stat('UNSEEN', unseen) +
    stat('SCANNED', scanned || '—') + stat('APPLIED', records.length) + stat('REPLIES', replies) +
    stat('INTERVIEWS', interviews) + stat('OFFERS', offers);
};

getVisibleJobs = function(pinnedId='') {
  const tracker = getTracker(), seen = seenIds(), saved = savedIds();
  let pool = [...jobs];
  if (activeFilter === 'APPLIED' || activeFilter === 'REPLIED') pool = [...jobs, ...historyAsJobs()];
  const filtered = pool.filter(j => {
    const rec = tracker[jobKey(j)];
    if (pinnedId && String(j.id) === String(pinnedId)) return true;
    if (activeFilter === 'ALL') return true;
    if (['APPLY', 'POSSIBLE', 'STRETCH'].includes(activeFilter)) return tierFor(j) === activeFilter;
    if (activeFilter === 'TODAY') return isFirstFoundToday(j);
    if (activeFilter === 'UNSEEN') return !seen.has(j.id) && !rec;
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

const jobsObserverV13 = new MutationObserver(() => decorateAllCards());
jobsObserverV13.observe(jobsEl, {childList:true});

// If the base script already rendered before this overlay loaded, refresh the
// presentation immediately without refetching data.
if (jobs.length) render();
