// Job Radar v0.3.6 Quick Summary interaction hardening.
// Keeps the active vacancy visually anchored on mobile and preserves an open
// summary when Queue state changes cause the card list to re-render.

const summaryInteraction = {closingId:'', openingId:''};

function jobCardByIdStable(id) {
  const key = String(id || '');
  return [...document.querySelectorAll('.job-card')].find(card => String(card.dataset.jobId || '') === key) || null;
}

function summaryViewportTop() {
  const topbar = document.querySelector('.topbar');
  const rect = topbar?.getBoundingClientRect();
  const bottom = rect && rect.bottom > 0 ? rect.bottom : 0;
  return Math.max(12, Math.min(window.innerHeight * 0.2, bottom + 12));
}

function focusExpandedQuickSummary(card, behavior='smooth') {
  if (!card?.isConnected) return;
  const details = card.querySelector('.summary-wrap');
  const actions = card.querySelector('.actions');
  if (!details?.open || !actions) return;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!card.isConnected || !details.open) return;
    const summaryRect = details.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const topLimit = summaryViewportTop();
    const bottomLimit = window.innerHeight - Math.max(14, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--summary-bottom-safe')) || 18);
    const areaHeight = Math.max(1, actionsRect.bottom - summaryRect.top);
    const usableHeight = Math.max(1, bottomLimit - topLimit);

    let desiredTop;
    if (areaHeight <= usableHeight) {
      desiredTop = topLimit + (usableHeight - areaHeight) / 2;
    } else {
      // If the expanded content is taller than the viewport, keep its beginning
      // below the sticky header. The user can still scroll naturally inside it.
      desiredTop = topLimit;
    }
    const delta = summaryRect.top - desiredTop;
    if (Math.abs(delta) > 3) window.scrollBy({top:delta, behavior});
  }));
}

function centerCollapsedJobCard(id, behavior='smooth') {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = jobCardByIdStable(id);
    if (!card?.isConnected) return;
    const topLimit = summaryViewportTop();
    const bottomLimit = window.innerHeight - 16;
    const rect = card.getBoundingClientRect();
    const usableHeight = Math.max(1, bottomLimit - topLimit);
    const targetTop = topLimit + Math.max(0, (usableHeight - Math.min(rect.height, usableHeight)) / 2);
    const delta = rect.top - targetTop;
    if (Math.abs(delta) > 3) window.scrollBy({top:delta, behavior});
  }));
}

function bindQuickSummaryUx() {
  const host = document.querySelector('#jobs');
  if (!host || host.dataset.summaryUxBound === '1') return;
  host.dataset.summaryUxBound = '1';

  // Capture the intended action before <details> changes layout.
  host.addEventListener('click', event => {
    const summary = event.target.closest?.('.summary-wrap > summary');
    if (!summary) return;
    const details = summary.parentElement;
    const card = summary.closest('.job-card');
    const id = String(card?.dataset.jobId || '');
    if (!id) return;
    if (details.open) {
      summaryInteraction.closingId = id;
      summaryInteraction.openingId = '';
    } else {
      summaryInteraction.openingId = id;
      summaryInteraction.closingId = '';
    }

    setTimeout(() => {
      const currentCard = jobCardByIdStable(id);
      const currentDetails = currentCard?.querySelector('.summary-wrap');
      if (!currentCard || !currentDetails) return;
      if (currentDetails.open && summaryInteraction.openingId === id) {
        summaryInteraction.openingId = '';
        focusExpandedQuickSummary(currentCard);
      } else if (!currentDetails.open && summaryInteraction.closingId === id) {
        summaryInteraction.closingId = '';
        centerCollapsedJobCard(id);
      }
    }, 0);
  }, true);
}

// Queue changes re-render the entire jobs list. Preserve Quick Summary state for
// the card the user is actively reading instead of collapsing it unexpectedly.
toggleQueue = function(id) {
  const key = String(id);
  const card = jobCardByIdStable(key);
  const details = card?.querySelector('.summary-wrap');
  const keepSummaryOpen = !!details?.open;
  const anchor = captureCardAnchor(key);

  const set = queueIds();
  set.has(key) ? set.delete(key) : set.add(key);
  setQueueIds(set);
  render({anchor});

  if (keepSummaryOpen) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const nextCard = jobCardByIdStable(key);
      const nextDetails = nextCard?.querySelector('.summary-wrap');
      if (!nextCard || !nextDetails) return;
      nextDetails.open = true;
      focusExpandedQuickSummary(nextCard, 'auto');
    }));
  }
};

bindQuickSummaryUx();
