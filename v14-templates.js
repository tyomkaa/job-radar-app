// Job Radar v0.3.3 vacancy-specific application drafts.
// Drafts are built from the live vacancy plus profile text saved locally by the user.
// Nothing is submitted automatically and no personal data is sent to GitHub.

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
  return text.length > 125 ? `${text.slice(0, 122).trim()}…` : text;
}

function naturalFragment(value) {
  const text = compactRequirement(value).replace(/[.;:]$/g, '');
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function uniqueText(values) {
  const seen = new Set();
  return values.filter(Boolean).filter(value => {
    const key = templateClean(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jobDraftContext(job) {
  const tasks = uniqueText(Array.isArray(job?.summary_tasks) ? job.summary_tasks.map(compactRequirement) : []).slice(0, 2);
  const expectations = uniqueText([
    ...(Array.isArray(job?.summary_expectations) ? job.summary_expectations : []),
    ...(Array.isArray(job?.required_skills) ? job.required_skills : [])
  ].map(compactRequirement)).slice(0, 3);
  return {tasks, expectations};
}

function shortProfileForDrafts() {
  return sentence(getApplicationData().short_profile || '');
}

function applicationAnswerTemplates(job) {
  if (!job) return [];
  const data = getApplicationData();
  const title = templateClean(job.title) || 'this position';
  const company = templateClean(job.company) || 'the company';
  const {tasks, expectations} = jobDraftContext(job);
  const profile = shortProfileForDrafts();
  const templates = [];

  const roleDetail = tasks[0] || expectations[0] || '';
  const secondDetail = expectations.find(x => x !== roleDetail) || tasks.find(x => x !== roleDetail) || '';

  let whyRole = `I'm interested in the ${title} role at ${company} because the position combines work I want to develop further with responsibilities where I can contribute from the start.`;
  if (roleDetail) whyRole += ` In particular, the opportunity to work on ${naturalFragment(roleDetail)} stood out to me.`;
  if (secondDetail) whyRole += ` I also like that the role values ${naturalFragment(secondDetail)}.`;
  whyRole += ` The combination makes this a role I would be genuinely motivated to grow into and contribute to.`;
  templates.push({key:'why_role', label:'Why are you interested in this role?', value:whyRole, kind:'generated'});

  if (profile) {
    let fit = `${profile} `;
    if (expectations[0]) fit += `That background is relevant to this role because the vacancy emphasizes ${naturalFragment(expectations[0])}. `;
    if (tasks[0]) fit += `I would be especially comfortable contributing to work around ${naturalFragment(tasks[0])}. `;
    fit += `I would bring a practical, hands-on approach and I am comfortable learning the role-specific tools and processes I have not used yet.`;
    templates.push({key:'good_fit', label:'Why are you a good fit?', value:fit.trim(), kind:'generated'});
  }

  let motivation = `The ${title} position at ${company} caught my attention because it offers a practical opportunity to build on my current experience while moving deeper into this area.`;
  if (tasks.length) motivation += ` The responsibilities around ${naturalFragment(tasks[0])}${tasks[1] ? ` and ${naturalFragment(tasks[1])}` : ''} are particularly relevant to what I am looking for next.`;
  templates.push({key:'motivation', label:'Short motivation', value:motivation, kind:'generated'});

  let cover = `Dear Hiring Team,\n\nI would like to apply for the ${title} position at ${company}.`;
  if (profile) cover += ` ${profile}`;
  if (roleDetail) cover += ` What particularly attracted me to this vacancy is the opportunity to work on ${naturalFragment(roleDetail)}.`;
  if (expectations[0]) cover += ` The emphasis on ${naturalFragment(expectations[0])} also matches the direction in which I want to continue developing.`;
  cover += `\n\nI would be glad to discuss how my background and practical experience could contribute to your team.\n\nBest regards`;
  templates.push({key:'cover_note', label:'Short cover note', value:cover, kind:'generated'});

  const notice = templateClean(data.notice_period);
  if (notice) templates.push({
    key:'notice', label:'Notice period', value:`My current notice period is ${notice}.`, kind:'saved'
  });

  const salary = templateClean(data.salary_expectation);
  if (salary) templates.push({
    key:'salary', label:'Salary expectations',
    value:`My salary expectation is ${salary}. I am open to discussing it in the context of the role's scope, responsibilities and overall compensation package.`,
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
      <div><h4>Application drafts</h4><small>Tailored to this vacancy — review before pasting.</small></div>
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
    host.innerHTML = '<div class="quick-answer-empty">Add a Short profile in Application data to unlock more personalized drafts.</div>';
    return;
  }
  host.innerHTML = templates.map(item => `
    <article class="answer-template-card" data-template-key="${esc(item.key)}">
      <div class="answer-template-head"><b>${esc(item.label)}</b><span>${item.kind === 'saved' ? 'YOUR DATA' : 'VACANCY DRAFT'}</span></div>
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

ensureTemplateSection();
if (!document.querySelector('#applicationAssistant')?.hidden) renderApplicationAnswerTemplates();
