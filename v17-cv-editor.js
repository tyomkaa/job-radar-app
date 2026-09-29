// Job Radar v0.3.5 CV Manager editor.
// Adds in-place metadata editing and optional PDF replacement while preserving
// the CV id, default selection and per-application references.

let cvEditingId = '';

function cvEditorStatus(message) {
  const status = document.querySelector('#cvManagerStatus');
  if (status) status.textContent = message || '';
}

function resetCvEditorForm({keepStatus=false}={}) {
  cvEditingId = '';
  const fileInput = document.querySelector('#cvFileInput');
  const labelInput = document.querySelector('#cvLabelInput');
  const tagsInput = document.querySelector('#cvTagsInput');
  const saveButton = document.querySelector('#cvSaveButton');
  const cancelButton = document.querySelector('#cvCancelEdit');
  if (fileInput) fileInput.value = '';
  if (labelInput) labelInput.value = '';
  if (tagsInput) tagsInput.value = '';
  if (saveButton) saveButton.textContent = 'Add CV';
  if (cancelButton) cancelButton.hidden = true;
  document.querySelector('.cv-add-box')?.classList.remove('cv-edit-mode');
  if (!keepStatus) cvEditorStatus('');
}

function validateCvPdf(file) {
  if (!file) return '';
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return 'Only PDF CV files are supported.';
  if (file.size > 15 * 1024 * 1024) return 'This PDF is larger than 15 MB. Use a smaller CV file.';
  return '';
}

async function putCvCommitted(record) {
  const db = await openCvDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CV_STORE, 'readwrite');
    tx.objectStore(CV_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Local CV storage error'));
    tx.onabort = () => reject(tx.error || new Error('Local CV storage transaction was aborted'));
  });
}

async function saveCvFromEditor() {
  const fileInput = document.querySelector('#cvFileInput');
  const labelInput = document.querySelector('#cvLabelInput');
  const tagsInput = document.querySelector('#cvTagsInput');
  const saveButton = document.querySelector('#cvSaveButton');
  const file = fileInput?.files?.[0] || null;
  const fileError = validateCvPdf(file);
  if (fileError) { cvEditorStatus(fileError); return; }

  if (saveButton) saveButton.disabled = true;
  try {
    try { await navigator.storage?.persist?.(); } catch (_) {}

    if (cvEditingId) {
      const current = await getCv(cvEditingId);
      if (!current) {
        cvEditorStatus('This CV is no longer available. Refresh the list and try again.');
        resetCvEditorForm({keepStatus:true});
        return;
      }
      const updated = {
        ...current,
        label: String(labelInput?.value || current.label || 'CV').trim() || 'CV',
        tags: String(tagsInput?.value || '').trim(),
        updated_at: new Date().toISOString()
      };
      if (file) {
        updated.file_name = file.name;
        updated.mime = file.type || 'application/pdf';
        updated.size = file.size;
        updated.blob = file;
      }
      await putCvCommitted(updated);
      const label = updated.label;
      resetCvEditorForm({keepStatus:true});
      cvEditorStatus(`${label} updated locally ✓`);
    } else {
      if (!file) { cvEditorStatus('Choose a PDF first.'); return; }
      const existing = await getAllCvs();
      if (existing.length >= 10) { cvEditorStatus('CV Manager supports up to 10 local variants.'); return; }
      const record = {
        id: cvId(),
        label: String(labelInput?.value || file.name.replace(/\.pdf$/i, '')).trim() || 'CV',
        tags: String(tagsInput?.value || '').trim(),
        file_name: file.name,
        mime: file.type || 'application/pdf',
        size: file.size,
        added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        blob: file
      };
      await putCvCommitted(record);
      if (!cvDefaultId()) setCvDefaultId(record.id);
      resetCvEditorForm({keepStatus:true});
      cvEditorStatus('CV saved locally ✓');
    }

    await renderCvList();
    await renderCvAssistantSection();
  } catch (_) {
    cvEditorStatus('Could not save this CV locally. Check available device storage.');
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function editCvVariant(id) {
  const cv = await getCv(id);
  if (!cv) return;
  cvEditingId = id;
  const labelInput = document.querySelector('#cvLabelInput');
  const tagsInput = document.querySelector('#cvTagsInput');
  const fileInput = document.querySelector('#cvFileInput');
  const saveButton = document.querySelector('#cvSaveButton');
  const cancelButton = document.querySelector('#cvCancelEdit');
  if (labelInput) labelInput.value = cv.label || '';
  if (tagsInput) tagsInput.value = cv.tags || '';
  if (fileInput) fileInput.value = '';
  if (saveButton) saveButton.textContent = 'Save changes';
  if (cancelButton) cancelButton.hidden = false;
  document.querySelector('.cv-add-box')?.classList.add('cv-edit-mode');
  cvEditorStatus(`Editing ${cv.label || cv.file_name || 'CV'} · choose a new PDF only if you want to replace the file.`);
  document.querySelector('.cv-add-box')?.scrollIntoView({behavior:'smooth', block:'start'});
}

function ensureCvEditorControls() {
  const box = document.querySelector('.cv-add-box');
  if (!box) return;

  const tagsLabel = document.querySelector('#cvTagsInput')?.closest('label');
  if (tagsLabel && !tagsLabel.querySelector('.cv-tags-help')) {
    const help = document.createElement('small');
    help.className = 'cv-tags-help';
    help.textContent = 'Use simple keywords or phrases, preferably separated by commas.';
    tagsLabel.appendChild(help);
  }

  const oldSave = document.querySelector('#cvSaveButton');
  if (oldSave && oldSave.dataset.v17Bound !== '1') {
    const save = oldSave.cloneNode(true);
    save.dataset.v17Bound = '1';
    oldSave.replaceWith(save);
    save.addEventListener('click', saveCvFromEditor);
  }

  if (!document.querySelector('#cvCancelEdit')) {
    const cancel = document.createElement('button');
    cancel.id = 'cvCancelEdit';
    cancel.type = 'button';
    cancel.className = 'cv-cancel-edit';
    cancel.textContent = 'Cancel edit';
    cancel.hidden = true;
    document.querySelector('#cvSaveButton')?.insertAdjacentElement('afterend', cancel);
    cancel.addEventListener('click', () => resetCvEditorForm());
  }
}

function decorateEditableCvCards() {
  document.querySelectorAll('.cv-card').forEach(card => {
    const id = card.dataset.cvId;
    const actions = card.querySelector('.cv-card-actions');
    if (!id || !actions) return;
    if (!actions.querySelector('[data-cv-edit]')) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.dataset.cvEdit = '1';
      edit.className = 'cv-edit';
      edit.textContent = 'Edit';
      actions.prepend(edit);
      edit.addEventListener('click', () => editCvVariant(id));
    }
  });
}

// Keep the existing rendering logic, then add edit controls to every refreshed card.
const _v15RenderCvListForEditor = renderCvList;
renderCvList = async function() {
  await _v15RenderCvListForEditor();
  decorateEditableCvCards();
};

// Deleting a CV is destructive; require confirmation on mobile.
const _v15RemoveCvForEditor = removeCv;
removeCv = async function(id) {
  const cv = await getCv(id);
  const label = cv?.label || cv?.file_name || 'this CV';
  if (!window.confirm(`Delete ${label} from this device?`)) return;
  if (cvEditingId === id) resetCvEditorForm();
  await _v15RemoveCvForEditor(id);
};

// If the manager is already open when this upgrade loads, patch it immediately.
ensureCvEditorControls();
decorateEditableCvCards();
