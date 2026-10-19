// Optional on-demand Cloudflare AI. No token is persisted or bundled.
(function () {
  let secret = "";
  let inFlight = false;
  let batchRunning = false;
  const endpoint = "https://job-radar-ai.artem-zp-02.workers.dev/analyze";
  const formerOpen = openApplicationAssistant;
  function addControls() {
    const parent = document.querySelector("#v24ReviewSection");
    if (!parent || parent.querySelector("#aiDirectControls")) return;
    const controls = document.createElement("section");
    controls.id = "aiDirectControls";
    controls.className = "v24-review";
    controls.innerHTML = '<h4>Analyze with Cloudflare AI</h4><p class="v24-hint">Job details are sent only when you press Analyze. Short profile, email, phone and PDF are not sent.</p><input id="aiDirectToken" type="password" autocomplete="off" placeholder="ACCESS_TOKEN (session only)"><div class="v24-action-row"><button type="button" id="aiDirectRun">Analyze with AI</button><button type="button" id="aiDirectForget">Forget token</button><button type="button" id="aiUsage">Check quota</button><button type="button" id="aiBatch">Analyze Daily Picks (up to 6)</button></div><p id="aiDirectStatus" role="status" class="v24-status"></p>';
    parent.querySelector("#v24ReviewResult")?.insertAdjacentElement("afterend", controls);
    // Hide the legacy copy/paste workflow behind one optional disclosure.
    // Keep all original elements/listeners intact for no-AI fallback.
    const copy = parent.querySelector("#v24CopyBrief");
    const copyActions = copy?.closest(".v24-action-row");
    const paste = parent.querySelector("#v24PasteReview");
    const pasteLabel = parent.querySelector('label[for="v24PasteReview"]');
    const saveActions = parent.querySelector("#v24SaveReview")?.closest(".v24-action-row");
    if (copyActions && paste && pasteLabel && saveActions) {
      const disclosure = document.createElement("details");
      disclosure.className = "v25-manual-fallback";
      const heading = document.createElement("summary");
      heading.textContent = "Manual analysis with ChatGPT (fallback)";
      disclosure.appendChild(heading);
      const guide = copyActions.previousElementSibling;
      parent.insertBefore(disclosure, guide || copyActions);
      if (guide && guide !== controls && guide !== parent.querySelector("#v24ReviewResult")) {
        disclosure.appendChild(guide);
      }
      for (const node of [copyActions, pasteLabel, paste, saveActions]) {
        disclosure.appendChild(node);
      }
    }
    controls.querySelector("#aiDirectRun").addEventListener("click", analyze);
    controls.querySelector("#aiUsage").addEventListener("click", checkUsage);
    controls.querySelector("#aiBatch").addEventListener("click", batchAnalyze);
    controls.querySelector("#aiDirectForget").addEventListener("click", () => {
      secret = "";
      controls.querySelector("#aiDirectToken").value = "";
      report("Token cleared.");
    });
  }
  function report(message) {
    const node = document.querySelector("#aiDirectStatus");
    if (node) node.textContent = message;
  }

  function takeToken() {
    const el = document.querySelector("#aiDirectToken");
    if (el?.value.trim()) { secret = el.value.trim(); el.value = ""; }
    if (!secret) { report("Enter your ACCESS_TOKEN first."); el?.focus(); return false; }
    return true;
  }
  async function usage() {
    const response = await fetch(endpoint.replace("/analyze","/usage"), {
      headers:{"Authorization":"Bearer "+secret},cache:"no-store"
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error||"Usage unavailable");
    return data;
  }
  async function checkUsage() {
    if (!takeToken()) return;
    try {
      const q = await usage();
      report("AI today: "+q.used+" / "+q.limit+" attempts. "+q.remaining+" remaining. Cloudflare neuron quota is separate.");
    } catch(e) { report("Quota check: "+e.message); }
  }
  async function batchAnalyze() {
    if (batchRunning || inFlight || !takeToken()) return;
    const selected = dailyRecommendations().map(x=>x.job)
      .filter(j=>!aiReviewFor(j)).slice(0,6);
    if (!selected.length) return report("No new Daily Picks need AI review.");
    if (!window.confirm("Analyze up to "+selected.length+" Daily Picks with Cloudflare AI? Each attempt uses the free quota.")) return;
    batchRunning=true;
    const button=document.querySelector("#aiBatch");
    button.disabled=true;
    try {
      let available=0;
      try { available=(await usage()).remaining; } catch(e) { throw Error("Daily quota not confirmed: "+e.message); }
      const list=selected.slice(0,Math.min(available,6));
      if (!list.length) {report("Daily AI limit reached. No requests sent.");return;}
      let done=0;
      for (const job of list) {
        try {
          const brief={};
          for (const key of ["title","company","location","contract","work_mode","seniority","experience_required_years","description","summary_tasks","summary_expectations","required_skills"]) {
            const v=job[key];
            brief[key]=Array.isArray(v)?v.slice(0,7).map(x=>String(x).slice(0,300)):String(v??"").slice(0,key==="description"?2200:300);
          }
          const response=await fetch(endpoint,{method:"POST",
            headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json"},
            body:JSON.stringify({job:brief}),cache:"no-store"});
          const data=await response.json();
          if (!response.ok) {
            if(response.status===429) {report("Daily AI limit reached, stopped batch.");break;}
            throw Error(String(data.error||response.status));
          }
          const review=parseAiReview(JSON.stringify(data));
          const store=aiReviews();store[jobKey(job)]=review;
          localStorage.setItem(AI_REVIEW_KEY,JSON.stringify(store));
          done++;
          report("AI analyzed "+done+" / "+list.length+" Daily Picks…");
        }catch(e){report("Stopped batch: "+e.message);break;}
      }
      render();
      report("Batch finished: "+done+" analyzed. Remaining quota: check with Check quota.");
    } catch(e){report("Batch not started: "+e.message);}
    finally{batchRunning=false;button.disabled=false;}
  }
  async function analyze() {
    if (inFlight) return;
    const job = assistantJob();
    if (!job) return;
    const input = document.querySelector("#aiDirectToken");
    if (input?.value.trim()) {
      secret = input.value.trim();
      input.value = "";
    }
    if (!secret) return report("Enter your private Worker token.");
    if (aiReviewFor(job) && !confirm("Replace existing AI verdict?")) return;
    const keys = ["title","company","location","contract","work_mode","seniority","experience_required_years","description","summary_tasks","summary_expectations","required_skills"];
    const brief = {};
    for (const key of keys) {
      const value = job[key];
      brief[key] = Array.isArray(value) ? value.slice(0, 7).map(x => String(x).slice(0, 300))
        : String(value ?? "").slice(0, key === "description" ? 2200 : 300);
    }
    const button = document.querySelector("#aiDirectRun");
    inFlight = true;
    button.disabled = true;
    report("Analyzing vacancy…");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {"Authorization":"Bearer " + secret,"Content-Type":"application/json"},
        body:JSON.stringify({job:brief}),signal:controller.signal,cache:"no-store"
      });
      const data = await response.json();
      if (!response.ok) throw Error(String(data.error || "HTTP " + response.status));
      const parsed = parseAiReview(JSON.stringify(data));
      // Do not paint or save the result against a different vacancy if the
      // user switched cards while the asynchronous request was in flight.
      const current = assistantJob();
      if (!current || jobKey(current) !== jobKey(job)) {
        report("Analysis finished after switching vacancies; result was not saved.");
        return;
      }
      const store = aiReviews();
      store[jobKey(job)] = parsed;
      localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(store));
      render();
      const result = document.querySelector("#v24ReviewResult");
      if (result) {
        result.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = parsed.verdict + " · AI suggestion";
        result.appendChild(title);
        for (const [label,value] of Object.entries({
          Why:parsed.explanation,Strengths:parsed.strengths.join(" · "),
          Gaps:parsed.gaps.join(" · "),Verify:parsed.verify, "Suggested CV":parsed.suggested_cv
        })) {
          const p = document.createElement("p");p.textContent = label + ": " + value;
          result.appendChild(p);
        }
      }
      report("AI verdict saved locally.");
    } catch (error) {report("AI unavailable: " + (error?.message || "request failed"));}
    finally {clearTimeout(timeout);inFlight=false;button.disabled=false;}
  }
  openApplicationAssistant = function(job) {formerOpen(job);addControls();};
})();
