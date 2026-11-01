// Curated Ukrainian-rooted employers with documented operations in Poland.
// This is an employer filter plus official career pages, not a new crawler.
// Do NOT infer company origin from vacancy language or Ukrainian surnames.
(function () {
  'use strict';
  const EMPLOYERS = Object.freeze([
    {name:'Creatio', aliases:['creatio'], city:'Warsaw',
      careers:'https://www.creatio.com/company/careers',
      note:'Ukrainian roots · AI CRM and workflow automation'},
    {name:'Intellias', aliases:['intellias'], city:'Warsaw, Kraków, Wrocław, Gdańsk',
      careers:'https://career.intellias.com/',
      note:'Founded in Lviv · software and product engineering'},
    {name:'N-iX', aliases:['n-ix','n ix'], city:'Warsaw, Kraków, Wrocław',
      careers:'https://careers.n-ix.com/n-ix-poland/',
      note:'Founded in Lviv · software engineering'},
    {name:'SoftServe', aliases:['softserve','soft serve'], city:'Warsaw and other Polish cities',
      careers:'https://career.softserveinc.com/en-us/vacancies/office/country-poland',
      note:'Founded in Lviv · technology and software services'},
    {name:'Nova Post', aliases:['nova post','nova poshta','nova poshta poland'], city:'Poland',
      careers:'https://novapost.com/pl-pl/more/career/',
      note:'Ukrainian logistics group · Polish operations'}
  ]);

  function matchingEmployer(job) {
    const company = norm(job?.company || '');
    if (!company) return null;
    for (const employer of EMPLOYERS) {
      if (employer.aliases.some(alias => {
        const needle = norm(alias);
        // Do not accidentally match substrings (e.g. "nova" or "nix")
        return company === needle || company.startsWith(needle + ' ');
      })) return employer;
    }
    return null;
  }
  function ukrainianEmployerJobs() {
    // These jobs have already gone through Job Radar's backend validation;
    // no additional job or UoP claim is inferred from the watchlist.
    return sortJobs(jobs.filter(job => matchingEmployer(job) && v21LocallyEligible(job)));
  }

  const previousVisible = getVisibleJobs;
  getVisibleJobs = function(pinnedId='') {
    if (activeFilter !== 'UA_EMPLOYERS') return previousVisible(pinnedId);
    const listed = ukrainianEmployerJobs();
    if (pinnedId) {
      const pinned = jobs.find(job => String(job.id) === String(pinnedId));
      if (pinned && matchingEmployer(pinned) && !listed.some(x => String(x.id)===String(pinnedId)))
        listed.unshift(pinned);
    }
    return listed;
  };

  function renderEmployerGuide() {
    let host = document.querySelector('#uaEmployersGuide');
    if (!host) {
      host = document.createElement('section');
      host.id = 'uaEmployersGuide';
      host.className = 'ua-employer-guide';
      document.querySelector('#dailyBrief')?.insertAdjacentElement('afterend', host);
    }
    if (!host) return;
    host.hidden = activeFilter !== 'UA_EMPLOYERS';
    if (host.hidden) return;

    const matches = ukrainianEmployerJobs();
    host.replaceChildren();
    const top = document.createElement('div');
    top.className = 'ua-employer-guide-head';
    const title = document.createElement('h2');
    title.textContent = 'Ukrainian-rooted employers in Poland';
    const subtitle = document.createElement('p');
    subtitle.textContent = matches.length + ' verified-feed job' +
      (matches.length === 1 ? '' : 's') +
      ' from these employers · ' + EMPLOYERS.length + ' career pages to explore';
    top.append(title, subtitle);
    host.appendChild(top);

    const disclaimer = document.createElement('p');
    disclaimer.className = 'ua-employer-note';
    disclaimer.textContent = 'Only vacancies already found and accepted by Job Radar appear as job cards below. ' +
      'Career-page links are for independent browsing; they do not confirm a live suitable opening, ' +
      'UoP or an advantage based on nationality. Polish location/work eligibility must be checked per vacancy.';
    host.appendChild(disclaimer);

    const list = document.createElement('div');
    list.className = 'ua-employer-list';
    EMPLOYERS.forEach(employer => {
      const count = matches.filter(job => matchingEmployer(job) === employer).length;
      const row = document.createElement('div');
      row.className = 'ua-employer-row';
      const detail = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = employer.name;
      const note = document.createElement('small');
      note.textContent = employer.city + ' · ' + employer.note +
        ' · ' + count + ' in current feed';
      detail.append(name, note);
      const link = document.createElement('a');
      link.href = employer.careers;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Careers ↗';
      link.setAttribute('aria-label', 'Open official careers for '+employer.name);
      row.append(detail, link);
      list.appendChild(row);
    });
    host.appendChild(list);
  }

  const previousRender = render;
  render = function(options={}) {
    previousRender(options);
    const tab=document.querySelector('[data-filter="UA_EMPLOYERS"]');
    if(tab) {
      const count=ukrainianEmployerJobs().length;
      tab.textContent='🇺🇦 Ukrainian employers'+(count?' '+count:'');
    }
    renderEmployerGuide();
  };
  if (jobs.length) render();
})();
