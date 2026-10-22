// Job Radar v0.4.1: one focused shortlist, one CV recommendation authority.
// Backend fit_notes.suggested_cv selects the variant. The PDF always remains
// local to this device, and an explicit user choice always takes precedence.

const _v21CvFallback = recommendCv;

function v21CvCategory(value) {
  const text = String(value || '').toLowerCase();
  if (/automation|python|rpa/.test(text)) return 'automation';
  if (/network|telecom|noc/.test(text)) return 'network';
  if (/systems|system|application support|infrastructure/.test(text)) return 'systems';
  if (/marketing|seo|e-commerce|ecommerce|web &|web and/.test(text)) return 'marketing';
  if (/data|operation|analysis|reporting|business analyst/.test(text)) return 'data';
  if (/general/.test(text)) return 'general';
  return '';
}

recommendCv = function(job, cvs) {
  if (!cvs?.length) return null;
  const backendVariant = String(job?.fit_notes?.suggested_cv || '');
  const wanted = v21CvCategory(backendVariant);
  const def = cvs.find(cv => cv.id === cvDefaultId());
  if (wanted) {
    // Variant name is deliberate user metadata. Do not infer from every broad
    // tag of a General CV and accidentally recommend the same PDF for all jobs.
    const found = cvs.find(cv => v21CvCategory(cv.label) === wanted)
      || cvs.find(cv => v21CvCategory(cv.file_name) === wanted);
    if (found) return found;
    // A missing specialist CV is not permission to recommend an unrelated CV.
    return def || cvs.find(cv => v21CvCategory(cv.label) === 'general') || cvs[0];
  }
  return _v21CvFallback(job, cvs);
};

function v21LocallyEligible(job) {
  // Defense-in-depth for older cached feeds until the next backend run.
  const loc = String(job.location || '').toLowerCase();
  const mode = String(job.work_mode || '').toLowerCase();
  const warsaw = /warszaw|warsaw/.test(loc);
  if (warsaw) return true;
  // All-Poland / another Polish city is acceptable only for full remote, not
  // a hybrid role that merely mentions remote interviews somewhere.
  return /remote|zdaln/.test(mode) && !/hybrid|hybryd|office|onsite|on-site|stacjon/.test(mode);
}

function v21FocusPriority(job) {
  const score = Number(job.fit_score || 0);
  const automation = hasInterestTag(job, 'automation') ? 12 : 0;
  const exp = Number(job.experience_required_years || 0);
  return score + automation + (exp === 1 ? 0.4 : 0);
}

function v21FocusList() {
  const tracker = getTracker();
  if(Array.isArray(meta?.focus_job_ids)){
    const lookup=new Map(jobs.map(j=>[String(j.id),j]));
    return meta.focus_job_ids.map(id=>lookup.get(String(id))).filter(job=>
      job&&!tracker[jobKey(job)]&&v21LocallyEligible(job)&&
      aiReviewFor(job)?.verdict!=='SKIP'&&
      !(typeof dailyFeedback==='function'&&dailyFeedback()[jobKey(job)]));
  }
  const eligible = jobs.filter(j => {
    const tier = tierFor(j);
    return (tier === 'APPLY' || tier === 'POSSIBLE') &&
      !tracker[jobKey(j)] && v21LocallyEligible(j);
  });
  // Never lower the quality bar merely to fill 50 slots.
  const core = eligible.filter(j => Number(j.fit_score || 0) >= 68);
  const promisingAutomation = eligible.filter(j =>
    hasInterestTag(j, 'automation') && Number(j.fit_score || 0) >= 58
  );
  const selected = new Map();
  for (const job of [...core, ...promisingAutomation]) selected.set(String(job.id), job);
  return [...selected.values()]
    .sort((a, b) => v21FocusPriority(b) - v21FocusPriority(a))
    .slice(0, 50);
}

const _v21PreviousVisible = getVisibleJobs;
getVisibleJobs = function(pinnedId='') {
  if (activeFilter !== 'FOCUS') return _v21PreviousVisible(pinnedId);
  const shortlist = v21FocusList();
  if (pinnedId) {
    const pinned = jobs.find(j => String(j.id) === String(pinnedId));
    if (pinned && !shortlist.some(j => String(j.id) === String(pinnedId))) {
      shortlist.unshift(pinned);
    }
  }
  return shortlist;
};

function v21FocusCount() {
  const count = v21FocusList().length;
  const chip = document.querySelector('[data-filter="FOCUS"]');
  if (chip) {
    chip.textContent = `Focus ${count}`;
    chip.title = 'Up to 50 high-fit jobs, with promising automation included. All remains available.';
  }
}

function v21FocusBrief(){
  let host=document.querySelector('#focusBrief');
  if(!host){
    host=document.createElement('section');
    host.id='focusBrief';
    host.className='focus-brief';
    document.querySelector('#dailyBrief')?.insertAdjacentElement('afterend',host);
  }
  if(!host)return;
  host.hidden=activeFilter!=='FOCUS';
  if(host.hidden)return;
  const all=Array.isArray(meta?.focus_job_ids)?meta.focus_job_ids.length:v21FocusList().length;
  const visible=v21FocusList();
  const stretch=visible.filter(j=>j.recommendation_tier==='STRETCH').length;
  host.replaceChildren();
  const heading=document.createElement('strong');
  heading.textContent='Focus: '+visible.length+' to explore · '+Math.max(0,all-visible.length)+' already handled';
  const message=document.createElement('p');
  message.textContent='Server selected '+all+' technically related roles, including promising Mid/Stretch opportunities. '+
    'Your applied/dismissed vacancies and AI SKIP are hidden. '+
    (stretch?stretch+' exploratory STRETCH option'+(stretch===1?'':'s')+' need extra verification. ':'')+
    'AI verdicts may have been generated on earlier days; they do not imply a new AI request today.';
  host.append(heading,message);
}
const _v21PreviousRender = render;
render = function(options={}) {
  v21FocusCount();
  _v21PreviousRender(options);
  v21FocusBrief();
};

// The normal stream remains in All. Start with a manageable shortlist so
// finding a worthwhile application is the primary experience, not scrolling.
const v21FocusChip = document.querySelector('[data-filter="FOCUS"]');
if (v21FocusChip) {
  const current = document.querySelector('.filter.active');
  if (current) current.classList.remove('active');
  v21FocusChip.classList.add('active');
  activeFilter = 'FOCUS';
}
if (jobs.length) render();
