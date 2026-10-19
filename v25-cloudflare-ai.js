// Optional on-demand Cloudflare AI. No token is persisted or bundled.
(function () {
  let secret = "";
  let inFlight = false;
  const endpoint = "https://job-radar-ai.artem-zp-02.workers.dev/analyze";
  const formerOpen = openApplicationAssistant;
  function addControls() {
    const parent = document.querySelector("#v24ReviewSection");
    if (!parent || parent.querySelector("#aiDirectControls")) return;
    const controls = document.createElement("section");
    controls.id = "aiDirectControls";
    controls.className = "v24-review";
    controls.innerHTML = '<h4>Analyze with Cloudflare AI</h4><p class="v24-hint">Job details are sent only when you press Analyze. Short profile, email, phone and PDF are not sent.</p><input id="aiDirectToken" type="password" autocomplete="off" placeholder="ACCESS_TOKEN (session only)"><div class="v24-action-row"><button type="button" id="aiDirectRun">Analyze with AI</button><button type="button" id="aiDirectForget">Forget token</button></div><p id="aiDirectStatus" role="status" class="v24-status"></p>';
    parent.querySelector("#v24ReviewResult")?.insertAdjacentElement("afterend", controls);
    controls.querySelector("#aiDirectRun").addEventListener("click", analyze);
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
