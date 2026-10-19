// Compact card UI: legacy Why score box hidden; fit_notes and scoring stay intact.

function hasInterestTag(job, tag) {
  return Array.isArray(job.interest_tags) && job.interest_tags.includes(tag);
}

const _v19BaseRender = render;
render = function(options={}) {
  _v19BaseRender(options);
  renderFilteredSummary();
  document.querySelectorAll('.job-card').forEach(card => {
    const job = jobs.find(j => String(j.id) === card.dataset.jobId);
    if (!job) return;
    if (hasInterestTag(job, 'automation') && !card.querySelector('.chip-interest')) {
      card.querySelector('.chips')?.insertAdjacentHTML('afterbegin', '<span class="chip chip-interest">Automation</span>');
    }
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
