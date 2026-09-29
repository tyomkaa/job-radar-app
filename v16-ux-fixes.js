// Job Radar v0.3.3 mobile/application workflow hardening.

// Keep queue IDs stable across JSON imports, numeric/string source IDs and refreshes.
queueIds = function() {
  try { return new Set((JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []).map(String)); }
  catch { return new Set(); }
};
setQueueIds = function(set) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...set].map(String)));
};
toggleQueue = function(id) {
  const key = String(id);
  const set = queueIds();
  set.has(key) ? set.delete(key) : set.add(key);
  setQueueIds(set);
  render({anchor:captureCardAnchor(key)});
};

// Only keep reusable answers that are genuinely stable between applications.
applicationDataFields = function() {
  return [
    ['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Current location'],
    ['linkedin', 'LinkedIn'], ['portfolio', 'GitHub / portfolio'], ['notice_period', 'Notice period'],
    ['salary_expectation', 'Salary expectation'], ['languages', 'Languages'], ['short_profile', 'Short profile']
  ];
};

// Requirements shown in Prepare should prefer actual vacancy expectations over
// loose source skill tags.
assistantRequirements = function(job) {
  const expectations = Array.isArray(job?.summary_expectations) ? job.summary_expectations.filter(Boolean) : [];
  const skills = Array.isArray(job?.required_skills) ? job.required_skills.filter(Boolean) : [];
  const values = [...expectations, ...skills];
  const seen = new Set();
  const unique = values.filter(value => {
    const key = String(value).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  return unique.slice(0, 6).length ? unique.slice(0, 6) : ['Review the vacancy requirements on the application page before submitting.'];
};

// Replace the old export button node so the v12 captured listener cannot keep
// exporting the legacy v2 payload. The current exportHistory function is v5.
(function bindCurrentBackupExporter() {
  const oldButton = document.querySelector('#exportHistory');
  if (!oldButton || oldButton.dataset.v16Bound === '1') return;
  const button = oldButton.cloneNode(true);
  button.dataset.v16Bound = '1';
  oldButton.replaceWith(button);
  button.addEventListener('click', () => exportHistory());
})();

// Confirm before deleting reusable application data. Replacing the node also
// removes the older immediate-clear anonymous listener.
(function bindSafeClear() {
  const oldButton = document.querySelector('#clearApplicationData');
  if (!oldButton || oldButton.dataset.v16Bound === '1') return;
  const button = oldButton.cloneNode(true);
  button.dataset.v16Bound = '1';
  oldButton.replaceWith(button);
  button.addEventListener('click', () => {
    if (!window.confirm('Clear all reusable application data saved on this device?')) return;
    localStorage.removeItem(APPLICATION_DATA_KEY);
    fillApplicationDataForm();
    renderAssistantQuickAnswers();
    if (typeof renderApplicationAnswerTemplates === 'function') renderApplicationAnswerTemplates();
    const status = document.querySelector('#applicationDataStatus');
    if (status) status.textContent = 'Saved application data cleared.';
  });
})();

// Persist the return position before iOS hands the user off to a browser/native
// app, not only on click.
(function hardenAssistantOpen() {
  const link = document.querySelector('#assistantOpenJob');
  if (!link || link.dataset.v16Bound === '1') return;
  link.dataset.v16Bound = '1';
  const arm = () => {
    const job = assistantJob();
    if (!job) return;
    persistAssistantForm();
    markSeen(job.id);
    saveReturnAnchor(job.id);
  };
  link.addEventListener('pointerdown', arm, {passive:true});
  link.addEventListener('touchstart', arm, {passive:true});
})();

// Quick Mark applied on a job card should also clear the same vacancy from Queue.
document.querySelector('#jobs')?.addEventListener('click', event => {
  const button = event.target.closest?.('.quick-applied');
  if (!button || !/^mark applied$/i.test(button.textContent.trim())) return;
  const card = button.closest('.job-card');
  const id = String(card?.dataset.jobId || '');
  if (!id) return;
  setTimeout(() => {
    const set = queueIds();
    if (!set.has(id)) return;
    set.delete(id); setQueueIds(set);
    renderStats();
  }, 0);
}, true);

// Normalize already-saved queue state after upgrading.
setQueueIds(queueIds());

// Load the CV Manager editor/polish layer without changing the stable page shell.
(function loadCvManagerEditorUpgrade() {
  if (!document.querySelector('link[data-cv-editor-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `styles-v17-cv.css?v=1`;
    link.dataset.cvEditorStyle = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-cv-editor-script]')) {
    const script = document.createElement('script');
    script.src = `v17-cv-editor.js?v=1`;
    script.dataset.cvEditorScript = '1';
    document.body.appendChild(script);
  }
})();

// Load Quick Summary viewport/state hardening.
(function loadQuickSummaryUxUpgrade() {
  if (document.querySelector('script[data-summary-ux-script]')) return;
  const script = document.createElement('script');
  script.src = `v18-summary-ux.js?v=1`;
  script.dataset.summaryUxScript = '1';
  document.body.appendChild(script);
})();
