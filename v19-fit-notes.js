// Job Radar v0.4.0: explain every match and where filtered vacancies went.
// The score is CV fit only; interests (Automation) are a separate filter.

function fitNotesHtml(job) {
  const notes = job.fit_notes || {};
  if (!notes.tier_reason && !notes.direction) return '';
  const rows = [];
  if (notes.tier_reason) rows.push(`<div class="fit-reason">${esc(notes.tier_reason)}</div>`);
  const evidence = notes.evidence === 'work' ? 'experience from work' : 'experience from projects only';
  if (notes.direction) rows.push(`<div><b>Direction:</b> ${esc(notes.direction)} · ${esc(evidence)}</div>`);
  if ((notes.matches || []).length) {
    rows.push(`<div class="fit-good"><b>Matches your CV:</b><ul>${notes.matches.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  }
  if ((notes.concerns || []).length) {
    rows.push(`<div class="fit-warn"><b>Watch out:</b><ul>${notes.concerns.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  }
  if (notes.suggested_cv) rows.push(`<div><b>Suggested CV:</b> ${esc(notes.suggested_cv)}</div>`);
  return `<details class="fit-why"><summary>Why ${esc(tierFor(job))} · ${Number(job.fit_score || 0)}%</summary><div class="fit-body">${rows.join('')}</div></details>`;
}

function hasInterestTag(job, tag) {
  return Array.isArray(job.interest_tags) && job.interest_tags.includes(tag);
}

const _v19BaseRender = render;
render = function(options={}) {
  _v19BaseRender(options);
  renderFilteredSummary();
  document.querySelectorAll('.job-card').forEach(card => {
    const job = jobs.find(j => String(j.id) === card.dataset.jobId);
    if (!job || card.querySelector('.fit-why')) return;
    if (hasInterestTag(job, 'automation')) {
      card.querySelector('.chips')?.insertAdjacentHTML('afterbegin', '<span class="chip chip-interest">Automation</span>');
    }
    const html = fitNotesHtml(job);
    if (html) card.querySelector('.chips')?.insertAdjacentHTML('afterend', html);
  });
};

const _v13GetVisibleJobs = getVisibleJobs;
getVisibleJobs = function(pinnedId='') {
  if (activeFilter !== 'AUTOMATION') return _v13GetVisibleJobs(pinnedId);
  return sortJobs(jobs.filter(j => hasInterestTag(j, 'automation') || (pinnedId && String(j.id) === String(pinnedId))));
};

function renderFilteredSummary() {
  let host = document.querySelector('#filteredSummary');
  const filtered = meta.filtered || {};
  const entries = Object.entries(filtered).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { if (host) host.remove(); return; }
  if (!host) {
    host = document.createElement('details');
    host.id = 'filteredSummary';
    host.className = 'filtered-summary';
    document.querySelector('#stats')?.insertAdjacentElement('afterend', host);
  }
  const wasOpen = host.open;
  const found = Number(meta.found || 0);
  const shown = Number(meta.accepted || jobs.length || 0);
  const dropped = entries.reduce((sum, [, n]) => sum + n, 0);
  host.innerHTML = `<summary>Where the other vacancies went · ${shown} shown of ${found || dropped + shown}</summary>` +
    `<ul>${entries.map(([label, n]) => `<li><span>${esc(label)}</span><b>${n}</b></li>`).join('')}</ul>` +
    '<p>Only vacancies that pass contract, location, seniority and experience checks and match your CV are shown.</p>';
  host.open = wasOpen;
}

if (jobs.length) render();
