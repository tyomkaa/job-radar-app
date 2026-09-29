// Job Radar v0.3.2 local CV Manager.
// PDF files live only in IndexedDB on this device. They are never uploaded to GitHub.

const CV_DB_NAME = 'jobRadarLocalFilesV1';
const CV_DB_VERSION = 1;
const CV_STORE = 'cvs';
const CV_DEFAULT_KEY = 'jobRadarDefaultCvV1';
let reopenAssistantAfterCv = false;
let cvDbPromise = null;

function openCvDb() {
  if (cvDbPromise) return cvDbPromise;
  cvDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CV_DB_NAME, CV_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CV_STORE)) db.createObjectStore(CV_STORE, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local CV storage'));
  });
  return cvDbPromise;
}

async function cvStore(mode='readonly') {
  const db = await openCvDb();
  return db.transaction(CV_STORE, mode).objectStore(CV_STORE);
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local CV storage error'));
  });
}

async function getAllCvs() {
  const store = await cvStore();
  const rows = await idbRequest(store.getAll());
  return (rows || []).sort((a,b) => String(b.added_at || '').localeCompare(String(a.added_at || '')));
}

async function getCv(id) {
  if (!id) return null;
  const store = await cvStore();
  return await idbRequest(store.get(id));
}

async function putCv(record) {
  const store = await cvStore('readwrite');
  return await idbRequest(store.put(record));
}

async function deleteCv(id) {
  const store = await cvStore('readwrite');
  await idbRequest(store.delete(id));
}

function cvId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `cv-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
}

function bytesLabel(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function cvDefaultId() {
  try { return localStorage.getItem(CV_DEFAULT_KEY) || ''; }
  catch { return ''; }
}

function setCvDefaultId(id) {
  try {
    if (id) localStorage.setItem(CV_DEFAULT_KEY, id);
    else localStorage.removeItem(CV_DEFAULT_KEY);
  } catch (_) {}
}

function cvJobText(job) {
  return [
    job?.title, job?.summary,
    ...(Array.isArray(job?.required_skills) ? job.required_skills : []),
    ...(Array.isArray(job?.summary_expectations) ? job.summary_expectations : []),
    ...(Array.isArray(job?.summary_tasks) ? job.summary_tasks : [])
  ].join(' ').toLowerCase();
}

const CV_ROLE_HINTS = {
  automation: ['automation','automatyz','python','workflow','process automation','scripting','playwright','openpyxl'],
  marketing: ['marketing','seo','e-commerce','ecommerce','wordpress','content','crm','campaign','digital'],
  network: ['network','networking','noc','telecom','telecommunication','routing','switching','infrastructure'],
  data: ['data analyst','data quality','reporting','sql','analytics','business analyst','process analyst','bi analyst'],
  systems: ['system administrator','systems administrator','application support','application administrator','infrastructure administrator']
};

function roleScores(text) {
  const scores = {};
  for (const [role, terms] of Object.entries(CV_ROLE_HINTS)) {
    scores[role] = terms.reduce((sum, term) => sum + (text.includes(term) ? (term.includes(' ') ? 3 : 1) : 0), 0);
  }
  return scores;
}

function recommendCv(job, cvs) {
  if (!cvs?.length) return null;
  const text = cvJobText(job);
  const roles = roleScores(text);
  const defaultId = cvDefaultId();
  let best = null;
  let bestScore = -1;
  for (const cv of cvs) {
    const identity = `${cv.label || ''} ${cv.tags || ''} ${cv.file_name || ''}`.toLowerCase();
    let score = cv.id === defaultId ? 1 : 0;
    for (const [role, roleScore] of Object.entries(roles)) {
      if (!roleScore) continue;
      if (identity.includes(role)) score += roleScore * 4;
      for (const term of CV_ROLE_HINTS[role]) if (identity.includes(term)) score += roleScore * 2;
    }
    const identityTokens = new Set(identity.split(/[^a-z0-9]+/).filter(x => x.length >= 4));
    for (const token of identityTokens) if (text.includes(token)) score += 1;
    if (score > bestScore) { best = cv; bestScore = score; }
  }
  return best || cvs.find(cv => cv.id === defaultId) || cvs[0];
}

function selectedCv(job, cvs) {
  const explicitId = assistantRecord(job)?.cv_id || '';
  return cvs.find(cv => cv.id === explicitId) || recommendCv(job, cvs);
}

function ensureCvManagerUi() {
  const actions = document.querySelector('.data-actions');
  if (actions && !document.querySelector('#openCvManager')) {
    const button = document.createElement('button');
    button.id = 'openCvManager';
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = 'CV Manager';
    actions.prepend(button);
    button.addEventListener('click', () => openCvManager(false));
  }
  if (document.querySelector('#cvManager')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="cvManager" class="reply-overlay cv-manager-overlay" hidden>
      <section class="reply-sheet cv-manager-sheet" role="dialog" aria-modal="true" aria-labelledby="cvManagerTitle">
        <div class="reply-sheet-head">
          <div><div class="reply-kicker">CV MANAGER</div><h2 id="cvManagerTitle">CV variants</h2></div>
          <button id="closeCvManager" class="reply-close" type="button" aria-label="Close">×</button>
        </div>
        <p class="reply-help">Keep several PDF variants on this device, for example Automation, Marketing or Network. Job Radar can suggest which one fits a vacancy. Keep your original files in the phone's Files app as well.</p>
        <section class="cv-add-box">
          <label class="cv-file-label">PDF file<input id="cvFileInput" type="file" accept="application/pdf,.pdf"></label>
          <label>Variant name<input id="cvLabelInput" type="text" placeholder="e.g. Automation"></label>
          <label>Tags <input id="cvTagsInput" type="text" placeholder="e.g. python workflow automation"></label>
          <button id="cvSaveButton" class="primary" type="button">Add CV</button>
          <div id="cvManagerStatus" class="application-data-status"></div>
        </section>
        <div id="cvList" class="cv-list"></div>
        <div class="reply-privacy">PDFs are stored in IndexedDB only on this device. They are not included in the JSON backup and are never committed to GitHub.</div>
      </section>
    </div>`);
  document.querySelector('#closeCvManager')?.addEventListener('click', closeCvManager);
  document.querySelector('#cvManager')?.addEventListener('click', event => {
    if (event.target?.id === 'cvManager') closeCvManager();
  });
  document.querySelector('#cvFileInput')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    const label = document.querySelector('#cvLabelInput');
    if (file && label && !label.value.trim()) label.value = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  });
  document.querySelector('#cvSaveButton')?.addEventListener('click', addCvFromForm);
}

async function openCvManager(fromAssistant=false) {
  ensureCvManagerUi();
  reopenAssistantAfterCv = !!fromAssistant;
  if (fromAssistant) document.querySelector('#applicationAssistant').hidden = true;
  const overlay = document.querySelector('#cvManager');
  if (!overlay) return;
  overlay.hidden = false;
  document.body.classList.add('reply-modal-open');
  await renderCvList();
}

function closeCvManager() {
  const overlay = document.querySelector('#cvManager');
  if (!overlay) return;
  overlay.hidden = true;
  if (reopenAssistantAfterCv && assistantJob()) {
    reopenAssistantAfterCv = false;
    openApplicationAssistant(assistantJob());
    return;
  }
  reopenAssistantAfterCv = false;
  document.body.classList.remove('reply-modal-open');
}

async function addCvFromForm() {
  const fileInput = document.querySelector('#cvFileInput');
  const labelInput = document.querySelector('#cvLabelInput');
  const tagsInput = document.querySelector('#cvTagsInput');
  const status = document.querySelector('#cvManagerStatus');
  const file = fileInput?.files?.[0];
  if (!file) { if (status) status.textContent = 'Choose a PDF first.'; return; }
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { if (status) status.textContent = 'Only PDF CV files are supported.'; return; }
  if (file.size > 15 * 1024 * 1024) { if (status) status.textContent = 'This PDF is larger than 15 MB. Use a smaller CV file.'; return; }
  const existing = await getAllCvs();
  if (existing.length >= 10) { if (status) status.textContent = 'CV Manager supports up to 10 local variants.'; return; }
  try { await navigator.storage?.persist?.(); } catch (_) {}
  const record = {
    id: cvId(),
    label: String(labelInput?.value || file.name.replace(/\.pdf$/i, '')).trim() || 'CV',
    tags: String(tagsInput?.value || '').trim(),
    file_name: file.name,
    mime: file.type || 'application/pdf',
    size: file.size,
    added_at: new Date().toISOString(),
    blob: file
  };
  try {
    await putCv(record);
    if (!cvDefaultId()) setCvDefaultId(record.id);
    if (fileInput) fileInput.value = '';
    if (labelInput) labelInput.value = '';
    if (tagsInput) tagsInput.value = '';
    if (status) status.textContent = 'CV saved locally ✓';
    await renderCvList();
    renderCvAssistantSection();
  } catch (_) {
    if (status) status.textContent = 'Could not store this PDF locally. Check available device storage.';
  }
}

async function openCvFile(id) {
  const cv = await getCv(id);
  if (!cv?.blob) return;
  const url = URL.createObjectURL(cv.blob);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function shareCvFile(id) {
  const cv = await getCv(id);
  if (!cv?.blob) return;
  const file = new File([cv.blob], cv.file_name || `${cv.label || 'CV'}.pdf`, {type:cv.mime || 'application/pdf'});
  try {
    if (navigator.canShare?.({files:[file]})) {
      await navigator.share({files:[file], title:cv.label || 'CV'});
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  await openCvFile(id);
}

async function removeCv(id) {
  await deleteCv(id);
  if (cvDefaultId() === id) {
    const remaining = await getAllCvs();
    setCvDefaultId(remaining[0]?.id || '');
  }
  const state = getAssistantState();
  let changed = false;
  for (const record of Object.values(state)) {
    if (record?.cv_id === id) { delete record.cv_id; changed = true; }
  }
  if (changed) setAssistantState(state);
  await renderCvList();
  renderCvAssistantSection();
}

async function renderCvList() {
  const host = document.querySelector('#cvList');
  if (!host) return;
  let cvs = [];
  try { cvs = await getAllCvs(); }
  catch (_) { host.innerHTML = '<div class="quick-answer-empty">Local CV storage is unavailable in this browser.</div>'; return; }
  if (!cvs.length) {
    host.innerHTML = '<div class="quick-answer-empty">No CV variants saved on this device yet.</div>';
    return;
  }
  const defaultId = cvDefaultId();
  host.innerHTML = cvs.map(cv => `
    <article class="cv-card" data-cv-id="${esc(cv.id)}">
      <div class="cv-card-main">
        <div class="cv-card-title"><b>${esc(cv.label || 'CV')}</b>${cv.id === defaultId ? '<span>DEFAULT</span>' : ''}</div>
        <div class="cv-card-file">${esc(cv.file_name || 'CV.pdf')} · ${esc(bytesLabel(cv.size))}</div>
        ${cv.tags ? `<div class="cv-card-tags">${esc(cv.tags)}</div>` : ''}
      </div>
      <div class="cv-card-actions">
        <button type="button" data-cv-open>Open</button>
        <button type="button" data-cv-share>Share</button>
        <button type="button" data-cv-default>${cv.id === defaultId ? 'Default ✓' : 'Make default'}</button>
        <button type="button" data-cv-delete class="cv-delete">Delete</button>
      </div>
    </article>`).join('');
  host.querySelectorAll('.cv-card').forEach(card => {
    const id = card.dataset.cvId;
    card.querySelector('[data-cv-open]')?.addEventListener('click', () => openCvFile(id));
    card.querySelector('[data-cv-share]')?.addEventListener('click', () => shareCvFile(id));
    card.querySelector('[data-cv-default]')?.addEventListener('click', async () => { setCvDefaultId(id); await renderCvList(); renderCvAssistantSection(); });
    card.querySelector('[data-cv-delete]')?.addEventListener('click', () => removeCv(id));
  });
}

function ensureCvAssistantSection() {
  if (document.querySelector('#assistantCvSection')) return;
  const anchor = document.querySelector('#assistantAnswerTemplates')?.closest('.assistant-section') || document.querySelector('#assistantQuickAnswers')?.closest('.assistant-section');
  if (!anchor) return;
  const section = document.createElement('section');
  section.id = 'assistantCvSection';
  section.className = 'assistant-section cv-assistant-section';
  section.innerHTML = '<div class="assistant-section-head"><div><h4>CV for this application</h4><small>Stored locally on this device.</small></div><button id="assistantManageCvs" class="assistant-edit-data" type="button">Manage</button></div><div id="assistantCvContent"></div>';
  anchor.insertAdjacentElement('afterend', section);
  section.querySelector('#assistantManageCvs')?.addEventListener('click', () => openCvManager(true));
}

async function renderCvAssistantSection() {
  ensureCvAssistantSection();
  const host = document.querySelector('#assistantCvContent');
  const job = assistantJob();
  if (!host || !job) return;
  let cvs = [];
  try { cvs = await getAllCvs(); } catch (_) {}
  if (!cvs.length) {
    host.innerHTML = '<div class="quick-answer-empty">Add your PDF CV variants once, then Job Radar can suggest the best one for each vacancy.<br><button id="assistantAddFirstCv" class="cv-inline-action" type="button">Add CV</button></div>';
    host.querySelector('#assistantAddFirstCv')?.addEventListener('click', () => openCvManager(true));
    return;
  }
  const recommendation = recommendCv(job, cvs);
  const chosen = selectedCv(job, cvs) || recommendation || cvs[0];
  const explicit = assistantRecord(job)?.cv_id;
  host.innerHTML = `
    <div class="cv-assistant-box">
      <div class="cv-suggestion">${explicit ? 'Selected for this vacancy' : 'Suggested for this vacancy'}${!explicit && recommendation ? ` · ${esc(recommendation.label)}` : ''}</div>
      <select id="assistantCvSelect" aria-label="CV variant">${cvs.map(cv => `<option value="${esc(cv.id)}" ${cv.id === chosen.id ? 'selected' : ''}>${esc(cv.label || cv.file_name || 'CV')}</option>`).join('')}</select>
      <div class="cv-assistant-actions">
        <button id="assistantUseCv" type="button">Use this CV</button>
        <button id="assistantOpenCv" type="button">Open</button>
        <button id="assistantShareCv" type="button">Share</button>
      </div>
      <div id="assistantCvStatus" class="application-data-status">${explicit ? 'CV choice saved for this application.' : 'Recommendation is based on the vacancy title, skills and your CV labels/tags.'}</div>
    </div>`;
  const select = host.querySelector('#assistantCvSelect');
  host.querySelector('#assistantUseCv')?.addEventListener('click', () => {
    const cvIdValue = select?.value || '';
    if (!cvIdValue) return;
    saveAssistantRecord(job, {cv_id:cvIdValue});
    const check = document.querySelector('[data-assistant-check="cv"]');
    if (check) check.checked = true;
    persistAssistantForm();
    const status = host.querySelector('#assistantCvStatus');
    if (status) status.textContent = 'CV choice saved for this application ✓';
  });
  host.querySelector('#assistantOpenCv')?.addEventListener('click', () => openCvFile(select?.value));
  host.querySelector('#assistantShareCv')?.addEventListener('click', () => shareCvFile(select?.value));
}

const _v14OpenApplicationAssistant = openApplicationAssistant;
openApplicationAssistant = function(job) {
  _v14OpenApplicationAssistant(job);
  renderCvAssistantSection();
};

ensureCvManagerUi();
ensureCvAssistantSection();
if (!document.querySelector('#applicationAssistant')?.hidden) renderCvAssistantSection();
