// A single Daily job list: include live re-observed strict matches as regular
// full-featured cards, after the current priority picks. No extra shelf or tab.
// A still-listed position is NOT a new offer and never auto-marked APPLY.
(function () {
  'use strict';
  const allowed = ['justjoin.it', 'pracuj.pl', 'nofluffjobs.com',
                   'rocketjobs.pl', 'theprotocol.it', 'greenhouse.io', 'lever.co'];
  function safeUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      return url.protocol === 'https:' && allowed.some(domain =>
        url.hostname === domain || url.hostname.endsWith('.' + domain));
    } catch (_) { return false; }
  }

  function olderEligible() {
    if (activeFilter !== 'DAILY' || !Array.isArray(meta?.still_listed_ids))
      return [];
    const picked = new Set((meta?.daily_pick_ids || []).map(String));
    const tracker = getTracker();
    const feedback = dailyFeedback();
    const found = [], used = new Set();
    for (const id of meta.still_listed_ids.slice(0, 3)) {
      const job = jobs.find(item => String(item.id) === String(id));
      if (!job || used.has(String(job.id)) || picked.has(String(job.id))) continue;
      used.add(String(job.id));
      const review = typeof aiReviewFor === 'function' ? aiReviewFor(job) : job.ai_review;
      const tier = String(job.recommendation_tier || '');
      if (!safeUrl(job.url) || !['APPLY','POSSIBLE'].includes(tier) ||
          !/umowa o prac|employment contract/i.test(String(job.contract || '')) ||
          /\b(?:mid|regular|senior|lead|expert)\b/i.test(String(job.seniority || '')) ||
          Number(job.experience_required_years || 0) > 2 ||
          review?.verdict === 'SKIP' ||
          tracker[jobKey(job)] || feedback[jobKey(job)]) continue;
      found.push(job);
    }
    return found;
  }

  // Use existing cards and their tracking, Prepare and saved-list controls.
  // The priority Daily list stays FIRST; re-observed listings are appended.
  const originalVisible = getVisibleJobs;
  getVisibleJobs = function(pinnedId = '') {
    const current = originalVisible(pinnedId);
    if (activeFilter !== 'DAILY') return current;
    const ids = new Set(current.map(x => String(x.id)));
    for (const job of olderEligible()) {
      if (!ids.has(String(job.id))) {
        current.push(job);
        ids.add(String(job.id));
      }
    }
    return current;
  };

  const originalRender = render;
  render = function(options = {}) {
    originalRender(options);
    if (activeFilter !== 'DAILY') return;
    const olderIds = new Set(olderEligible().map(x => String(x.id)));
    document.querySelectorAll('#jobs .job-card').forEach(card => {
      if (!olderIds.has(String(card.dataset.jobId))) return;
      const label = card.querySelector('.level');
      if (label) {
        label.textContent = 'STILL LISTED · CHECK';
        label.classList.remove('tier-apply', 'tier-stretch');
        label.classList.add('tier-possible');
      }
      const job = jobs.find(x => String(x.id) === String(card.dataset.jobId));
      if (!job || card.querySelector('.daily-reseen-note')) return;
      const note = document.createElement('p');
      note.className = 'daily-reseen-note';
      note.textContent = 'Found again on the latest board scan · First seen ' +
        String(job.first_found_at || 'previously').slice(0, 10) +
        ' · Not a new posting. Confirm the vacancy is still open.';
      card.querySelector('.actions')?.insertAdjacentElement('afterend', note);
    });
  };
})();
