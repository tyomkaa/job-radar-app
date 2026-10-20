// v0.5 Daily Recommendations: transparent local priorities + user feedback.
// No network AI, no unsupported probability-of-hire claims.
const DAILY_FEEDBACK_KEY='jobRadarDailyFeedbackV1';
const DAILY_SNAPSHOT_KEY='jobRadarDailySnapshotV2';
function dailyFeedDay(){return meta?.generated_at?localDateKey(meta.generated_at):today()}
function dailySnapshot(){
  try{
    const value=JSON.parse(localStorage.getItem(DAILY_SNAPSHOT_KEY)||'null');
    return value&&value.day===dailyFeedDay()&&Array.isArray(value.keys)?value:null;
  }catch{return null}
}
function dailySaveSnapshot(selected){
  if(!jobs.length)return;
  try{localStorage.setItem(DAILY_SNAPSHOT_KEY,JSON.stringify({
    day:dailyFeedDay(),keys:selected.map(x=>jobKey(x.job)),created_at:new Date().toISOString()
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
function dailyRecommendations(){
  const feedback=dailyFeedback(); const tracker=getTracker();
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
  return selection;
};
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
}
function dailyDecorate(){
  const list=dailyRecommendations();const host=document.querySelector('#dailyBrief');if(!host)return;
  host.hidden=activeFilter!=='DAILY';
  if(host.hidden)return;
  const n=jobs.length;const auto=list.filter(x=>x.focus.direction==='automation').length;
  const total=dailySnapshot()?.keys.length||list.length;
  host.innerHTML='<div class="daily-kicker">YOUR DAILY RECOMMENDATIONS</div><h2>'+list.length+' remaining of '+total+' today</h2><p>Checked '+n+' active vacancies. '+auto+' automation-first options. Shortlist prioritizes your career interest, not just CV keywords.</p><small>Fixed for this feed day: applying or dismissing a job will not add replacements. New selections appear with the next day’s feed. Open All for other vacancies.</small>';
  document.querySelectorAll('#jobs .job-card').forEach(card=>{
    const job=jobs.find(j=>String(j.id)===String(card.dataset.jobId));if(!job||card.querySelector('.daily-vote'))return;
    const info=dailyClassify(job);
    const wrap=document.createElement('div');wrap.className='daily-vote';
    const label=info.direction==='automation'?'Career direction: AI / workflow automation':info.direction==='bridge'?'Career direction: transition into automation':'Related CV direction — review your interest';
    wrap.innerHTML='<div class="daily-explain">'+esc(label)+'</div><button class="daily-dismiss" type="button">Not for me</button>';
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
render=function(options={}){_dailyRender(options);dailyQuotaTop();dailyDecorate()};
const dailyTab=document.querySelector('[data-filter="DAILY"]');
if(dailyTab){document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));dailyTab.classList.add('active');activeFilter='DAILY'}
if(jobs.length)render();
