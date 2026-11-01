// v0.17: recently discovered, technically relevant vacancies.
// Server owns selection. This UI only hides locally applied/dismissed/AI SKIP.
(function () {
  'use strict';
  function freshOpportunityJobs() {
    const ids=Array.isArray(meta?.fresh_opportunity_ids) ? meta.fresh_opportunity_ids : [];
    const byId=new Map(jobs.map(j=>[String(j.id),j]));
    const tracker=getTracker();
    const feedback=typeof dailyFeedback==='function'?dailyFeedback():{};
    return ids.map(id=>byId.get(String(id))).filter(j=>
      j&&!tracker[jobKey(j)]&&!feedback[jobKey(j)]&&
      (typeof aiReviewFor!=='function'||aiReviewFor(j)?.verdict!=='SKIP'));
  }
  const priorVisible=getVisibleJobs;
  getVisibleJobs=function(pinnedId=''){
    if(activeFilter!=='FRESH')return priorVisible(pinnedId);
    const result=freshOpportunityJobs();
    if(pinnedId) {
      const pinned=jobs.find(j=>String(j.id)===String(pinnedId));
      if(pinned&&!result.includes(pinned)&&
        (meta?.fresh_opportunity_ids||[]).map(String).includes(String(pinned.id)))
          result.unshift(pinned);
    }
    return result;
  };

  function renderFreshExplainer() {
    let host=document.querySelector('#freshOpportunitiesBrief');
    if(!host){
      host=document.createElement('section');
      host.id='freshOpportunitiesBrief';
      host.className='fresh-opportunities-brief';
      document.querySelector('#dailyBrief')?.insertAdjacentElement('afterend',host);
    }
    if(!host)return;
    host.hidden=activeFilter!=='FRESH';
    if(host.hidden)return;

    const count=Array.isArray(meta?.fresh_opportunity_ids)?meta.fresh_opportunity_ids.length:0;
    const visible=freshOpportunityJobs();
    const reviewed=visible.filter(j=>!!(typeof aiReviewFor==='function'&&aiReviewFor(j))).length;
    host.replaceChildren();
    const h=document.createElement('h2');
    h.textContent=visible.length+' new possibilities to review';
    const p=document.createElement('p');
    p.textContent='Job Radar first found '+count+' technically related vacancies within the last 2 days. '+
      'They passed the Focus checks but may require verification of contract, location, '+
      'on-site onboarding, experience or a different technical stack. '+
      Math.max(0,count-visible.length)+' already handled or no longer eligible on this device.';
    const s=document.createElement('small');
    s.textContent=reviewed+' shown with saved AI verdicts. AI CHECK is not a guarantee; '+
      'jobs in this list are not necessarily new postings by the employer.';
    host.append(h,p,s);
  }
  const priorRender=render;
  render=function(options={}){
    priorRender(options);
    const tab=document.querySelector('[data-filter="FRESH"]');
    if(tab){
      const count=freshOpportunityJobs().length;
      tab.textContent='New matches'+(count?' '+count:'');
    }
    renderFreshExplainer();
  };
  if(jobs.length)render();
})();
