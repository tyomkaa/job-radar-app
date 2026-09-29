// Job Radar v0.3.4 vacancy-specific application drafts.
// Drafts are built locally from the live vacancy plus profile text saved by the user.
// Vacancy language is detected automatically (Polish / English). Nothing is submitted.

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
    .replace(/^(requirements?|wymagania|expected|you will|you'll|obowiązki|obowiazki)\s*[:–-]?\s*/i, '');
  return text.length > 125 ? `${text.slice(0, 122).trim()}…` : text;
}

function fragmentKey(value) {
  return templateClean(value).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function isBoilerplateFragment(value) {
  const key = fragmentKey(value);
  if (!key) return true;
  const exact = new Set([
    'ta oferta jest dla ciebie', 'ta oferta jest dla ciebie jesli', 'oferta jest dla ciebie',
    'this offer is for you', 'this job is for you', 'sounds like you', 'apply now', 'aplikuj',
    'dolacz do nas', 'join us', 'what we offer', 'what we expect', 'requirements',
    'responsibilities', 'zakres obowiazkow', 'czego oczekujemy', 'kogo szukamy'
  ]);
  if (exact.has(key)) return true;
  return [
    'kliknij aplikuj', 'wyslij cv', 'przeslij cv', 'zloz aplikacje', 'submit your application',
    'ta oferta jest dla ciebie jesli', 'this offer is for you if'
  ].some(pattern => key.includes(pattern));
}

function cleanDraftFragment(value) {
  const text = compactRequirement(value).replace(/[.;:]$/g, '');
  return isBoilerplateFragment(text) ? '' : text;
}

function uniqueText(values) {
  const seen = new Set();
  return values.filter(Boolean).filter(value => {
    const key = fragmentKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function jobDraftContext(job) {
  const tasks = uniqueText(Array.isArray(job?.summary_tasks) ? job.summary_tasks.map(cleanDraftFragment) : []).slice(0, 2);
  const skills = uniqueText(Array.isArray(job?.required_skills) ? job.required_skills.map(cleanDraftFragment) : []);
  const expectations = uniqueText([
    ...skills,
    ...(Array.isArray(job?.summary_expectations) ? job.summary_expectations.map(cleanDraftFragment) : [])
  ]).slice(0, 3);
  return {tasks, expectations};
}

function vacancyLanguageText(job) {
  return [
    job?.title, job?.summary,
    ...(Array.isArray(job?.summary_tasks) ? job.summary_tasks : []),
    ...(Array.isArray(job?.summary_expectations) ? job.summary_expectations : []),
    ...(Array.isArray(job?.summary_offers) ? job.summary_offers : [])
  ].join(' ');
}

function detectVacancyLanguage(job) {
  const raw = vacancyLanguageText(job);
  const text = ` ${templateClean(raw).toLowerCase()} `;
  if (!text.trim()) return 'en';

  let pl = (raw.match(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g) || []).length * 2;
  let en = 0;
  const plSignals = [
    ' praca ', ' pracy ', ' stanowisko ', ' obowiązki ', ' obowiazki ', ' wymagania ', ' doświadczenie ',
    ' doswiadczenie ', ' znajomość ', ' znajomosc ', ' umiejętność ', ' umiejetnosc ', ' zespół ', ' zespol ',
    ' oferujemy ', ' możliwość ', ' mozliwosc ', ' będziesz ', ' bedziesz ', ' twoje zadania ', ' oczekujemy ',
    ' oraz ', ' który ', ' która ', ' które ', ' jesteś ', ' jestes ', ' kandydat ', ' aplikuj '
  ];
  const enSignals = [
    ' responsibilities ', ' requirements ', ' experience ', ' skills ', ' position ', ' role ', ' team ',
    ' you will ', ' you are ', ' we are ', ' we offer ', ' looking for ', ' candidate ', ' apply ',
    ' opportunity ', ' responsibilities include ', ' what you will do ', ' what we expect '
  ];
  plSignals.forEach(signal => { if (text.includes(signal)) pl += signal.length > 12 ? 3 : 2; });
  enSignals.forEach(signal => { if (text.includes(signal)) en += signal.length > 12 ? 3 : 2; });

  return pl >= Math.max(5, en + 2) ? 'pl' : 'en';
}

function quoted(value, lang) {
  const text = cleanDraftFragment(value);
  if (!text) return '';
  return lang === 'pl' ? `„${text}”` : `“${text}”`;
}

function profileStrengths(profile, lang='en') {
  const text = fragmentKey(profile);
  if (!text) return [];
  const signals = [
    [['python'], 'Python', 'Python'],
    [['automation','automatyz'], 'process automation', 'automatyzacja procesów'],
    [['network','networking','telecom','routing','switching'], 'networking and telecom', 'sieci i telekomunikacja'],
    [['troubleshooting'], 'technical troubleshooting', 'rozwiązywanie problemów technicznych'],
    [['digital marketing','marketing'], 'digital marketing', 'marketing cyfrowy'],
    [['seo'], 'SEO', 'SEO'],
    [['wordpress','woocommerce','ecommerce','e commerce'], 'WordPress / WooCommerce', 'WordPress / WooCommerce'],
    [['business operations','operations'], 'business operations', 'działania operacyjne'],
    [['api'], 'API integrations', 'integracje API'],
    [['playwright'], 'Playwright', 'Playwright'],
    [['openpyxl'], 'openpyxl', 'openpyxl'],
    [['github actions'], 'GitHub Actions', 'GitHub Actions'],
    [['linux'], 'Linux', 'Linux'],
    [['sql'], 'SQL', 'SQL'],
    [['data analysis','analytics'], 'data analysis', 'analiza danych']
  ];
  const out = [];
  for (const [needles, enLabel, plLabel] of signals) {
    if (needles.some(needle => text.includes(fragmentKey(needle)))) out.push(lang === 'pl' ? plLabel : enLabel);
  }
  return [...new Set(out)].slice(0, 6);
}

function joinNatural(values, lang='en') {
  const items = values.filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${lang === 'pl' ? 'i' : 'and'} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${lang === 'pl' ? 'i' : 'and'} ${items.at(-1)}`;
}

function localizedNotice(value, lang='en') {
  const raw = templateClean(value);
  const key = fragmentKey(raw);
  if (lang === 'pl') {
    if (['two weeks','2 weeks','2 week'].includes(key)) return '2 tygodnie';
    if (['one week','1 week'].includes(key)) return '1 tydzień';
    if (['one month','1 month'].includes(key)) return '1 miesiąc';
    if (['immediately','available immediately'].includes(key)) return 'od zaraz';
  } else {
    if (['2 tygodnie','dwa tygodnie'].includes(key)) return '2 weeks';
    if (['1 tydzien','tydzien'].includes(key)) return '1 week';
    if (['1 miesiac','miesiac'].includes(key)) return '1 month';
    if (['od zaraz'].includes(key)) return 'available immediately';
  }
  return raw;
}

function applicationAnswerTemplates(job) {
  if (!job) return [];
  const data = getApplicationData();
  const lang = detectVacancyLanguage(job);
  const title = templateClean(job.title) || (lang === 'pl' ? 'to stanowisko' : 'this position');
  const company = templateClean(job.company) || (lang === 'pl' ? 'tej firmie' : 'the company');
  const {tasks, expectations} = jobDraftContext(job);
  const profile = sentence(data.short_profile || '');
  const strengths = profileStrengths(profile, lang);
  const templates = [];

  const roleDetail = tasks[0] || expectations[0] || '';
  const secondDetail = expectations.find(x => x !== roleDetail) || tasks.find(x => x !== roleDetail) || '';

  if (lang === 'pl') {
    let whyRole = `Interesuje mnie stanowisko ${title} w ${company}, ponieważ łączy ono praktyczne zadania z obszarem, w którym chcę dalej rozwijać swoje kompetencje.`;
    if (roleDetail) whyRole += ` Szczególnie zwrócił moją uwagę element ${quoted(roleDetail, lang)}.`;
    if (secondDetail) whyRole += ` Doceniam też nacisk na ${quoted(secondDetail, lang)}.`;
    whyRole += ' To połączenie sprawia, że widzę w tej roli realną możliwość wniesienia wartości od początku i dalszego rozwoju.';
    templates.push({key:'why_role', label:'Dlaczego interesuje Cię ta rola?', value:whyRole, kind:'generated', lang});

    if (profile) {
      let fit = strengths.length
        ? `Moje doświadczenie obejmuje m.in. ${joinNatural(strengths, lang)}.`
        : 'Mam praktyczne doświadczenie łączące zadania techniczne, pracę z procesami oraz samodzielne rozwiązywanie problemów.';
      if (expectations[0]) fit += ` W tej roli szczególnie przydatne byłoby to w kontekście ${quoted(expectations[0], lang)}.`;
      if (tasks[0]) fit += ` Dobrze odnajduję się również w zadaniach związanych z ${quoted(tasks[0], lang)}.`;
      fit += ' Wnoszę praktyczne podejście, szybko uczę się nowych narzędzi i potrafię sprawnie wejść w nowe procesy.';
      templates.push({key:'good_fit', label:'Dlaczego pasujesz do tej roli?', value:fit, kind:'generated', lang});
    }

    let motivation = `Stanowisko ${title} w ${company} zwróciło moją uwagę, ponieważ daje możliwość wykorzystania dotychczasowego doświadczenia i jednocześnie dalszego rozwoju w tym kierunku.`;
    if (tasks[0]) motivation += ` Szczególnie interesuje mnie obszar ${quoted(tasks[0], lang)}.`;
    templates.push({key:'motivation', label:'Krótka motywacja', value:motivation, kind:'generated', lang});

    let cover = `Dzień dobry,\n\nchciałbym zgłosić swoją kandydaturę na stanowisko ${title} w ${company}.`;
    if (strengths.length) cover += ` Moje doświadczenie obejmuje ${joinNatural(strengths, lang)}.`;
    if (roleDetail) cover += ` W ofercie szczególnie zainteresował mnie obszar ${quoted(roleDetail, lang)}.`;
    if (expectations[0]) cover += ` Zakres związany z ${quoted(expectations[0], lang)} dobrze wpisuje się w kierunek, w którym chcę dalej rozwijać swoje kompetencje.`;
    cover += '\n\nChętnie opowiem szerzej o swoim doświadczeniu i o tym, w jaki sposób mógłbym wesprzeć zespół.\n\nPozdrawiam';
    templates.push({key:'cover_note', label:'Krótki list motywacyjny', value:cover, kind:'generated', lang});
  } else {
    let whyRole = `I'm interested in the ${title} role at ${company} because it combines practical responsibilities with an area in which I want to keep developing.`;
    if (roleDetail) whyRole += ` In particular, ${quoted(roleDetail, lang)} stood out to me.`;
    if (secondDetail) whyRole += ` I also like the emphasis on ${quoted(secondDetail, lang)}.`;
    whyRole += ' That combination makes this a role where I could contribute from the start while continuing to grow.';
    templates.push({key:'why_role', label:'Why are you interested in this role?', value:whyRole, kind:'generated', lang});

    if (profile) {
      let fit = `${profile} `;
      if (expectations[0]) fit += `That background is relevant here because the vacancy emphasizes ${quoted(expectations[0], lang)}. `;
      if (tasks[0]) fit += `I would also be comfortable contributing to work around ${quoted(tasks[0], lang)}. `;
      fit += 'I bring a practical, hands-on approach and I am comfortable learning role-specific tools and processes I have not used yet.';
      templates.push({key:'good_fit', label:'Why are you a good fit?', value:fit.trim(), kind:'generated', lang});
    }

    let motivation = `The ${title} position at ${company} caught my attention because it offers a practical opportunity to build on my current experience while moving deeper into this area.`;
    if (tasks[0]) motivation += ` I am particularly interested in the responsibility around ${quoted(tasks[0], lang)}.`;
    templates.push({key:'motivation', label:'Short motivation', value:motivation, kind:'generated', lang});

    let cover = `Dear Hiring Team,\n\nI would like to apply for the ${title} position at ${company}.`;
    if (profile) cover += ` ${profile}`;
    if (roleDetail) cover += ` What particularly attracted me to this vacancy is ${quoted(roleDetail, lang)}.`;
    if (expectations[0]) cover += ` The emphasis on ${quoted(expectations[0], lang)} also matches the direction in which I want to continue developing.`;
    cover += '\n\nI would be glad to discuss how my background and practical experience could contribute to your team.\n\nBest regards';
    templates.push({key:'cover_note', label:'Short cover note', value:cover, kind:'generated', lang});
  }

  const notice = localizedNotice(data.notice_period, lang);
  if (notice) templates.push({
    key:'notice',
    label: lang === 'pl' ? 'Okres wypowiedzenia' : 'Notice period',
    value: lang === 'pl' ? `Mój aktualny okres wypowiedzenia to ${notice}.` : `My current notice period is ${notice}.`,
    kind:'saved', lang
  });

  const salary = templateClean(data.salary_expectation);
  if (salary) templates.push({
    key:'salary',
    label: lang === 'pl' ? 'Oczekiwania finansowe' : 'Salary expectations',
    value: lang === 'pl'
      ? `Moje oczekiwania finansowe to ${salary}. Jestem otwarty na rozmowę w zależności od zakresu roli, odpowiedzialności i całego pakietu.`
      : `My salary expectation is ${salary}. I am open to discussing it in the context of the role's scope, responsibilities and overall compensation package.`,
    kind:'saved', lang
  });

  const languages = templateClean(data.languages);
  if (languages) templates.push({key:'languages', label:lang === 'pl' ? 'Języki' : 'Languages', value:languages, kind:'saved', lang});

  return templates;
}

function ensureTemplateSection() {
  const quickSection = document.querySelector('#assistantQuickAnswers')?.closest('.assistant-section');
  if (!quickSection || document.querySelector('#assistantAnswerTemplates')) return;
  const section = document.createElement('section');
  section.className = 'assistant-section answer-template-section';
  section.innerHTML = `
    <div class="assistant-section-head">
      <div><h4>Application drafts</h4><small id="assistantDraftLanguage">Language detected automatically.</small></div>
    </div>
    <div id="assistantAnswerTemplates" class="answer-template-list"></div>`;
  quickSection.insertAdjacentElement('afterend', section);
}

function renderApplicationAnswerTemplates() {
  ensureTemplateSection();
  const host = document.querySelector('#assistantAnswerTemplates');
  const job = assistantJob();
  if (!host || !job) return;
  const lang = detectVacancyLanguage(job);
  const languageHint = document.querySelector('#assistantDraftLanguage');
  if (languageHint) languageHint.textContent = `${lang === 'pl' ? 'Polish' : 'English'} detected · drafts adapt automatically.`;
  const templates = applicationAnswerTemplates(job);
  if (!templates.length) {
    host.innerHTML = '<div class="quick-answer-empty">Add a Short profile in Application data to unlock more personalized drafts.</div>';
    return;
  }
  host.innerHTML = templates.map(item => `
    <article class="answer-template-card" data-template-key="${esc(item.key)}">
      <div class="answer-template-head"><b>${esc(item.label)}</b><span>${item.kind === 'saved' ? 'YOUR DATA' : `${String(item.lang || 'en').toUpperCase()} DRAFT`}</span></div>
      <p>${esc(item.value).replace(/\n/g, '<br>')}</p>
      <button type="button" data-copy-template="${esc(item.key)}">${item.lang === 'pl' ? 'Kopiuj odpowiedź' : 'Copy answer'}</button>
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
