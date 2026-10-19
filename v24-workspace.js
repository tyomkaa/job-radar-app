// Job Radar v0.7 (draft): one vacancy workflow instead of competing AI/Prepare modals.
// No AI endpoint or billing is enabled here. Existing local CVs, drafts and tracker stay intact.
(function () {
  'use strict';
  const TABS = [
    {id: 'analyze', label: 'Analyze'},
    {id: 'prepare', label: 'Prepare'},
    {id: 'apply', label: 'Apply'}
  ];
  let activeWorkspaceTab = 'analyze';
  let previousWorkspaceJobId = '';

  function workspaceJob() {
    return typeof assistantJob === 'function' ? assistantJob() : null;
  }

  function workspaceSectionFor(selector, tab) {
    const node = document.querySelector(selector);
    if (!node) return;
    const section = node.closest('.assistant-section') || node;
    section.dataset.workspaceTab = tab;
  }

  function ensureWorkspace() {
    const overlay = document.querySelector('#applicationAssistant');
    if (!overlay || overlay.querySelector('#v24Tabs')) return;
    const sheet = overlay.querySelector('.application-assistant-sheet');
    if (!sheet) return;
    const title = overlay.querySelector('#applicationAssistantTitle');
    if (title) title.textContent = 'Review & Prepare';
    const kicker = overlay.querySelector('.reply-kicker');
    if (kicker) kicker.textContent = 'APPLICATION WORKSPACE';

    const flow = sheet.querySelector('.assistant-flow');
    const tabs = document.createElement('nav');
    tabs.id = 'v24Tabs';
    tabs.className = 'v24-tabs';
    tabs.setAttribute('aria-label', 'Application workflow');
    TABS.forEach((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.workspaceSwitch = tab.id;
      button.textContent = (index + 1) + ' · ' + tab.label;
      button.addEventListener('click', () => setWorkspaceTab(tab.id));
      tabs.appendChild(button);
    });
    if (flow) flow.replaceWith(tabs);
    else overlay.querySelector('#assistantFacts')?.insertAdjacentElement('afterend', tabs);

    const review = document.createElement('section');
    review.id = 'v24ReviewSection';
    review.className = 'assistant-section v24-review';
    review.dataset.workspaceTab = 'analyze';
    review.innerHTML = [
      '<div class="v24-section-head"><h4>AI vacancy review</h4><span class="v24-local-tag">PRIVATE · OPT-IN</span></div>',
      '<p class="v24-hint">Check career direction, actual duties and hard requirements. AI suggestions are not hiring predictions.</p>',
      '<div id="v24ReviewResult" class="v24-review-result" aria-live="polite"></div>',
      '<p class="v24-hint">Free manual mode: copy the brief to ChatGPT, then paste its JSON answer. Your saved short profile and languages may be included in the copied brief; inspect it before sharing.</p>',
      '<div class="v24-action-row"><button type="button" id="v24CopyBrief">Copy analysis brief</button>',
      '<button type="button" id="v24OpenChat">Open ChatGPT</button></div>',
      '<label class="v24-field-label" for="v24PasteReview">AI response (JSON)</label>',
      '<textarea id="v24PasteReview" rows="4" placeholder="Paste the structured AI response"></textarea>',
      '<div class="v24-action-row"><button type="button" id="v24SaveReview">Save verdict</button>',
      '<button type="button" id="v24ClearReview">Clear verdict</button></div>',
      '<p id="v24ReviewStatus" class="v24-status" role="status"></p>'
    ].join('');
    tabs.insertAdjacentElement('afterend', review);
    workspaceSectionFor('#assistantRequirements', 'analyze');
    workspaceSectionFor('#assistantQuickAnswers', 'prepare');
    workspaceSectionFor('#assistantAnswerTemplates', 'prepare');
    workspaceSectionFor('#assistantCvSection', 'prepare');
    workspaceSectionFor('[data-assistant-check="cv"]', 'apply');
    workspaceSectionFor('#assistantNotes', 'apply');
    workspaceSectionFor('.assistant-controls', 'apply');
    workspaceSectionFor('#assistantRemoveQueue', 'apply');
    workspaceSectionFor('.application-assistant-sheet > .reply-privacy', 'apply');

    review.querySelector('#v24CopyBrief').addEventListener('click', function () {
      const job = workspaceJob();
      if (job) copyText(aiReviewPrompt(job), this);
    });
    review.querySelector('#v24OpenChat').addEventListener('click', function () {
      window.open('https://chatgpt.com/', '_blank', 'noopener');
    });
    review.querySelector('#v24SaveReview').addEventListener('click', saveWorkspaceReview);
    review.querySelector('#v24ClearReview').addEventListener('click', clearWorkspaceReview);
  }

  function setWorkspaceTab(tab) {
    if (!TABS.some(item => item.id === tab)) tab = 'analyze';
    activeWorkspaceTab = tab;
    const overlay = document.querySelector('#applicationAssistant');
    if (!overlay) return;
    overlay.querySelectorAll('[data-workspace-tab]').forEach(el => {
      el.hidden = el.dataset.workspaceTab !== tab;
    });
    overlay.querySelectorAll('[data-workspace-switch]').forEach(button => {
      const selected = button.dataset.workspaceSwitch === tab;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const sheet = overlay.querySelector('.application-assistant-sheet');
    if (sheet) sheet.scrollTop = 0;
  }

  function safeReviewLine(host, label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return;
    const p = document.createElement('p');
    p.textContent = label + ': ' + (Array.isArray(value) ? value.join(' · ') : value);
    host.appendChild(p);
  }

  function renderWorkspaceReview() {
    const job = workspaceJob();
    const output = document.querySelector('#v24ReviewResult');
    if (!output) return;
    output.replaceChildren();
    if (!job) return;
    const result = aiReviewFor(job);
    if (!result) {
      output.textContent = 'No AI verdict saved. Review the vacancy requirements below, or run an optional analysis.';
      return;
    }
    const heading = document.createElement('strong');
    heading.textContent = result.verdict + ' · AI suggestion (not verified)';
    output.appendChild(heading);
    safeReviewLine(output, 'Why', result.explanation);
    safeReviewLine(output, 'Strengths', result.strengths);
    safeReviewLine(output, 'Gaps', result.gaps);
    safeReviewLine(output, 'Verify', result.verify);
    safeReviewLine(output, 'Suggested CV', result.suggested_cv);
  }

  function workspaceStatus(message) {
    const status = document.querySelector('#v24ReviewStatus');
    if (status) status.textContent = message;
  }

  function saveWorkspaceReview() {
    const job = workspaceJob();
    const field = document.querySelector('#v24PasteReview');
    if (!job || !field) return;
    try {
      const result = parseAiReview(field.value);
      const values = aiReviews();
      values[jobKey(job)] = result;
      localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(values));
      workspaceStatus('AI verdict saved locally. Review it critically.');
      renderWorkspaceReview();
      render();
    } catch (error) {
      workspaceStatus('Could not save: ' + error.message + '. Copy the JSON using the code block copy button.');
    }
  }

  function clearWorkspaceReview() {
    const job = workspaceJob();
    if (!job) return;
    const values = aiReviews();
    delete values[jobKey(job)];
    localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(values));
    const field = document.querySelector('#v24PasteReview');
    if (field) field.value = '';
    workspaceStatus('Local AI verdict cleared.');
    renderWorkspaceReview();
    render();
  }

  function decorateWorkspaceCards() {
    document.querySelectorAll('#jobs .job-card').forEach(card => {
      // v13 displayed Prepare only after queueing and v23 added a second AI button.
      // Replace those two entry points with a single action available for every job.
      card.querySelectorAll('.assistant-btn, .ai-review-launch').forEach(button => button.remove());
      const actions = card.querySelector('.actions');
      if (!actions || actions.querySelector('.v24-workspace-btn')) return;
      const job = jobs.find(item => String(item.id) === String(card.dataset.jobId));
      if (!job) return;
      const button = document.createElement('button');
      button.className = 'v24-workspace-btn';
      button.type = 'button';
      const review = aiReviewFor(job);
      button.textContent = review ? 'Review & Prepare · ' + review.verdict : 'Review & Prepare';
      button.addEventListener('click', () => openApplicationAssistant(job));
      actions.appendChild(button);
    });
  }

  const previousOpenAssistant = openApplicationAssistant;
  openApplicationAssistant = function (job) {
    previousOpenAssistant(job);
    ensureWorkspace();
    if (String(job?.id || '') !== previousWorkspaceJobId) activeWorkspaceTab = 'analyze';
    previousWorkspaceJobId = String(job?.id || '');
    const field = document.querySelector('#v24PasteReview');
    if (field) field.value = '';
    workspaceStatus('');
    renderWorkspaceReview();
    setWorkspaceTab(activeWorkspaceTab);
  };

  const previousRender = render;
  render = function (options = {}) {
    previousRender(options);
    decorateWorkspaceCards();
  };

  if (jobs.length) render();
})();
