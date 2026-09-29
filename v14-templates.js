// Job Radar v0.3.1 application answer templates.
// Templates are generated only from the current vacancy plus data the user saved
// locally in Application data. Nothing is submitted automatically.

function templateClean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sentence(value) {
  const text = templateClean(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function compactRequirement(value) {
  const text = templateClean(value)
    .replace(/^[-•·]\s*/, '')
    .replace(/^(requirements?|wymagania|expected|you will|you'll)\s*[:–-]?\s*/i, '');
  return text.length > 90 ? `${text.slice(0, 87).trim()}…` : text;
}

function templateFocus(job) {
  const candidates = [
    ...(Array.isArray(job?.required_skills) ? job.required_skills : []),
    ...(Array.isArray(job?.summary_expectations) ? job.summary_expectations : [])
  ].map(compactRequirement).filter(Boolean);
  return [...new Set(candidates)].slice(0, 2);
}

function applicationAnswerTemplates(job) {
  if (!job) return [];
  const data = getApplicationData();
  const title = templateClean(job.title) || 'this position';
  const company = templateClean(job.company) || 'the company';
  const focus = templateFocus(job);
  const focusText = focus.length ? focus.join(' and ') : '';
  const profile = sentence(data.short_profile);
  const templates = [];

  let whyRole = `I'm interested in the ${title} role at ${company} because it is closely aligned with the kind of work I want to focus on next.`;
  if (focusText) whyRole += ` The vacancy's focus on ${focusText} is particularly interesting to me.`;
  whyRole += ' I would be keen to contribute while continuing to deepen my experience in the role.';
  templates.push({key:'why_role', label:'Why are you interested in this role?', value:whyRole, kind:'generated'});

  if (profile) {
    const goodFit = `${profile} I believe this background would let me contribute to the ${title} role while continuing to grow in the areas highlighted in the vacancy.`;
    templates.push({key:'good_fit', label:'Why are you a good fit?', value:goodFit, kind:'generated'});
  }

  let cover = `Dear Hiring Team,\n\nI am applying for the ${title} position at ${company}.`;
  if (profile) cover += ` ${profile}`;
  if (focusText) cover += ` The role caught my attention because of its focus on ${focusText}.`;
  cover += '\n\nI would be happy to discuss how my background could support the team.\n\nBest regards';
  templates.push({key:'cover_note', label:'Short cover note', value:cover, kind:'generated'});

  const start = templateClean(data.available_start);
  const notice = templateClean(data.notice_period);
  if (start || notice) {
    let value = start ? `I would be available to start ${start}.` : '';
    if (notice) value += `${value ? ' ' : ''}My notice period is ${notice}.`;
    templates.push({key:'availability', label:'When can you start?', value, kind:'saved'});
  }

  const authorization = templateClean(data.work_authorization);
  if (authorization) templates.push({
    key:'authorization', label:'Work authorization / sponsorship', value:authorization, kind:'saved'
  });

  const salary = templateClean(data.salary_expectation);
  if (salary) templates.push({
    key:'salary', label:'Salary expectations',
    value:`My salary expectation is ${salary}. I am open to discussing the overall compensation package and responsibilities.`,
    kind:'saved'
  });

  const languages = templateClean(data.languages);
  if (languages) templates.push({key:'languages', label:'Languages', value:languages, kind:'saved'});

  return templates;
}

function ensureTemplateSection() {
  const quickSection = document.querySelector('#assistantQuickAnswers')?.closest('.assistant-section');
  if (!quickSection || document.querySelector('#assistantAnswerTemplates')) return;
  const section = document.createElement('section');
  section.className = 'assistant-section answer-template-section';
  section.innerHTML = `
    <div class="assistant-section-head">
      <div><h4>Application answer templates</h4><small>Drafts — review before pasting into a form.</small></div>
    </div>
    <div id="assistantAnswerTemplates" class="answer-template-list"></div>`;
  quickSection.insertAdjacentElement('afterend', section);
}

function renderApplicationAnswerTemplates() {
  ensureTemplateSection();
  const host = document.querySelector('#assistantAnswerTemplates');
  const job = assistantJob();
  if (!host || !job) return;
  const templates = applicationAnswerTemplates(job);
  if (!templates.length) {
    host.innerHTML = '<div class="quick-answer-empty">No templates available yet. Add your Application data first.</div>';
    return;
  }
  host.innerHTML = templates.map(item => `
    <article class="answer-template-card" data-template-key="${esc(item.key)}">
      <div class="answer-template-head"><b>${esc(item.label)}</b><span>${item.kind === 'saved' ? 'YOUR DATA' : 'ROLE DRAFT'}</span></div>
      <p>${esc(item.value).replace(/\n/g, '<br>')}</p>
      <button type="button" data-copy-template="${esc(item.key)}">Copy answer</button>
    </article>`).join('');
  host.querySelectorAll('[data-copy-template]').forEach(button => button.addEventListener('click', () => {
    const currentJob = assistantJob();
    const item = applicationAnswerTemplates(currentJob).find(x => x.key === button.dataset.copyTemplate);
    if (item) copyText(item.value, button);
  }));
}

const _v13OpenApplicationAssistant = openApplicationAssistant;
openApplicationAssistant = function(job) {
  _v13OpenApplicationAssistant(job);
  renderApplicationAnswerTemplates();
};

const _v13SaveApplicationDataForm = saveApplicationDataForm;
saveApplicationDataForm = function() {
  _v13SaveApplicationDataForm();
  renderApplicationAnswerTemplates();
};

// If the assistant was already open while this script loaded, decorate it now.
ensureTemplateSection();
if (!document.querySelector('#applicationAssistant')?.hidden) renderApplicationAnswerTemplates();
