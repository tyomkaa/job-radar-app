// Recently re-observed (not newly published) source offers which passed all
// strict backend eligibility gates but were first found over a week ago.
// This is a separate, honest manual check shelf in the existing Daily screen.
// No AI calls, extra tabs, or automatic APPLY statuses.
(function() {
  'use strict';
  const allowed = ['justjoin.it','pracuj.pl','nofluffjobs.com','rocketjobs.pl',
                   'theprotocol.it','greenhouse.io','lever.co'];
  const safeUrl = raw => {
    try {
      const parsed = new URL(String(raw || ''));
      return parsed.protocol === 'https:' &&
        allowed.some(host => parsed.hostname === host ||
                             parsed.hostname.endsWith('.' + host))
        ? parsed.href : null;
    } catch (_) { return null; }
  };
  const put = (parent, type, className, value) => {
    const node = document.createElement(type);
    if (className) node.className = className;
    node.textContent = String(value || '');
    parent.appendChild(node);
    return node;
  };
  function displayStillListed() {
    const daily = document.querySelector('#dailyBrief');
    if (!daily) return;
    let host = document.querySelector('#stillListedReview');
    if (!host) {
      host = document.createElement('section');
      host.id = 'stillListedReview';
      host.className = 'manual-lead-section still-listed-section';
      const manual = document.querySelector('#manualReviewLeads');
      if (manual) manual.insertAdjacentElement('beforebegin', host);
      else daily.insertAdjacentElement('afterend', host);
    }
    host.hidden = activeFilter !== 'DAILY';
    if (host.hidden) return;
    const ids = Array.isArray(meta?.still_listed_ids) ?
      meta.still_listed_ids.slice(0, 3) : [];
    const fresh = new Set((meta?.daily_pick_ids || []).map(String));
    const feedback = dailyFeedback();
    const tracker = getTracker();
    const reviewed = [];
    const used = new Set();
    for (const id of ids) {
      const job = jobs.find(x => String(x.id) === String(id));
      if (!job || fresh.has(String(job.id)) || used.has(String(job.id))) continue;
      used.add(String(job.id));
      const link = safeUrl(job.url);
      const tier = String(job.recommendation_tier || '');
      const contract = String(job.contract || '');
      const seniority = String(job.seniority || '');
      const review = typeof aiReviewFor === 'function' ? aiReviewFor(job) : job.ai_review;
      if (!link || !['APPLY','POSSIBLE'].includes(tier) ||
          !/employment contract|umowa o prac/i.test(contract) ||
          /\b(?:mid|regular|senior|lead|expert|manager)\b/i.test(seniority) ||
          Number(job.experience_required_years || 0) > 2 ||
          (review && review.verdict === 'SKIP') ||
          feedback[jobKey(job)] || tracker[jobKey(job)]) continue;
      reviewed.push({job, link, review});
    }
    host.replaceChildren();
    if (!reviewed.length) {
      host.hidden = true;
      return;
    }
    const intro = document.createElement('div');
    intro.className = 'manual-lead-header';
    put(intro, 'h2', '', 'Still listed · ' + reviewed.length);
    put(intro, 'p', '',
      'Older vacancies found again in the latest successful board scan. ' +
      'Not new postings or confirmed employer openings. Recheck availability ' +
      'and requirements before applying. No extra AI analysis used.');
    host.appendChild(intro);
    const list = document.createElement('div');
    list.className = 'manual-lead-list';
    for (const {job,link,review} of reviewed) {
      const card = document.createElement('article');
      card.className = 'manual-lead-card still-listed-card';
      put(card,'div','manual-lead-status',
        review?.verdict === 'CHECK' ? 'STILL LISTED · AI CHECK' :
        'STILL LISTED · NOT NEW');
      put(card,'h3','manual-lead-title',job.title);
      put(card,'p','manual-lead-company',job.company);
      const first = String(job.first_found_at || '').slice(0, 10);
      put(card,'p','manual-lead-facts',
        [job.location, job.work_mode, 'UoP listed — recheck with employer',
         first ? 'First seen ' + first : 'Previously seen']
          .filter(Boolean).join(' · '));
      const actions = document.createElement('div');
      actions.className = 'manual-lead-actions';
      const open = document.createElement('a');
      open.className = 'manual-lead-open';
      open.href = link;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = 'Open original offer';
      actions.appendChild(open);
      const hide = document.createElement('button');
      hide.className = 'manual-lead-hide';
      hide.type = 'button';
      hide.textContent = 'Not relevant';
      hide.addEventListener('click',() => {
        saveDailyFeedback(job, 'Other');
        render();
      });
      actions.appendChild(hide);
      card.appendChild(actions);
      list.appendChild(card);
    }
    host.appendChild(list);
  }
  const oldRender = render;
  render = function(options = {}) {
    oldRender(options);
    displayStillListed();
  };
  displayStillListed();
})();