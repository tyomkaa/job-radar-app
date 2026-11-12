// v0.5 Daily Recommendations: transparent local priorities + user feedback.
// No network AI, no unsupported probability-of-hire claims.
const DAILY_FEEDBACK_KEY='jobRadarDailyFeedbackV1';
const DAILY_SNAPSHOT_KEY='jobRadarDailySnapshotV3';
function dailyFeedDay(){return meta?.generated_at?localDateKey(meta.generated_at):today()}
function dailyFeedRevision(){return String(meta?.generated_at||'')}
function dailySnapshot(){
  try{
    const value=JSON.parse(localStorage.getItem(DAILY_SNAPSHOT_KEY)||'null');
    if(!value||value.day!==dailyFeedDay()||!Array.isArray(value.keys))return null;
    // Same date is not the same feed: a manual/scheduled regeneration can
    // change server Daily IDs while the date remains unchanged.
    if(Array.isArray(meta?.daily_pick_ids)&&value.feed_revision!==dailyFeedRevision())return null;
    return value;
  }catch{return null}
}
function dailySaveSnapshot(selected){
  if(!jobs.length)return;
  try{localStorage.setItem(DAILY_SNAPSHOT_KEY,JSON.stringify({
    day:dailyFeedDay(),feed_revision:dailyFeedRevision(),
    keys:selected.map(x=>jobKey(x.job)),created_at:new Date().toISOString()
  }))}catch{}
}
function dailyTechnicalScope(job){
  const t=String(job.title||'');
  // Generic HR, recruitment and low-signal analysts/support jobs can remain in All.
  if(/\b(?:hr|human resources|recruit(?:ment|er|ing)|kadry|payroll|learning & development)\b/i.test(t))return false;
  if(/test automation|automation test|qa automation|automation tester|helpdesk|service desk|l1 support|first.line support|application support|wsparcia aplikacj/i.test(t)&&!/automat|workflow|rpa/i.test(t))return false;
  const dir=dailyClassify(job).direction;
  if(dir!=='other')return true;
  return /network|sieci|telekom|telecom|noc|python|developer|integracj|integration|crm|system administrator|administrator.*system|sql.*analyst|data analyst|analityk danych|reporting analyst/i.test(t);
}
const DAILY_FAVORITES=['google','microsoft','apple','meta','amazon','adobe','cisco','ibm','oracle','salesforce','nvidia'];
const DAILY_REASONS=['Not my career direction','Not interested in the duties','Requirements too advanced','Not interested in the company','Other'];
function dailyFeedback(){try{return JSON.parse(localStorage.getItem(DAILY_FEEDBACK_KEY)||'{}')}catch{return {}}}
function saveDailyFeedback(job,reason){const data=dailyFeedback();data[jobKey(job)]={reason,updated_at:new Date().toISOString(),title:job.title};localStorage.setItem(DAILY_FEEDBACK_KEY,JSON.stringify(data))}
function dailyClassify(j){
  const text=String(j.title||'').toLowerCase();
  const autom=/(automatyzac|automation|rpa|workflow|power automate|integracj.*system|integration.*automat|process automation|n8n)/i.test(text);
  const bridge=/(crm.*automat|marketing automation|process improvement|optimiz.*process|usprawnian.*proces|system.*automat|business.*automat|ai.*e.?commerce)/i.test(text);
  if(/test automation|automation test|qa automation|automation tester/i.test(text))return {direction:'other',boost:0};
  if(bridge)return {direction:'bridge',boost:18};
  if(autom)return {direction:'automation',boost:27};
  return {direction:'other',boost:0};
}
function dailyPenalty(j){
  const title=String(j.title||'');
  const requirements=(j.summary_expectations||[]).join(' ').toLowerCase();
  const tasks=(j.summary_tasks||[]).join(' ').toLowerCase();
  let p=0;
  if(/chemik|chemistry|laborator|analizy zagroż|analizy zagroz|fizykochem|cybersecurity analyst|data scien|mlops|llmops|fine.tun|research scientist|influencer|social media|content editor|freight|payroll|test automation|automation test|qa automation|automation tester/i.test(title))p+=95;
  if(/chemik|fizykochem|laboratoryjn|laboratory equipment|obsługi.*sprzętu laboratoryjn/i.test(requirements+' '+tasks))p+=65;
  if(/doświadczenie w obszarze inżynierii ai.ml|fine.tuningiem|mlops|llmops|model lifecycle management/i.test(requirements))p+=50;
  if(/\b(?:mid|regular|senior|expert)\b/i.test(j.seniority||''))p+=14;
  return p;
}
function dailyScore(j){
  const interest=dailyClassify(j);
  const feedback=Object.values(dailyFeedback());
  const careerDismissals=feedback.filter(x=>x.reason==='Not my career direction').length;
  const otherPenalty=interest.direction==='other'?Math.min(12,careerDismissals*2):0;
  const company=String(j.company||'').toLowerCase();
  const bigCompany=DAILY_FAVORITES.some(name=>new RegExp('(^|[^a-z])'+name+'([^a-z]|$)','i').test(company));
  return Number(j.fit_score||0)+interest.boost+(bigCompany?6:0)-dailyPenalty(j)-otherPenalty;
}
// A server-approved AI career disagreement is a CHECK, not a ready-to-apply
// vacancy. A user-saved local SKIP always overrides the server's review queue.
function dailyNeedsManualCheck(job){
  if(!job || !Array.isArray(meta?.daily_review_ids) ||
      !meta.daily_review_ids.map(String).includes(String(job.id)))return false;
  if(job.ai_review?.verdict!=='SKIP')return false;
  const overrides=typeof aiReviews==='function'?aiReviews():{};
  const explicit=overrides[jobKey(job)]||overrides['id:'+job.id];
  return explicit?.verdict!=='SKIP';
}
// Backend APPLY is heuristic; a free AI CHECK still needs human verification.
function dailyRequiresCheck(job){
  const review=typeof aiReviewFor==='function'?aiReviewFor(job):job?.ai_review;
  return review?.verdict==='CHECK'||dailyNeedsManualCheck(job);
}
function dailyAiAllowed(job){
  const review=typeof aiReviewFor==='function'?aiReviewFor(job):job?.ai_review;
  return review?.verdict!=='SKIP'||dailyNeedsManualCheck(job);
}

// One Daily list, three honestly labelled levels of evidence. This replaces
// the separate Still listed / Worth checking shelves; no more render wrappers.
const DAILY_MANUAL_HIDDEN_KEY='jobRadarManualLeadsHiddenV1';
const DAILY_SOURCE_DOMAINS=['justjoin.it','pracuj.pl','nofluffjobs.com',
  'rocketjobs.pl','theprotocol.it','greenhouse.io','lever.co'];
function dailyOriginalUrl(raw){
  try{
    const url=new URL(String(raw||''));
    if(url.protocol!=='https:')return null;
    if(!DAILY_SOURCE_DOMAINS.some(domain=>url.hostname===domain||
       url.hostname.endsWith('.'+domain)))return null;
    return url.href;
  }catch{return null}
}
function dailyStillListedJobs(){
  if(!Array.isArray(meta?.still_listed_ids))return [];
  const fresh=new Set((meta?.daily_pick_ids||[]).map(String));
  const used=new Set(), feedback=dailyFeedback(), tracker=getTracker();
  const result=[];
  for(const id of meta.still_listed_ids.slice(0,3)){
    const job=jobs.find(x=>String(x.id)===String(id));
    if(!job||used.has(String(job.id))||fresh.has(String(job.id)))continue;
    used.add(String(job.id));
    if(!dailyOriginalUrl(job.url)||
       !['APPLY','POSSIBLE'].includes(String(job.recommendation_tier||''))||
       !/umowa o prac|employment contract/i.test(String(job.contract||''))||
       /\b(?:mid|regular|senior|lead|expert)\b/i.test(String(job.seniority||''))||
       Number(job.experience_required_years||0)>2||
       aiReviewFor(job)?.verdict==='SKIP'||
       feedback[jobKey(job)]||tracker[jobKey(job)])continue;
    result.push(job);
  }
  return result;
}
function dailyHiddenManualLeads(){
  try{
    const saved=JSON.parse(localStorage.getItem(DAILY_MANUAL_HIDDEN_KEY)||'{}');
    return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  }catch{return {}}
}
function dailyManualCandidates(){
  const source=Array.isArray(meta?.manual_review_leads)?
    meta.manual_review_leads.slice(0,15):[];
  const hidden=dailyHiddenManualLeads(),used=new Set();
  const existing=new Set(jobs.map(j=>dailyOriginalUrl(j.url)).filter(Boolean));
  return source.filter(lead=>{
    if(!lead||lead.review_status!=='UNVERIFIED')return false;
    const url=dailyOriginalUrl(lead.url);
    if(!url||used.has(url)||existing.has(url)||hidden[url])return false;
    const contract=String(lead.board_contract_unverified||'');
    if(contract&&!/umowa o prac|employment contract/i.test(contract))return false;
    // No automatic APPLY or verified eligibility for these source-card leads.
    used.add(url);
    return true;
  });
}
function dailyText(parent,element,className,textValue){
  const el=document.createElement(element);
  if(className)el.className=className;
  el.textContent=String(textValue||'');
  parent.appendChild(el);
  return el;
}
function dailyDecorateAdditionalCards(){
  if(activeFilter!=='DAILY')return;
  const host=document.querySelector('#jobs');
  if(!host)return;
  // Previously seen strict matches are full cards with the SAME tracking,
  // queue, CV and Prepare actions as regular Daily picks.
  const older=new Set(dailyStillListedJobs().map(j=>String(j.id)));
  document.querySelectorAll('#jobs .job-card').forEach(card=>{
    if(!older.has(String(card.dataset.jobId)))return;
    const job=jobs.find(j=>String(j.id)===String(card.dataset.jobId));
    if(!job)return;
    const level=card.querySelector('.level');
    if(level){
      level.textContent='STILL LISTED · CHECK';
      level.classList.remove('tier-apply','tier-stretch');
      level.classList.add('tier-possible');
    }
    if(card.querySelector('.daily-reseen-note'))return;
    const first=String(job.first_found_at||'').slice(0,10);
    const msg=first?'First seen '+first+' · ':'Previously seen · ';
    const note=document.createElement('p');
    note.className='daily-reseen-note';
    note.textContent=msg+
      'Found again in the latest job-board scan. Not a new posting; verify that hiring is still open.';
    card.querySelector('.actions')?.insertAdjacentElement('afterend',note);
  });
  const candidates=dailyManualCandidates();
  if(candidates.length)host.querySelector('.empty')?.remove();
  // Source-only leads remain deliberately lightweight: there is no invented
  // match score, AI verdict, verified contract or artificial tracker entry.
  for(const item of candidates){
    const url=dailyOriginalUrl(item.url);
    const card=document.createElement('article');
    card.className='manual-lead-card daily-unverified-card';
    card.dataset.reviewUrl=url;
    dailyText(card,'div','manual-lead-status','CHECK · NOT VERIFIED');
    dailyText(card,'h3','manual-lead-title',item.title);
    dailyText(card,'p','manual-lead-company',item.company);
    const contract=String(item.board_contract_unverified||'');
    const note=/umowa o prac|employment contract/i.test(contract)
      ? 'UoP listed by board · confirm with employer'
      : 'Contract unknown · verify UoP';
    dailyText(card,'p','manual-lead-facts',
      [item.location,item.work_mode,note].filter(Boolean).join(' · '));
    const level=String(item.board_seniority_unverified||'').toLowerCase();
    if(level.includes('junior')&&/\b(?:mid|regular)\b/i.test(level))
      dailyText(card,'p','manual-lead-warning',
        'Board also lists mid level · confirm junior eligibility.');
    const skills=Array.isArray(item.board_skills_unverified)?
      item.board_skills_unverified.filter(x=>typeof x==='string'&&x.trim()).slice(0,8):[];
    if(skills.length)
      dailyText(card,'p','manual-lead-skills',
        'Board tags (not verified requirements): '+skills.map(s=>s.slice(0,60)).join(' · '));
    const actions=document.createElement('div');
    actions.className='manual-lead-actions';
    const link=document.createElement('a');
    link.className='manual-lead-open';
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Check original offer';
    actions.appendChild(link);
    const hide=document.createElement('button');
    hide.type='button';hide.className='manual-lead-hide';hide.textContent='Not relevant';
    hide.addEventListener('click',()=>{
      const ignored=dailyHiddenManualLeads();
      ignored[url]=true;
      try{localStorage.setItem(DAILY_MANUAL_HIDDEN_KEY,JSON.stringify(ignored))}catch{}
      render();
    });
    actions.appendChild(hide);
    card.appendChild(actions);
    host.appendChild(card);
  }
}

function dailyRecommendations(){
  const feedback=dailyFeedback(); const tracker=getTracker();
  // The backend is the sole recommendation authority for new feeds.
  // Client-side applied/dismissed/AI SKIP feedback may only hide items.
  if(Array.isArray(meta?.daily_pick_ids)){
    const snapshot=dailySnapshot();
    const keys=snapshot?.keys||meta.daily_pick_ids.map(id=>{
      const job=jobs.find(j=>String(j.id)===String(id));
      return job?jobKey(job):null;
    }).filter(Boolean);
    if(!snapshot){
      try{localStorage.setItem(DAILY_SNAPSHOT_KEY,JSON.stringify({
        day:dailyFeedDay(),feed_revision:dailyFeedRevision(),
        keys,created_at:new Date().toISOString(),source:'server'
      }))}catch{}
    }
    const lookup=new Map(jobs.map(j=>[jobKey(j),j]));
    return keys.map(key=>lookup.get(key)).filter(j=>
      j&&!feedback[jobKey(j)]&&!tracker[jobKey(j)]&&dailyAiAllowed(j))
      .map(j=>({job:j,score:dailyScore(j),focus:dailyClassify(j)}));
  }
  const snapshot=dailySnapshot();
  if(snapshot){
    const byKey=new Map(jobs.map(j=>[jobKey(j),j]));
    return snapshot.keys.map(key=>byKey.get(key)).filter(j=>
      j&&!feedback[jobKey(j)]&&!tracker[jobKey(j)]&&dailyTechnicalScope(j))
      .map(j=>({job:j,score:dailyScore(j),focus:dailyClassify(j)}));
  }
  const list=jobs.filter(j=>!feedback[jobKey(j)]&&!tracker[jobKey(j)]&&v21LocallyEligible(j)&&Number(j.experience_required_years||0)<=2)
  .map(j=>({job:j,score:dailyScore(j),focus:dailyClassify(j)}))
  .filter(x=>x.score>=68 && dailyPenalty(x.job)<60 && dailyTechnicalScope(x.job) && ['APPLY','POSSIBLE'].includes(tierFor(x.job)));
  list.sort((a,b)=>b.score-a.score||Number(b.job.fit_score||0)-Number(a.job.fit_score||0));
  const selected=[];const names=new Set(); 
  // Include most promising automation, then excellent transition roles.
  for(const group of ['automation','bridge','other']){
    for(const item of list){
      if(item.focus.direction!==group||selected.length>=10)continue;
      const dedupe=(item.job.company||'')+'|'+(item.job.title||'');
      if(names.has(dedupe))continue;
      if(group==='other'&&selected.filter(x=>x.focus.direction==='other').length>=2)break;
      selected.push(item);names.add(dedupe);
    }
  }
  dailySaveSnapshot(selected);
  return selected;
}
const _dailyVisible=getVisibleJobs;
getVisibleJobs=function(pinnedId=''){
  if(activeFilter!=='DAILY')return _dailyVisible(pinnedId);
  const selection=dailyRecommendations().map(x=>x.job);
  if(pinnedId){const j=jobs.find(j=>String(j.id)===String(pinnedId));if(j&&!selection.includes(j))selection.unshift(j)}
  const seen=new Set(selection.map(job=>String(job.id)));
  for(const old of dailyStillListedJobs()){
    if(!seen.has(String(old.id))){selection.push(old);seen.add(String(old.id))}
  }
  return selection;
};
function dailySelectionProgress(){
  const stored=dailySnapshot();
  const feedback=dailyFeedback(),tracker=getTracker();
  const byKey=new Map(jobs.map(j=>[jobKey(j),j]));
  const source=Array.isArray(meta?.daily_pick_ids)?meta.daily_pick_ids.map(id=>
    jobs.find(j=>String(j.id)===String(id))).filter(Boolean).map(j=>jobKey(j)):[];
  const keys=stored?.keys||source;
  const counts={total:keys.length,ready:0,reviewOnly:0,applied:0,dismissed:0,aiSkipped:0,missing:0,newlyFound:0};
  for(const key of keys){
    const job=byKey.get(key);
    if(!job){counts.missing++;continue;}
    if(isFirstFoundToday(job))counts.newlyFound++;
    if(tracker[key])counts.applied++;
    else if(feedback[key])counts.dismissed++;
    else if(dailyRequiresCheck(job))counts.reviewOnly++;
    else if(aiReviewFor(job)?.verdict==='SKIP')counts.aiSkipped++;
    else counts.ready++;
  }
  return counts;
}
function dailyQuotaTop(){
  let badge=document.querySelector('#dailyQuotaTop');
  const quota=meta?.ai_budget;
  // No misleading placeholder if the server has not yet sent a valid reading.
  if(!quota||!Number.isFinite(Number(quota.used))||!Number.isFinite(Number(quota.limit))||!quota.date_utc){
    if(badge)badge.hidden=true;
    return;
  }
  if(!badge){
    badge=document.createElement('section');
    badge.id='dailyQuotaTop';
    badge.className='ai-budget-top';
    badge.setAttribute('aria-label','Cloudflare AI quota at last feed update');
    (document.querySelector('#stats')||document.querySelector('.topbar'))?.insertAdjacentElement('afterend',badge);
  }
  badge.hidden=false;
  badge.replaceChildren();
  const caption=document.createElement('strong');
  caption.textContent='AI budget · '+quota.used+' / '+quota.limit+' attempts used';
  const note=document.createElement('small');
  note.textContent=quota.remaining+' remaining · last checked '+quota.date_utc+' UTC · not live';
  const progress=document.createElement('progress');
  progress.max=Math.max(1,Number(quota.limit));
  progress.value=Math.min(progress.max,Math.max(0,Number(quota.used)));
  badge.append(caption,progress,note);
  const ai=meta?.ai_automatic;
  if(ai){
    const info=document.createElement('small');
    const reviewed=Number.isFinite(Number(ai.daily_reviewed))?Number(ai.daily_reviewed):
      (meta?.daily_pick_ids||[]).filter(id=>jobs.find(j=>String(j.id)===String(id))?.ai_review).length;
    info.textContent='AI from latest search: '+(ai.new||0)+' new requests, '+
      (ai.reused||0)+' previous verdicts reused across all vacancies · '+
      reviewed+' of '+(ai.daily_total??meta?.daily_pick_ids?.length??0)+
      ' server Daily Picks have a saved AI verdict. Reused results cost 0 new attempts.';
    badge.appendChild(info);
  }
}
function dailyDecorate(){
  const list=dailyRecommendations();const host=document.querySelector('#dailyBrief');if(!host)return;
  host.hidden=activeFilter!=='DAILY';
  if(host.hidden)return;
  const n=jobs.length;const auto=list.filter(x=>x.focus.direction==='automation').length;
  const progress=dailySelectionProgress();
  const handled=progress.applied+progress.dismissed+progress.aiSkipped;
  const parts=[];
  if(progress.applied)parts.push(progress.applied+' applied/tracked');
  if(progress.dismissed)parts.push(progress.dismissed+' dismissed');
  if(progress.aiSkipped)parts.push(progress.aiSkipped+' AI SKIP');
  if(progress.missing)parts.push(progress.missing+' no longer available');
  host.replaceChildren();
  const kicker=document.createElement('div');kicker.className='daily-kicker';
  kicker.textContent='YOUR DAILY RECOMMENDATIONS';
  const heading=document.createElement('h2');
  const older=dailyStillListedJobs().length, manual=dailyManualCandidates().length;
  heading.textContent=(list.length+older+manual)+' Daily opportunities';
  const statusLine=document.createElement('small');
  statusLine.textContent=progress.ready+' ready to review · '+progress.reviewOnly+
    ' require manual CHECK · '+handled+' already handled';
  const description=document.createElement('p');
  description.textContent=progress.newlyFound+' newly found today · '+
    older+' previously seen (still listed) · '+manual+
    ' unverified leads. AI CHECK and source-card leads require manual verification; '+
    'no older listing is counted as a new posting.';
  const note=document.createElement('small');
  note.textContent='One list, in priority order: AI-reviewed picks, still-listed eligible roles, '+
    'then source-only CHECK leads. '+
    (parts.length?'Already handled: '+parts.join(', ')+'. ':'')+
    'Your choices remain saved only on this device.';
  host.append(kicker,heading,statusLine,description,note);
  const audit=meta?.daily_diagnostics;
  if(audit?.reasons){
    const details=document.createElement('details');
    details.className='daily-selection-audit';
    const sum=document.createElement('summary');
    sum.textContent='How today’s shortlist was selected';
    details.appendChild(sum);
    const p=document.createElement('p');
    p.textContent=String(audit.feed_candidates||0)+' accepted vacancies checked; '+
      String(audit.shortlisted||0)+' recommended. Excluded by: '+
      Object.entries(audit.reasons).filter(([k,v])=>k!=='qualified'&&v)
       .map(([key,count])=>key.replaceAll('_',' ')+': '+count).join(' · ')+
      '. Applied or dismissed jobs are hidden only on this device.';
    details.appendChild(p);
    host.appendChild(details);
  }
  document.querySelectorAll('#jobs .job-card').forEach(card=>{
    const job=jobs.find(j=>String(j.id)===String(card.dataset.jobId));
    const strict=new Set(Array.isArray(meta?.daily_pick_ids)?meta.daily_pick_ids.map(String):list.map(x=>String(x.job.id)));
    if(!job||!strict.has(String(job.id))||card.querySelector('.daily-vote'))return;
    const info=dailyClassify(job);
    const wrap=document.createElement('div');wrap.className='daily-vote';
    const title=String(job.title||'');
    const other=/network|networking|sieci|telekom|telecom|noc/i.test(title)?'Career direction: networks / telecom':
      /administrator|system/i.test(title)?'Career direction: IT systems (verify requirements)':'Related CV direction — review your interest';
    const label=info.direction==='automation'?'Career direction: AI / workflow automation':info.direction==='bridge'?'Career direction: transition into automation':other;
    const disputedSkip=dailyNeedsManualCheck(job);
    const needsCheck=dailyRequiresCheck(job);
    const review=typeof aiReviewFor==='function'?aiReviewFor(job):job?.ai_review;
    // Display the effective AI CHECK rather than a misleading APPLY badge,
    // without altering stored backend tier or user tracking state.
    if(needsCheck){
      const level=card.querySelector('.level');
      if(level){
        level.textContent='CHECK · AI review';
        level.classList.remove('tier-apply','tier-stretch');
        level.classList.add('tier-possible');
      }
    }
    const checkReason=disputedSkip
      ? 'CHECK · AI career disagreement — not ready-to-apply'
      : review?.verdict==='CHECK'
        ? 'CHECK · AI recommends verifying requirements before applying'
        : '';
    wrap.innerHTML='<div class="daily-explain">'+
      (needsCheck?'<strong>'+checkReason+'</strong> · ':'')+
      esc(label)+'</div><button class="daily-dismiss" type="button">Not for me</button>';
    wrap.querySelector('button').addEventListener('click',()=>{
      const reason=window.prompt('Why not?\n1 — Not my career direction\n2 — Not interested in the duties\n3 — Requirements too advanced\n4 — Not interested in the company\n5 — Other\nEnter 1–5 (Cancel to keep):','1');
      if(reason===null)return;
      const idx=Number(reason)-1; if(idx<0||idx>=DAILY_REASONS.length||!Number.isInteger(idx))return;
      saveDailyFeedback(job,DAILY_REASONS[idx]);render();
    });
    card.querySelector('.actions')?.insertAdjacentElement('afterend',wrap);
  });
}
const _dailyRender=render;
render=function(options={}){_dailyRender(options);dailyQuotaTop();dailyDecorate();dailyDecorateAdditionalCards()};
const dailyTab=document.querySelector('[data-filter="DAILY"]');
if(dailyTab){document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));dailyTab.classList.add('active');activeFilter='DAILY'}
if(jobs.length)render();
