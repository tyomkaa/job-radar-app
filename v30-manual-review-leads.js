// Independently discovered public job-board leads. They have NOT passed
// employer-level qualification checks or AI review. Never label them APPLY.
(function () {
  'use strict';
  const STORE = 'jobRadarManualLeadsHiddenV1';
  const allowed = ['justjoin.it','pracuj.pl','nofluffjobs.com','rocketjobs.pl',
                   'theprotocol.it','greenhouse.io','lever.co'];
  const safeUrl = raw => {
    try {
      const value = new URL(String(raw || ''));
      return value.protocol === 'https:' &&
        allowed.some(domain => value.hostname === domain ||
                                value.hostname.endsWith('.' + domain))
        ? value.href : null;
    } catch (_) { return null; }
  };
  const hiddenLeads = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORE) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  };
  const addText = (parent, tag, name, value) => {
    const el = document.createElement(tag);
    if (name) el.className = name;
    el.textContent = String(value || '');
    parent.appendChild(el);
    return el;
  };
  function renderManualLeads() {
    const daily = document.querySelector('#dailyBrief');
    if (!daily) return;
    let host = document.querySelector('#manualReviewLeads');
    if (!host) {
      host = document.createElement('section');
      host.id = 'manualReviewLeads';
      host.className = 'manual-lead-section';
      daily.insertAdjacentElement('afterend', host);
    }
    host.hidden = activeFilter !== 'DAILY';
    if (host.hidden) return;

    const source = Array.isArray(meta?.manual_review_leads) ?
      meta.manual_review_leads.slice(0, 10) : [];
    const ignored = hiddenLeads();
    const candidates = source.filter(x =>
      x && x.review_status === 'UNVERIFIED' &&
      safeUrl(x.url) && !ignored[safeUrl(x.url)]);
    host.replaceChildren();
    if (!candidates.length) {
      host.hidden = true;
      return;
    }
    const head = document.createElement('div');
    head.className = 'manual-lead-header';
    addText(head, 'h2', '', 'Worth checking · ' + candidates.length);
    addText(head, 'p', '', 'Extra junior IT leads found outside the strict Daily Picks filter. ' +
      'Not AI-approved or verified: check the employer’s required experience, ' +
      'contract and location before applying.');
    host.appendChild(head);

    const list = document.createElement('div');
    list.className = 'manual-lead-list';
    for (const item of candidates) {
      const url = safeUrl(item.url);
      const card = document.createElement('article');
      card.className = 'manual-lead-card';
      addText(card, 'div', 'manual-lead-status', 'REVIEW ONLY · UNVERIFIED');
      addText(card, 'h3', 'manual-lead-title', item.title);
      addText(card, 'p', 'manual-lead-company', item.company);
      addText(card, 'p', 'manual-lead-facts',
        [item.location, item.work_mode, 'UoP on job board — not employer-confirmed']
          .filter(Boolean).join(' · '));
      const actions = document.createElement('div');
      actions.className = 'manual-lead-actions';
      const link = document.createElement('a');
      link.className = 'manual-lead-open';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open original offer';
      actions.appendChild(link);
      const hide = document.createElement('button');
      hide.type = 'button';
      hide.className = 'manual-lead-hide';
      hide.textContent = 'Not relevant';
      hide.addEventListener('click', () => {
        const ignoredNow = hiddenLeads();
        ignoredNow[url] = true;
        try { localStorage.setItem(STORE, JSON.stringify(ignoredNow)); }
        catch (_) { /* storage may be unavailable; nothing else is changed */ }
        renderManualLeads();
      });
      actions.appendChild(hide);
      card.appendChild(actions);
      list.appendChild(card);
    }
    host.appendChild(list);
  }

  const previousRender = render;
  render = function (options = {}) {
    previousRender(options);
    renderManualLeads();
  };
  renderManualLeads();
})();
