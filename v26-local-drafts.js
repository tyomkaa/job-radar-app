// Editable, local-only application texts. No AI API calls or PDF uploads.
(function () {
  'use strict';
  const baseTemplates = applicationAnswerTemplates;
  const baseRender = renderApplicationAnswerTemplates;
  function direction(job) {
    const t=String(job?.title||'').toLowerCase();
    if(/automat|workflow|rpa|integracj|integration|python/.test(t))return 'automation';
    if(/network|noc|telecom|sieci|telekom/.test(t))return 'network';
    if(/system|infrastruktu|administrator|aplikacj/.test(t))return 'systems';
    if(/data|analyst|analityk|report|raport|danych/.test(t))return 'data';
    if(/crm|operations|operacj|process|proces/.test(t))return 'operations';
    if(/marketing|seo|content|e-commerce|ecommerce/.test(t))return 'marketing';
    return 'general';
  }
  const topics={
    automation:['automatyzacji procesów i integracji systemów','Python, API i usprawniania powtarzalnych zadań'],
    network:['sieci komputerowych i telekomunikacji','diagnostyki oraz utrzymania infrastruktury sieciowej'],
    systems:['systemów IT i administracji aplikacjami','analizy problemów technicznych'],
    data:['analizy danych i raportowania','SQL oraz przetwarzania danych'],
    operations:['usprawniania procesów biznesowych i CRM','organizacji pracy oraz automatyzacji procesów'],
    marketing:['marketingu cyfrowego i stron internetowych','procesów digital oraz narzędzi webowych'],
    general:['zadań technicznych i usprawniania procesów','rozwiązywania problemów']
  };
  const text=(s,max=170)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,max);
  applicationAnswerTemplates=function(job) {
    const original=baseTemplates(job);
    if(!job)return original;
    const lang=detectVacancyLanguage(job);
    const title=text(job.title,120),company=text(job.company,120);
    const profile=text(getApplicationData()?.short_profile,1000);
    const [area,skills]=topics[direction(job)];
    const facts=profile ? profile.replace(/[.!?]$/,'')+'.' : '';
    const task=text(jobDraftContext(job).tasks[0]||'',120);
    const detail=task ? ' Szczególnie zainteresowały mnie zadania związane z: '+task+'.' : '';
    let options;
    if(lang==='pl'){
      options=[
        {key:'why_role',label:'Dlaczego interesuje Cię ta rola?',value:'Interesuje mnie stanowisko '+title+' w '+company+', ponieważ chcę rozwijać się w obszarze '+area+'.'+detail+' Chętnie poznam bliżej zadania zespołu.'},
        {key:'good_fit',label:'Dlaczego pasujesz do tej roli?',value:facts ? 'Moje doświadczenie: '+facts+' Sądzę, że te kompetencje mogą być przydatne w obszarze '+area+'.' : 'Interesuję się zadaniami z obszaru '+area+'. Chętnie przedstawię konkretne przykłady swoich projektów podczas rozmowy.'},
        {key:'motivation',label:'Krótka motywacja',value:'Chciałbym aplikować na stanowisko '+title+'. Interesuje mnie rozwój w obszarze '+area+'.'+detail+' Chętnie opowiem więcej o swojej motywacji podczas rozmowy.'},
        {key:'cover_note',label:'List motywacyjny',value:'Dzień dobry,\n\nchciałbym zgłosić swoją kandydaturę na stanowisko '+title+' w '+company+'.\n\n'+(facts ? facts+'\n\n' : '')+'Szczególnie interesuje mnie praca w obszarze '+area+'.'+detail+' Chętnie porozmawiam o tym, jak mógłbym wesprzeć zespół.\n\nZ poważaniem'},
        {key:'about_me',label:'Opowiedz o sobie',value:facts ? 'Moje doświadczenie zawodowe i projektowe: '+facts+' Chciałbym dalej rozwijać się w obszarze '+area+'.' : 'Interesuję się rozwojem w obszarze '+area+'. O swoich rzeczywistych umiejętnościach i projektach chętnie opowiem podczas rozmowy.'},
        {key:'career_change',label:'Dlaczego zmieniasz kierunek kariery?',value:'Chcę rozwijać się w obszarze '+area+'. Interesują mnie zwłaszcza zadania związane z '+skills+'. Dotychczasowe doświadczenie traktuję jako punkt wyjścia do dalszej nauki i pracy w tym kierunku.'},
        {key:'expectations_employer',label:'Czego oczekujesz od pracodawcy?',value:'Najważniejsze są dla mnie jasno określone zadania, dobra współpraca w zespole oraz możliwość rozwoju zawodowego w obszarze '+area+'. Doceniam konstruktywny feedback, dostęp do wiedzy i narzędzi potrzebnych do pracy oraz przejrzyste warunki zatrudnienia. Dodatkowe benefity są mile widziane, ale nie są moim głównym kryterium wyboru oferty.'}
      ];
    } else {
      options=[
        {key:'about_me',label:'Tell us about yourself',value:facts ? 'My background: '+facts : 'I am interested in developing my skills in this role. I would be happy to describe my relevant experience during an interview.'},
        {key:'career_change',label:'Why move into this role?',value:'I would like to continue developing practical skills relevant to this role and contribute using experience I can demonstrate.'},
        {key:'expectations_employer',label:'What do you expect from us?',value:'I value clear responsibilities, supportive teamwork, opportunities to learn, constructive feedback and transparent employment conditions. Useful tools and professional development matter more to me than individual perks.'}
      ];
    }
    const keys=new Set(options.map(x=>x.key));
    return [...options.map(x=>({...x,kind:'generated',lang})),...original.filter(x=>!keys.has(x.key))];
  };
  renderApplicationAnswerTemplates=function(){
    baseRender();
    const host=document.querySelector('#assistantAnswerTemplates');
    const job=assistantJob();
    if(!host||!job)return;
    host.querySelectorAll('[data-template-key]').forEach(card=>{
      const original=card.querySelector('p');
      if(!original)return;
      const item=applicationAnswerTemplates(job).find(x=>x.key===card.dataset.templateKey);
      if(!item)return;
      const editor=document.createElement('textarea');
      editor.className='local-template-editor';
      editor.rows=item.value.includes('\n')?8:5;
      editor.value=item.value;
      original.replaceWith(editor);
      const button=card.querySelector('[data-copy-template]');
      if(button){
        const replacement=button.cloneNode(true);
        button.replaceWith(replacement);
        replacement.addEventListener('click',()=>copyText(editor.value,replacement));
      }
    });
  };
  if(!document.querySelector('#applicationAssistant')?.hidden)renderApplicationAnswerTemplates();
})();
