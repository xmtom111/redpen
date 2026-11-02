/* Browser UI for the RedPen demo. Server mode grades through python redpen.py demo.
   Static mode (GitHub Pages) grades in the page with grade.js. */
(function () {
  const app = document.getElementById("app");
  const note = document.getElementById("mode-note");
  const state = {
    kind: null,
    catalog: null,
    live: false,
    round: null,
    error: "",
    busy: false,
  };

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function remember(id, text) {
    try { sessionStorage.setItem("redpen-demo:" + id, text); } catch (err) { /* private mode */ }
  }

  function recall(id) {
    try { return sessionStorage.getItem("redpen-demo:" + id) || ""; } catch (err) { return ""; }
  }

  async function api(path, body) {
    const response = await fetch(path, body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await response.json(); } catch (err) { data = {}; }
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function typeset() {
    const run = () => {
      if (MathJax.typesetClear) MathJax.typesetClear([app]);
      return MathJax.typesetPromise([app]);
    };
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(run).catch(() => {});
      return;
    }
    if (window.MathJax && MathJax.typesetPromise) {
      run().catch(() => {});
      return;
    }
    if (typeset.waiting) return;
    typeset.waiting = true;
    const timer = setInterval(() => {
      if (window.MathJax && MathJax.typesetPromise) {
        clearInterval(timer);
        typeset.waiting = false;
        typeset();
      }
    }, 250);
    setTimeout(() => { clearInterval(timer); typeset.waiting = false; }, 8000);
  }

  function setNote() {
    if (state.kind === "server") {
      note.textContent = state.live
        ? "Local server. Canned keys stay in this process. Live rounds use the model in your environment."
        : "Local server. The answer key stays in this process until you submit or reveal.";
    } else if (state.kind === "static") {
      note.textContent = "Public demo. The key file loads when you submit, checked against the commitment hash. python redpen.py demo keeps the key on the server.";
    } else {
      note.textContent = "";
    }
  }

  async function boot() {
    const lexicon = await fetch("grade_lexicon.json").then((response) => {
      if (!response.ok) throw new Error("Missing grade lexicon.");
      return response.json();
    });
    RedPenGrade.init(lexicon);
    try {
      const health = await fetch("api/health", { headers: { Accept: "application/json" } });
      const type = health.headers.get("content-type") || "";
      if (health.ok && type.includes("json")) {
        const body = await health.json();
        if (body && body.ok && body.static === false) {
          state.kind = "server";
          state.live = !!body.live;
          state.catalog = await api("api/catalog");
          setNote();
          await restore();
          render();
          return;
        }
      }
    } catch (err) { /* static host, or the server is down */ }
    const catalog = await fetch("catalog.json");
    if (!catalog.ok) {
      app.innerHTML = "<p>Start the demo with <code>python redpen.py demo</code>.</p>";
      return;
    }
    state.kind = "static";
    state.catalog = await catalog.json();
    state.live = false;
    setNote();
    restore();
    render();
  }

  async function restore() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (state.kind === "server" && params.get("r")) {
      try {
        const round = await api("api/rounds/" + params.get("r"));
        adoptServerRound(round);
      } catch (err) {
        state.error = err.message;
      }
      return;
    }
    if (state.kind === "static" && params.get("w")) {
      const entry = (state.catalog.worksheets || []).find((item) => item.id === params.get("w"));
      if (entry) openStatic(entry, params.get("blind") === "1");
    }
  }

  function adoptServerRound(round) {
    round.server = true;
    round.findings = recall(round.id);
    round.hintText = "";
    state.round = round;
  }

  function openStatic(entry, blind) {
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
      .replace(/-/g, "").slice(0, 16);
    state.round = {
      server: false,
      id,
      worksheet_id: entry.id,
      title: entry.title,
      topic: entry.topic,
      problem: entry.problem,
      steps: entry.steps,
      final_answer: entry.final_answer,
      mode: blind ? "blind" : String(entry.level),
      level: blind ? null : entry.level,
      level_name: blind ? null : entry.level_name,
      commitment: entry.commitment,
      commitment_short: entry.commitment_short,
      verified: entry.verified,
      hints_used: 0,
      graded: false,
      live: false,
      banner: state.catalog.banner,
      findings: recall(entry.id + (blind ? ":blind" : "")),
      hintText: "",
      debrief: null,
    };
    location.hash = "w=" + entry.id + (blind ? "&blind=1" : "");
  }

  function render() {
    setNote();
    app.innerHTML = state.round ? roundHtml() : homeHtml();
    bind();
    typeset();
  }

  function homeHtml() {
    const cards = (state.catalog.worksheets || []).map((entry) => `
      <button class="card" type="button" data-id="${esc(entry.id)}">
        <p class="pill">Level ${entry.level} · ${esc(entry.level_name)}</p>
        <h2>${esc(entry.title)}</h2>
        <p>${esc(entry.problem)}</p>
      </button>`).join("");
    const live = state.live ? `
      <section class="live">
        <h2>Live round</h2>
        <p>The model named in your environment writes a new worksheet and grades it. The key stays on the server. This can take a minute.</p>
        <form id="live-form">
          <label>Topic or problem
            <input name="topic" required maxlength="500" placeholder="integration by parts">
          </label>
          <label>Level
            <select name="level">
              <option value="2" selected>2 · Minor</option>
              <option value="0">0 · Clean</option>
              <option value="1">1 · Subtle</option>
              <option value="3">3 · Mixed</option>
              <option value="4">4 · Nonsense</option>
              <option value="blind">blind</option>
            </select>
          </label>
          <button class="btn" type="submit" ${state.busy ? "disabled" : ""}>Write a live round</button>
        </form>
      </section>` : "";
    return `
      <h1>Check the work.</h1>
      <p class="lede">Read a solution that may contain planted mistakes. Name the step, the rule that failed, and a correction. You get a score and a debrief of every error.</p>
      <ul class="rules">
        <li><strong>3</strong> points for each error you find, diagnose, and fix</li>
        <li><strong>−1</strong> for a false alarm</li>
        <li><strong>−0.5</strong> for each hint</li>
      </ul>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      <div class="cards">
        ${cards}
        <button class="blind" type="button" data-blind="1">
          <p class="pill">Blind</p>
          <h2>Hidden level</h2>
          <p class="blurb">A round from levels 0–2. You are not told which, until the debrief.</p>
        </button>
      </div>
      ${live}`;
  }

  function roundHtml() {
    const round = state.round;
    const debrief = round.debrief;
    const blind = round.mode === "blind" && !debrief;
    const level = blind
      ? "Blind round"
      : `Level ${debrief ? debrief.level : round.level} · ${debrief ? debrief.level_name : round.level_name}`;
    const planted = new Set((debrief && debrief.errors || []).map((error) => error.step));
    const steps = round.steps.map((step, index) => {
      const marked = planted.has(index + 1) ? " planted" : "";
      return `<li class="${marked.trim()}"><span>${esc(step)}</span></li>`;
    }).join("");
    const side = debrief ? debriefHtml(debrief) : composerHtml(round);
    return `
      <p><button class="linkish" type="button" data-home="1">All rounds</button></p>
      <p class="pill">${esc(level)}${round.live ? " · live" : ""}</p>
      <h1>${esc(round.title)}</h1>
      <div class="banner">${esc(round.banner || state.catalog.banner || "")}</div>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      <div class="layout">
        <div>
          <div class="problem"><strong>Problem.</strong> ${esc(round.problem)}</div>
          <ol class="steps">${steps}</ol>
          <div class="final"><strong>Final answer.</strong> ${esc(round.final_answer)}</div>
          <p class="meta">commitment ${esc(round.commitment_short || "")}<br>${esc(round.verified || "")}</p>
        </div>
        ${side}
      </div>`;
  }

  function composerHtml(round) {
    const placeholder = "Step 2\nWhat's wrong: the rule or fact that fails\nFix: the corrected step\n\nIf the solution is clean, write: No errors found.";
    return `
      <aside class="panel">
        <h2>Your findings</h2>
        <label class="sr" for="findings">Findings</label>
        <textarea id="findings" placeholder="${esc(placeholder)}">${esc(round.findings || "")}</textarea>
        ${round.hintText ? `<p class="hint" role="status">${esc(round.hintText)}</p>` : ""}
        <div class="actions">
          <button class="btn" type="button" data-act="submit" ${state.busy ? "disabled" : ""}>Submit</button>
          <button class="btn secondary" type="button" data-act="hint" ${state.busy ? "disabled" : ""}>Hint · 0.5</button>
          <button class="btn ghost" type="button" data-act="reveal" ${state.busy ? "disabled" : ""}>Reveal</button>
        </div>
      </aside>`;
  }

  function debriefHtml(debrief) {
    const score = debrief.revealed ? "Revealed" : `${debrief.score}/100`;
    const tone = debrief.revealed ? "" : debrief.score >= 80 ? "good" : debrief.score >= 40 ? "mid" : "low";
    const errors = (debrief.errors || []).map((error) => `
      <article class="debrief-error">
        <h3>Error ${error.index} · step ${error.step} · ${esc(error.category)}
          · <span class="${error.found ? "found" : "missed"}">${error.found ? `Found · diagnosis ${error.diagnosis} · fix ${error.fix}` : "Missed"}</span>
        </h3>
        <dl>
          <dt>Shown</dt><dd>${esc(error.shown)}</dd>
          <dt>Correct</dt><dd>${esc(error.correct)}</dd>
          <dt>Why it's wrong</dt><dd>${esc(error.why_wrong)}</dd>
          <dt>Why it's tempting</dt><dd>${esc(error.why_tempting)}</dd>
          <dt>Catch it next time</dt><dd>${esc(error.catch_rule)}</dd>
          ${error.comment ? `<dt>Grader</dt><dd>${esc(error.comment)}</dd>` : ""}
        </dl>
      </article>`).join("");
    const alarms = (debrief.false_alarm_details || []).map((alarm) =>
      `<li>Step ${esc(alarm.step)}: ${esc(alarm.why_correct || "")}</li>`).join("");
    const practice = (debrief.errors || []).map((error, index) =>
      `<li>${esc(error.practice_problem)}</li>`).join("");
    const practiceAnswers = (debrief.errors || []).map((error) =>
      `<li>${esc(error.practice_answer)}</li>`).join("");
    const clean = (debrief.clean_steps || []).map((step) => `<li>${esc(step)}</li>`).join("");
    const hashLine = debrief.commitment_ok === false
      ? "The revealed key does not match the commitment shown at the start."
      : debrief.commitment_ok
        ? `Key matches commitment ${esc(debrief.commitment_short)}.`
        : "Checking the commitment…";
    const who = debrief.grader === "model"
      ? "Graded by the model."
      : debrief.grader === "reveal"
        ? "Answer key revealed."
        : "Scored by the automatic demo grader.";
    return `
      <aside class="panel" aria-live="polite">
        <p class="score ${tone}">${esc(score)}</p>
        <p class="breakdown">found ${debrief.found}/${debrief.planted} · false alarms ${debrief.false_alarms} · hints ${debrief.hints_used}</p>
        <p class="breakdown">${esc(who)} ${hashLine}</p>
        <p class="coach">${esc(debrief.feedback || "")}</p>
        ${errors || (debrief.planted === 0 ? "<p>This was a <strong>clean round</strong>: nothing was planted.</p>" : "")}
        ${alarms ? `<h2>False alarms</h2><ul>${alarms}</ul>` : ""}
        <div class="clean">
          <h2>Correct solution</h2>
          <ol>${clean}</ol>
          <p><strong>Final answer.</strong> ${esc(debrief.clean_final_answer || "")}</p>
        </div>
        ${practice ? `<h2>Practice</h2><ol>${practice}</ol>
          <details><summary>Practice answers</summary><ol>${practiceAnswers}</ol></details>` : ""}
        ${debrief.next ? `<p class="meta">${esc(debrief.next)}</p>` : ""}
        <div class="actions"><button class="btn" type="button" data-home="1">Another round</button></div>
      </aside>`;
  }

  function bind() {
    app.querySelectorAll("[data-id]").forEach((button) => {
      button.addEventListener("click", () => begin({ worksheet_id: button.dataset.id }));
    });
    app.querySelectorAll("[data-blind]").forEach((button) => {
      button.addEventListener("click", () => begin({ blind: true }));
    });
    app.querySelectorAll("[data-home]").forEach((button) => {
      button.addEventListener("click", () => {
        state.round = null;
        state.error = "";
        location.hash = "";
        render();
      });
    });
    const findings = document.getElementById("findings");
    if (findings) {
      findings.addEventListener("input", () => {
        state.round.findings = findings.value;
        const key = state.round.server
          ? state.round.id
          : state.round.worksheet_id + (state.round.mode === "blind" ? ":blind" : "");
        remember(key, findings.value);
      });
    }
    const submit = app.querySelector("[data-act=submit]");
    if (submit) submit.addEventListener("click", () => submitFindings());
    const hint = app.querySelector("[data-act=hint]");
    if (hint) hint.addEventListener("click", () => takeHint());
    const reveal = app.querySelector("[data-act=reveal]");
    if (reveal) reveal.addEventListener("click", () => revealKey());
    const form = document.getElementById("live-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        startLive(String(data.get("topic") || ""), String(data.get("level") || "2"));
      });
    }
  }

  async function begin(body) {
    state.error = "";
    if (state.kind === "server") {
      state.busy = true;
      render();
      try {
        const round = await api("api/rounds", body);
        adoptServerRound(round);
        location.hash = "r=" + round.id;
      } catch (err) {
        state.error = err.message;
      } finally {
        state.busy = false;
        render();
      }
      return;
    }
    if (body.blind) {
      const pool = (state.catalog.worksheets || []).filter((entry) => entry.level <= 2);
      openStatic(pool[Math.floor(Math.random() * pool.length)], true);
    } else {
      const entry = state.catalog.worksheets.find((item) => item.id === body.worksheet_id);
      openStatic(entry, false);
    }
    render();
  }

  async function startLive(topic, level) {
    state.busy = true;
    state.error = "";
    render();
    try {
      const round = await api("api/live", { topic, level, difficulty: "standard" });
      adoptServerRound(round);
      location.hash = "r=" + round.id;
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  function currentFindings() {
    const box = document.getElementById("findings");
    return box ? box.value : (state.round.findings || "");
  }

  async function submitFindings() {
    const findings = currentFindings();
    const empty = RedPenGrade.parseFindings(findings).clean_claim;
    if (empty && !window.confirm("No findings. Submit anyway, claiming the solution is fully correct?")) return;
    await grade("submit", findings);
  }

  async function revealKey() {
    if (!window.confirm("Reveal the answer key? Every planted error counts as missed.")) return;
    await grade("reveal", "");
  }

  async function grade(action, findings) {
    if (action === "submit") state.round.findings = findings;
    state.busy = true;
    state.error = "";
    render();
    try {
      if (state.round.server) {
        const path = `api/rounds/${state.round.id}/${action}`;
        state.round.debrief = await api(path, action === "submit" ? { findings } : {});
        state.round.graded = true;
      } else if (action === "submit") {
        state.round.debrief = await staticDebrief(findings, false);
        state.round.graded = true;
      } else {
        state.round.debrief = await staticDebrief("", true);
        state.round.graded = true;
      }
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function ensureSecret() {
    if (state.round.secret) return state.round.secret;
    const response = await fetch(`secrets/${state.round.worksheet_id}.json`);
    if (!response.ok) throw new Error("The sealed key for this round is missing.");
    state.round.secret = await response.json();
    return state.round.secret;
  }

  function staticEntry(secret) {
    const card = state.catalog.worksheets.find((item) => item.id === state.round.worksheet_id);
    return {
      id: card.id,
      title: card.title,
      topic: card.topic,
      level: secret.key.level,
      commitment: card.commitment,
      verified: card.verified,
      steps: card.steps,
      final_answer: card.final_answer,
      problem: card.problem,
      key: secret.key,
    };
  }

  async function hashMatches(key, expected) {
    const bytes = new TextEncoder().encode(RedPenGrade.canonicalize(key));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return hex === expected;
  }

  async function staticDebrief(findings, revealed) {
    const secret = await ensureSecret();
    const entry = staticEntry(secret);
    const grade = revealed
      ? RedPenGrade.blankGrade(secret.key.errors.length)
      : RedPenGrade.gradeFindings(entry, findings);
    const debrief = RedPenGrade.buildDebrief(
      entry, state.round.mode, state.round.hints_used, grade, revealed, revealed ? "reveal" : "auto"
    );
    debrief.commitment_ok = await hashMatches(secret.key, entry.commitment);
    return debrief;
  }

  async function takeHint() {
    state.busy = true;
    state.error = "";
    const findings = currentFindings();
    try {
      if (state.round.server) {
        const data = await api(`api/rounds/${state.round.id}/hint`, {});
        state.round.hints_used = data.hints_used;
        state.round.hintText = data.hint;
      } else {
        const secret = await ensureSecret();
        const hints = RedPenGrade.hintLadder(
          state.round.mode, secret.key.level, state.round.steps, secret.key.errors
        );
        if (!hints.length) state.round.hintText = "This round has no hints.";
        else if (state.round.hints_used >= hints.length) state.round.hintText = "No hints left.";
        else {
          state.round.hintText = hints[state.round.hints_used];
          state.round.hints_used += 1;
        }
      }
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      state.round.findings = findings;
      render();
    }
  }

  boot().catch((err) => {
    app.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  });
})();
