/* Browser UI for the RedPen demo. Server mode grades through python redpen.py demo.
   Static mode (GitHub Pages) grades in the page with grade.js.
   The page language comes from <html lang>: en at /, zh-Hans at /zh/. */
(function () {
  const app = document.getElementById("app");
  const note = document.getElementById("mode-note");
  const locale = (document.documentElement.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  const UI = {
    en: {
      homeTitle: "Practice math. Spot AI mistakes.",
      lede: "Read a solution that may contain planted mistakes. Name the step, the rule that failed, and a correction. You get a score and a debrief of every error.",
      rules: [
        "<strong>3</strong> points for each error you find, diagnose, and fix",
        "<strong>−1</strong> for a false alarm",
        "<strong>−0.5</strong> for each hint",
      ],
      levelPill: (n, name) => `Level ${n} · ${name}`,
      blindPill: "Blind",
      blindTitle: "Hidden level",
      blindBlurb: "A round from levels 0–2. You are not told which, until the debrief.",
      liveTitle: "Live round",
      liveBody: "Choose AI model settings and add your key to generate and grade custom practice. Built-in rounds below need no key.",
      topicLabel: "Topic or problem",
      topicPlaceholder: "integration by parts",
      levelLabel: "Level",
      levels: [
        ["2", "2 · Minor", true],
        ["0", "0 · Clean", false],
        ["1", "1 · Subtle", false],
        ["3", "3 · Mixed", false],
        ["4", "4 · Nonsense", false],
        ["blind", "blind", false],
      ],
      liveButton: "Write a live round",
      allRounds: "All rounds",
      blindRound: "Blind round",
      liveSuffix: " · live",
      problem: "Problem.",
      finalAnswer: "Final answer.",
      commitment: (short) => `commitment ${short}`,
      findingsTitle: "Your findings",
      findingsLabel: "Findings",
      placeholder: "Step 2\nWhat's wrong: the rule or fact that fails\nFix: the corrected step\n\nIf the solution is clean, write: No errors found.",
      submit: "Submit",
      hintBtn: "Hint · 0.5",
      reveal: "Reveal",
      revealed: "Revealed",
      foundLine: (found, planted, alarms, hints) => `found ${found}/${planted} · false alarms ${alarms} · hints ${hints}`,
      hashBad: "The revealed key does not match the commitment shown at the start.",
      hashOk: (short) => `Key matches commitment ${short}.`,
      hashWait: "Checking the commitment…",
      whoModel: "Graded by the model.",
      whoReveal: "Answer key revealed.",
      whoAuto: "Scored by the automatic demo grader.",
      errorHeading: (index, step, category) => `Error ${index} · step ${step} · ${category}`,
      foundDetail: (diagnosis, fix) => `Found · diagnosis ${diagnosis} · fix ${fix}`,
      missed: "Missed",
      shown: "Shown",
      correct: "Correct",
      whyWrong: "Why it's wrong",
      whyTempting: "Why it's tempting",
      catch: "Catch it next time",
      grader: "Grader",
      falseAlarms: "False alarms",
      alarmItem: (step, why) => `Step ${step}: ${why}`,
      cleanRound: "This was a <strong>clean round</strong>: nothing was planted.",
      cleanTitle: "Correct solution",
      practice: "Practice",
      practiceAnswers: "Practice answers",
      another: "Another round",
      confirmEmpty: "No findings. Submit anyway, claiming the solution is fully correct?",
      confirmReveal: "Reveal the answer key? Every planted error counts as missed.",
      noHints: "This round has no hints.",
      noHintsLeft: "No hints left.",
      missingKey: "The sealed key for this round is missing.",
      missingLexicon: "Missing grade lexicon.",
      requestFailed: "Request failed.",
      startDemo: "Start the demo with <code>python redpen.py demo</code>.",
      noteServerLive: "Local server. Canned keys stay in this process. Live rounds use the model in your environment.",
      noteServer: "Local server. The answer key stays in this process until you submit or reveal.",
      noteStatic: "Practice runs in this browser. Answer keys are checked against their commitment hashes; browser keys are accessible in developer tools.",
      categories: {},
    },
    zh: {
      homeTitle: "练扎实的数学，看穿 AI 错误。",
      lede: "阅读一份可能埋有错误的解答。指出步骤、失效的规则，并给出改正。你会得到分数，以及每一处错误的复盘。",
      rules: [
        "每找出、诊断并改正一处错误，得 <strong>3</strong> 分",
        "一次误报扣 <strong>1</strong> 分",
        "每用一次提示扣 <strong>0.5</strong> 分",
      ],
      levelPill: (n, name) => `级别 ${n} · ${name}`,
      blindPill: "盲测",
      blindTitle: "隐藏级别",
      blindBlurb: "从级别 0–2 中抽一份解答。在复盘之前，不会告诉你是哪一级。",
      liveTitle: "现场出题",
      liveBody: "在 AI 模型设置中填入自己的 Key，即可自定义出题和智能判分。内置题目无需 Key。",
      topicLabel: "题目或知识点",
      topicPlaceholder: "分部积分",
      levelLabel: "级别",
      levels: [
        ["2", "2 · 轻微", true],
        ["0", "0 · 无错", false],
        ["1", "1 · 隐蔽", false],
        ["3", "3 · 混杂", false],
        ["4", "4 · 胡来", false],
        ["blind", "盲测", false],
      ],
      liveButton: "出一份现场题",
      allRounds: "全部题目",
      blindRound: "盲测",
      liveSuffix: " · 现场",
      problem: "题目。",
      finalAnswer: "最终答案。",
      commitment: (short) => `承诺 ${short}`,
      findingsTitle: "你的发现",
      findingsLabel: "发现",
      placeholder: "步骤 2\n错误：失效的规则或事实\n改正：改正后的步骤\n\n如果解答是对的，写：未发现错误。",
      submit: "提交",
      hintBtn: "提示 · 0.5",
      reveal: "揭晓",
      revealed: "已揭晓",
      foundLine: (found, planted, alarms, hints) => `找到 ${found}/${planted} · 误报 ${alarms} · 提示 ${hints}`,
      hashBad: "揭晓的钥匙与开始时展示的承诺不一致。",
      hashOk: (short) => `钥匙与承诺 ${short} 一致。`,
      hashWait: "正在核对承诺…",
      whoModel: "由模型评分。",
      whoReveal: "答案钥匙已揭晓。",
      whoAuto: "由演示用的自动评分器计分。",
      errorHeading: (index, step, category) => `错误 ${index} · 步骤 ${step} · ${category}`,
      foundDetail: (diagnosis, fix) => `找到 · 诊断 ${diagnosis} · 改正 ${fix}`,
      missed: "未找到",
      shown: "原文",
      correct: "正确步骤",
      whyWrong: "错在哪里",
      whyTempting: "为什么容易写错",
      catch: "下次如何抓住",
      grader: "评语",
      falseAlarms: "误报",
      alarmItem: (step, why) => `步骤 ${step}：${why}`,
      cleanRound: "这是一轮<strong>无错</strong>解答：没有埋入任何错误。",
      cleanTitle: "正确解答",
      practice: "练习",
      practiceAnswers: "练习答案",
      another: "再来一轮",
      confirmEmpty: "没有写下发现。仍要提交，并认定这份解答完全正确吗？",
      confirmReveal: "揭晓答案钥匙？每一处埋入的错误都会计为未找到。",
      noHints: "这一轮没有提示。",
      noHintsLeft: "没有更多提示了。",
      missingKey: "这一轮的密封答案钥匙缺失。",
      missingLexicon: "缺少评分词表。",
      requestFailed: "请求失败。",
      startDemo: "请用 <code>python redpen.py demo</code> 启动演示。",
      noteServerLive: "本地服务器。内置题目的答案钥匙留在这个进程里。现场出题使用你环境中的模型。",
      noteServer: "本地服务器。在你提交或揭晓之前，答案钥匙留在这个进程里。",
      noteStatic: "练习在浏览器中完成，答案钥匙与承诺哈希核对。浏览器钥匙可通过开发者工具查看。",
      categories: {
        "division-by-zero": "除以零",
        differentiation: "求导",
        distribution: "错误展开",
        "exponent-log": "对数运算",
        domain: "定义域",
        integration: "积分换元",
        sign: "符号",
        arithmetic: "算术",
        cancellation: "约分",
        "extraneous-root": "增根",
        inequality: "不等式",
        limit: "极限",
        hypothesis: "定理条件",
        "case-missing": "漏掉情形",
        quantifier: "量词",
        series: "级数", matrix: "矩阵", probability: "概率", counting: "计数", converse: "逆命题",
        circular: "循环论证", induction: "归纳法", units: "单位", misread: "误读题意",
        "wrong-method": "方法不适用", "invented-rule": "虚构规则",
      },
    },
  };
  const text = UI[locale];
  const state = {
    locale,
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

  function pageDir() {
    const path = location.pathname || "/";
    return path.endsWith("/") ? path : path.slice(0, path.lastIndexOf("/") + 1);
  }

  function siteRoot() {
    const dir = pageDir();
    return dir.endsWith("/zh/") ? dir.slice(0, -"zh/".length) : dir;
  }

  function apiPath(path) {
    return siteRoot() + String(path).replace(/^\//, "");
  }

  function lexiconUrls() {
    const dir = pageDir();
    const urls = [dir + "grade_lexicon.json"];
    const root = siteRoot();
    if (root !== dir) urls.push(root + "grade_lexicon.json");
    return urls;
  }

  async function loadLexicon() {
    for (const url of lexiconUrls()) {
      const response = await fetch(url);
      if (response.ok) return response.json();
    }
    throw new Error(text.missingLexicon);
  }

  function categoryLabel(id) {
    return text.categories[id] || id;
  }

  function remember(id, value) {
    try { sessionStorage.setItem("redpen-demo:" + locale + ":" + id, value); } catch (err) { /* private mode */ }
  }

  function recall(id) {
    try { return sessionStorage.getItem("redpen-demo:" + locale + ":" + id) || ""; } catch (err) { return ""; }
  }

  async function api(path, body) {
    const response = await fetch(path, body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await response.json(); } catch (err) { data = {}; }
    if (!response.ok) throw new Error(data.error || text.requestFailed);
    return data;
  }

  function typeset(target = app) {
    const run = () => {
      if (MathJax.typesetClear) MathJax.typesetClear([target]);
      return MathJax.typesetPromise([target]);
    };
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      typeset.queue = (typeset.queue || MathJax.startup.promise).then(run).catch(() => {});
      return;
    }
    if (window.MathJax && MathJax.typesetPromise) {
      typeset.queue = (typeset.queue || Promise.resolve()).then(run).catch(() => {});
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
      note.textContent = state.live ? text.noteServerLive : text.noteServer;
    } else if (state.kind === "static") {
      note.textContent = text.noteStatic;
    } else {
      note.textContent = "";
    }
  }

  async function boot() {
    const lexicon = await loadLexicon();
    RedPenGrade.init(lexicon);
    try {
      const health = await fetch(apiPath("api/health"), { headers: { Accept: "application/json" } });
      const type = health.headers.get("content-type") || "";
      if (health.ok && type.includes("json")) {
        const body = await health.json();
        if (body && body.ok && body.static === false) {
          state.kind = "server";
          state.live = !!body.live;
          const catalogPath = locale === "zh" ? apiPath("api/catalog?lang=zh") : apiPath("api/catalog");
          state.catalog = await api(catalogPath);
          setNote();
          await restore();
          render();
          return;
        }
      }
    } catch (err) { /* static host, or the server is down */ }
    const catalog = await fetch("catalog.json");
    if (!catalog.ok) {
      app.innerHTML = `<p>${text.startDemo}</p>`;
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
    try {
      const stored = JSON.parse(sessionStorage.getItem('redpen:active:' + locale) || 'null');
      if (stored && !stored.server && ((stored.browserLive && !location.hash) || (stored.worksheet_id === params.get('w') && (stored.mode === 'blind') === (params.get('blind') === '1')))) {
        state.round = stored;
        return;
      }
    } catch (_) { /* invalid or unavailable tab storage */ }
    if (state.kind === "server" && params.get("r")) {
      try {
        const round = await api(apiPath("api/rounds/" + params.get("r")));
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
      lang: entry.lang || locale,
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
    if (state.round && !state.round.server) {
      try { sessionStorage.setItem('redpen:active:' + locale, JSON.stringify(state.round)); } catch (_) { /* storage unavailable */ }
    }
    setNote();
    app.innerHTML = state.round ? roundHtml() : homeHtml();
    bind();
    typeset();
  }

  function homeHtml() {
    const cards = (state.catalog.worksheets || []).map((entry) => `
      <button class="card" type="button" data-id="${esc(entry.id)}">
        <p class="pill">${esc(text.levelPill(entry.level, entry.level_name))}</p>
        <h2>${esc(entry.title)}</h2>
        <p>${esc(entry.problem)}</p>
      </button>`).join("");
    const options = text.levels.map(([value, label, selected]) =>
      `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`).join("");
    const live = `
      <section class="live">
        <h2>${esc(text.liveTitle)}</h2>
        <p>${esc(text.liveBody)}</p>
        <form id="live-form">
          <label>${locale === 'zh' ? '上传题目文本（可选）' : 'Upload problem text (optional)'}<input id="problem-file" type="file" accept=".txt,.md,text/plain,text/markdown"></label>
          <label>${locale === 'zh' ? '教材标准答案（可选）' : 'Reference answer (optional)'}<textarea name="answer" maxlength="4000"></textarea></label>
          <label>${locale === 'zh' ? '难度' : 'Difficulty'}<select name="difficulty"><option value="intro">${locale === 'zh' ? '入门' : 'Intro'}</option><option value="standard" selected>${locale === 'zh' ? '标准' : 'Standard'}</option><option value="advanced">${locale === 'zh' ? '进阶' : 'Advanced'}</option><option value="competition">${locale === 'zh' ? '竞赛' : 'Competition'}</option></select></label>
          <details class="focus-options"><summary>${locale === 'zh' ? '选择错误侧重点（可选；不选则参考薄弱项）' : 'Choose focus categories (optional; defaults to weak spots)'}</summary>
          <div class="focus-grid">${['arithmetic','sign','distribution','cancellation','exponent-log','division-by-zero','extraneous-root','domain','inequality','differentiation','integration','limit','series','matrix','probability','counting','hypothesis','quantifier','converse','circular','induction','case-missing','units','misread','wrong-method','invented-rule'].map(id => `<label><input type="checkbox" name="focus" value="${id}">${esc(categoryLabel(id))}</label>`).join('')}</div></details>
          <label>${esc(text.topicLabel)}
            <input name="topic" required maxlength="4000" placeholder="${esc(text.topicPlaceholder)}">
          </label>
          <label>${esc(text.levelLabel)}
            <select name="level">
              ${options}
            </select>
          </label>
          <button class="btn" type="submit" ${state.busy ? "disabled" : ""}>${esc(text.liveButton)}</button>
        </form>
      </section>`;
    const rules = text.rules.map((rule) => `<li>${rule}</li>`).join("");
    return `
      <button class="btn secondary" id="ai-settings">${locale === "zh" ? "AI 模型设置" : "AI model settings"}</button>
      <h1>${esc(text.homeTitle)}</h1>
      <p class="lede">${esc(text.lede)}</p>
      <ul class="rules">
        ${rules}
      </ul>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      <div class="cards">
        ${cards}
        <button class="blind" type="button" data-blind="1">
          <p class="pill">${esc(text.blindPill)}</p>
          <h2>${esc(text.blindTitle)}</h2>
          <p class="blurb">${esc(text.blindBlurb)}</p>
        </button>
      </div>
      ${live}
      ${statsHtml()}`;
  }

  function roundHtml() {
    const round = state.round;
    const debrief = round.debrief;
    const blind = round.mode === "blind" && !debrief;
    const level = blind
      ? text.blindRound
      : text.levelPill(debrief ? debrief.level : round.level, debrief ? debrief.level_name : round.level_name);
    const planted = new Set((debrief && debrief.errors || []).map((error) => error.step));
    const steps = round.steps.map((step, index) => {
      const marked = planted.has(index + 1) ? " planted" : "";
      return `<li class="${marked.trim()}"><span>${esc(step)}</span></li>`;
    }).join("");
    const side = debrief ? debriefHtml(debrief) : composerHtml(round);
    return `
      <p><button class="linkish" type="button" data-home="1" ${state.busy ? "disabled" : ""}>${esc(text.allRounds)}</button> · <button class="linkish" id="ai-settings">${locale === "zh" ? "AI 模型设置" : "AI model settings"}</button></p>
      <button class="btn secondary" data-act="verify" ${state.busy ? "disabled" : ""}>${locale === 'zh' ? '校验答案承诺' : 'Verify commitment'}</button>
      ${round.verifyText ? `<p role="status">${esc(round.verifyText)}</p>` : ''}
      <p class="pill">${esc(level)}${round.live ? esc(text.liveSuffix) : ""}</p>
      <h1>${esc(round.title)}</h1>
      <div class="banner">${esc(round.banner || state.catalog.banner || "")}</div>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      <div class="layout">
        <div>
          <div class="problem"><strong>${esc(text.problem)}</strong> ${esc(round.problem)}</div>
          <ol class="steps">${steps}</ol>
          <div class="final"><strong>${esc(text.finalAnswer)}</strong> ${esc(round.final_answer)}</div>
          <p class="meta">${esc(text.commitment(round.commitment_short || ""))}<br>${esc(round.verified || "")}</p>
        </div>
        ${side}
      </div>`;
  }

  function composerHtml(round) {
    return `
      <aside class="panel">
        <h2>${esc(text.findingsTitle)}</h2>
        <p>${locale === 'zh' ? '定位、诊断、修正各 1 分。误报扣 1 分；提示每次扣 0.5 分。请解释违反的规则，不要只说答案错了。' : 'Locate, diagnose, and correct: 1 point each. False alarm: −1; hint: −0.5. Explain the violated rule, not just a wrong answer.'}</p>
        ${findingRows(round)}
        <button class="btn secondary" id="add-finding">${locale === 'zh' ? '再添加一处' : 'Add finding'}</button>
        <p>${locale === 'zh' ? '点入输入框，再插入数学符号；可使用 $…$ 包围公式。' : 'Focus an input, then insert math. Wrap formulas in $…$.'}</p>
        <div class="symbols">${[['分数 / fraction','\\frac{a}{b}'],['√','\\sqrt{x}'],['x²','x^{2}'],['x₁','x_{1}'],['d/dx','\\frac{d}{dx}'],['∫','\\int_{a}^{b}'],['α','\\alpha'],['θ','\\theta'],['π','\\pi']].map(([label,value]) => `<button type="button" data-symbol="${esc(value)}">${esc(label)}</button>`).join('')}</div>
        <div id="math-preview" aria-live="polite"></div>
        <textarea id="findings" hidden>${esc(round.findings || '')}</textarea>
        ${round.hintText ? `<p class="hint" role="status">${esc(round.hintText)}</p>` : ""}
        <div class="actions">
          <button class="btn" type="button" data-act="submit" ${state.busy ? "disabled" : ""}>${esc(text.submit)}</button>
          <button class="btn secondary" type="button" data-act="hint" ${state.busy ? "disabled" : ""}>${esc(text.hintBtn)}</button>
          <button class="btn ghost" type="button" data-act="reveal" ${state.busy ? "disabled" : ""}>${esc(text.reveal)}</button>
        </div>
      </aside>`;
  }

  function findingRows(round) {
    if (!round.rows) {
      const parsed = RedPenGrade.parseFindings(round.findings || '');
      round.rows = parsed.items.length ? parsed.items.map(r => ({step:String(r.step || 1),wrong:r.wrong,fix:r.fix})) : [{step:'',wrong:'',fix:''}];
    }
    return round.rows.map((row,i) => `<fieldset class="finding-row" data-row="${i}"><legend>${locale === 'zh' ? '发现' : 'Finding'} ${i+1}</legend>
      <label>${locale === 'zh' ? '步骤（定位）' : 'Step (locate)'}<select data-field="step"><option value="">${locale === 'zh' ? '请选择' : 'Choose a step'}</option><option value="clean" ${row.step === 'clean' ? 'selected' : ''}>${locale === 'zh' ? '本题无错' : 'No errors found'}</option>${round.steps.map((_,n) => `<option value="${n+1}" ${String(row.step) === String(n+1) ? 'selected' : ''}>${locale === 'zh' ? '第 '+(n+1)+' 步' : 'Step '+(n+1)}</option>`).join('')}</select></label>
      <label>${locale === 'zh' ? '哪里错了（诊断）' : "What's wrong (diagnosis)"}<textarea data-field="wrong" ${row.step === 'clean' ? 'disabled' : ''} placeholder="${locale === 'zh' ? '说明哪条规则不成立，为什么。' : 'Which rule fails, and why?'}">${esc(row.wrong)}</textarea></label>
      <label>${locale === 'zh' ? '正确写法（修正）' : 'Correct version (fix)'}<textarea data-field="fix" ${row.step === 'clean' ? 'disabled' : ''} placeholder="${locale === 'zh' ? '写出改正后的步骤或结果。' : 'Write the corrected step or result.'}">${esc(row.fix)}</textarea></label>
      <button type="button" data-remove="${i}">${locale === 'zh' ? '删除' : 'Remove'}</button></fieldset>`).join('');
  }
  function syncRows() {
    const r = state.round;
    const active = r.rows.filter(row => row.step);
    r.findings = active.map(row => row.step === 'clean' ? 'No errors found.' : `Step ${row.step}\nWhat's wrong: ${row.wrong}\nFix: ${row.fix}`).join('\n\n');
    const hidden = document.getElementById('findings');
    if (hidden) hidden.value = r.findings;
    if (!r.server) { try { sessionStorage.setItem('redpen:active:' + locale, JSON.stringify(r)); } catch (_) {} }
    remember(r.server ? r.id : r.worksheet_id + (r.mode === 'blind' ? ':blind' : ''),r.findings);
    const preview = document.getElementById('math-preview');
    if (preview) {
      preview.textContent = active.map(row => row.wrong + '\n' + row.fix).join('\n');
      typeset(preview);
    }
  }

  function debriefHtml(debrief) {
    const score = debrief.revealed ? text.revealed : `${debrief.score}/100`;
    const tone = debrief.revealed ? "" : debrief.score >= 80 ? "good" : debrief.score >= 40 ? "mid" : "low";
    const errors = (debrief.errors || []).map((error) => `
      <article class="debrief-error">
        <h3>${esc(text.errorHeading(error.index, error.step, categoryLabel(error.category)))}
          · <span class="${error.found ? "found" : "missed"}">${error.found ? esc(text.foundDetail(error.diagnosis, error.fix)) : esc(text.missed)}</span>
        </h3>
        <dl>
          <dt>${esc(text.shown)}</dt><dd>${esc(error.shown)}</dd>
          <dt>${esc(text.correct)}</dt><dd>${esc(error.correct)}</dd>
          <dt>${esc(text.whyWrong)}</dt><dd>${esc(error.why_wrong)}</dd>
          <dt>${esc(text.whyTempting)}</dt><dd>${esc(error.why_tempting)}</dd>
          <dt>${esc(text.catch)}</dt><dd>${esc(error.catch_rule)}</dd>
          ${error.comment ? `<dt>${esc(text.grader)}</dt><dd>${esc(error.comment)}</dd>` : ""}
        </dl>
      </article>`).join("");
    const bounties = (debrief.bounty_details || []).map(b => `<li>${esc(text.alarmItem(b.step, b.description || ''))}</li>`).join('');
    const alarms = (debrief.false_alarm_details || []).map((alarm) =>
      `<li>${esc(text.alarmItem(alarm.step, alarm.why_correct || ""))}</li>`).join("");
    const practice = (debrief.errors || []).map((error) =>
      `<li>${esc(error.practice_problem)}</li>`).join("");
    const practiceAnswers = (debrief.errors || []).map((error) =>
      `<li>${esc(error.practice_answer)}</li>`).join("");
    const clean = (debrief.clean_steps || []).map((step) => `<li>${esc(step)}</li>`).join("");
    const hashLine = debrief.commitment_ok === false
      ? text.hashBad
      : debrief.commitment_ok
        ? text.hashOk(debrief.commitment_short)
        : text.hashWait;
    const who = debrief.grader === "model"
      ? text.whoModel
      : debrief.grader === "reveal"
        ? text.whoReveal
        : text.whoAuto;
    return `
      <aside class="panel" aria-live="polite">
        <p class="score ${tone}">${esc(score)}</p>
        <p class="breakdown">${esc(text.foundLine(debrief.found, debrief.planted, debrief.false_alarms, debrief.hints_used))}</p>
        <p class="breakdown">${esc(who)} ${esc(hashLine)}</p>
        <p class="coach">${esc(debrief.feedback || "")}</p>
        ${errors || (debrief.planted === 0 ? `<p>${text.cleanRound}</p>` : "")}
        ${bounties ? `<h2>${locale === 'zh' ? '额外发现（未预设的真实错误）' : 'Bounties (genuine unplanted errors)'}</h2><ul>${bounties}</ul>` : ''}
        ${debrief.reference_check && debrief.reference_check !== 'none' ? `<p>${locale === 'zh' ? '参考答案核对' : 'Reference answer check'}: ${esc(debrief.reference_check)}</p>` : ''}
        ${alarms ? `<h2>${esc(text.falseAlarms)}</h2><ul>${alarms}</ul>` : ""}
        <div class="clean">
          <h2>${esc(text.cleanTitle)}</h2>
          <ol>${clean}</ol>
          <p><strong>${esc(text.finalAnswer)}</strong> ${esc(debrief.clean_final_answer || "")}</p>
        </div>
        ${practice ? `<h2>${esc(text.practice)}</h2><ol>${practice}</ol>
          <details><summary>${esc(text.practiceAnswers)}</summary><ol>${practiceAnswers}</ol></details>` : ""}

        <button class="btn secondary" data-act="ai" ${state.busy ? 'disabled' : ''}>${locale === 'zh' ? '让 AI 同台找错并对比' : 'Compare with AI hunter'}</button>
        ${state.round.ai ? `<p>${locale === 'zh' ? 'AI 得分' : 'AI score'}: ${esc(state.round.ai.debrief.score)}/100 · ${locale === 'zh' ? '你的得分' : 'Your score'}: ${esc(debrief.score)}/100</p><pre>${esc(state.round.ai.findings)}</pre>` : ''}
        <div class="actions"><button class="btn" type="button" data-home="1">${esc(text.another)}</button></div>
      </aside>`;
  }

  function bind() {
    let target = null;
    app.querySelectorAll('[data-row]').forEach(el => {
      el.querySelectorAll('[data-field]').forEach(input => {
        input.onfocus = () => { if(input.tagName === 'TEXTAREA') target = input; };
        input.oninput = () => {
          state.round.rows[Number(el.dataset.row)][input.dataset.field] = input.value;
          if (input.dataset.field === 'step') {
            el.querySelectorAll('textarea').forEach(t => t.disabled = input.value === 'clean');
          }
          syncRows();
        };
      });
    });
    app.querySelectorAll('[data-symbol]').forEach(b => b.onclick = () => {
      if (!target || target.disabled) target = app.querySelector('[data-field=fix]:not(:disabled)');
      if (!target) return;
      const symbol = '$' + b.dataset.symbol + '$';
      target.setRangeText(symbol,target.selectionStart,target.selectionEnd,'end');
      target.dispatchEvent(new Event('input')); target.focus();
    });
    app.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
      state.round.rows.splice(Number(b.dataset.remove),1); syncRows(); render();
    });
    const add = document.getElementById('add-finding');
    if (add) add.onclick = () => { state.round.rows.push({step:'',wrong:'',fix:''}); render(); };

    const settings = document.getElementById('ai-settings');
    if (settings) settings.onclick = showSettings;
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
        try { sessionStorage.removeItem('redpen:active:' + locale); } catch (_) { /* private mode */ }
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
    const file = document.getElementById('problem-file');
    if (file) file.onchange = async () => {
      if (file.files[0]) {
        if (file.files[0].size > 16000) { state.error = locale === 'zh' ? '文件过大，最多 16KB' : 'File too large; maximum 16KB'; render(); return; }
        const uploaded = await file.files[0].text();
        if (uploaded.length > 4000) { state.error = locale === 'zh' ? '题目最多 4000 字符，请缩短后重试。' : 'Problem text exceeds 4000 characters; shorten it and retry.'; render(); return; }
        document.querySelector('[name=topic]').value = uploaded;
      }
    };
    const verify = app.querySelector('[data-act=verify]');
    if (verify) verify.onclick = verifyRound;
    const ai = app.querySelector('[data-act=ai]');
    if (ai) ai.onclick = compareAI;
    const form = document.getElementById("live-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const selectedFocus = data.getAll('focus').map(String);
        const focus = selectedFocus.length ? selectedFocus : weakSpots();
        startLive(String(data.get("topic") || ""), String(data.get("level") || "2"), {difficulty:String(data.get('difficulty')), answer:String(data.get('answer') || ''), focus});
      });
    }
  }

  async function begin(body) {
    state.error = "";
    if (state.kind === "server") {
      state.busy = true;
      render();
      try {
        const round = await api(apiPath("api/rounds"), Object.assign({ lang: locale }, body));
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

  async function protocol() {
    const response = await fetch(apiPath('protocol.txt'));
    if (!response.ok) throw Error('Missing AI protocol');
    return response.text();
  }

  function showSettings() {
    const config = RedPenAI.settings();
    const dialog = document.createElement('dialog');
    const zh = locale === 'zh';
    dialog.innerHTML = `<form method="dialog"><h2>${zh ? 'AI 模型设置' : 'AI model settings'}</h2>
      <p>${zh ? 'Key 仅存于当前浏览器；请求直达所选平台，可能收费。部分接口限制浏览器跨域调用。' : 'Key stays in this browser. Requests go directly to the provider and may incur charges. Some endpoints block browser CORS.'}</p>
      <label>${zh ? '平台' : 'Provider'}<select id="provider">${Object.keys(RedPenAI.providers).map(p => `<option>${p}</option>`).join('')}</select></label>
      <label>Base URL<input id="base" required value="${esc(config.base || RedPenAI.providers.OpenAI[0])}"></label>
      <label>${zh ? '模型（可修改）' : 'Model (editable)'}<input id="model" required value="${esc(config.model || 'o3')}"></label>
      <label>API Key<input id="key" type="password" autocomplete="off" required value="${esc(config.key || '')}"></label>
      <p role="alert" id="settings-error"></p>
      <button type="button" id="save">${zh ? '保存' : 'Save'}</button>
      <button type="button" id="clear">${zh ? '清除 Key' : 'Clear key'}</button>
      <button>${zh ? '关闭' : 'Close'}</button></form>`;
    document.body.append(dialog);
    dialog.querySelector('#provider').value = config.provider || 'OpenAI';
    dialog.querySelector('#provider').onchange = e => {
      const [base, model] = RedPenAI.providers[e.target.value];
      dialog.querySelector('#base').value = base;
      dialog.querySelector('#model').value = model;
    };
    dialog.querySelector('#save').onclick = () => {
      try {
        RedPenAI.save(Object.fromEntries(['provider','base','model','key'].map(k => [k,dialog.querySelector('#'+k).value.trim()])));
        dialog.close();
      } catch (e) { dialog.querySelector('#settings-error').textContent = e.message; }
    };
    dialog.querySelector('#clear').onclick = () => { localStorage.removeItem('redpen:ai'); dialog.querySelector('#key').value = ''; };
    dialog.onclose = () => dialog.remove();
    dialog.showModal();
  }

  async function startLive(topic, level, options = {difficulty:"standard", focus:[], answer:""}) {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      if (RedPenAI.settings().key || state.kind === 'static' || !state.live) {
        const chosen = level === 'blind' ? [0,1,1,2,2][Math.floor(Math.random()*5)] : Number(level);
        const task = `MODE: CLI-SETTER\nTopic or problem: ${topic}\nError level: ${chosen}\nDifficulty: ${options.difficulty}\nFocus categories: ${options.focus.join(", ")}\nReference answer: ${options.answer || "none"}\nLanguage: ${locale}\nReturn JSON only. Corrupted fields must exactly match visible steps.`;
        const draft = await RedPenAI.checkedRequest(task, await protocol(), value => RedPenAI.validate(value, chosen));
        const commitment = await RedPenAI.hash(draft.key);
        state.round = {...draft, id:crypto.randomUUID(), worksheet_id:'browser-live', topic, lang:locale,
          mode:level, level:level === 'blind' ? null : chosen, level_name:locale === 'zh' ? ['无错','隐蔽','轻微','混杂','胡来'][chosen] : RedPenGrade.LEVELS[chosen],
          commitment, commitment_short:commitment.slice(0,12), hints_used:0, live:true, browserLive:true,
          secret:{key:draft.key}, verified:locale === 'zh' ? '模型生成，未经 SymPy 验算' : 'Model generated; not SymPy checked'};
        delete state.round.key;
        location.hash = '';
        return;
      }
      const round = await api(apiPath("api/live"), { topic, level, ...options, lang: locale });
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
    if (state.round.rows && (state.round.rows.some(r => !r.step && (r.wrong || r.fix)) || (state.round.rows.some(r => r.step === 'clean') && state.round.rows.some(r => r.step && r.step !== 'clean')))) {
      state.error = locale === 'zh' ? '请选择步骤；“本题无错”不能与报错同时提交。' : 'Choose a step. A clean claim cannot be combined with error findings.'; render(); return;
    }
    const findings = currentFindings();
    const empty = RedPenGrade.parseFindings(findings).clean_claim;
    if (empty && !window.confirm(text.confirmEmpty)) return;
    await grade("submit", findings);
  }

  async function revealKey() {
    if (!window.confirm(text.confirmReveal)) return;
    await grade("reveal", "");
  }

  async function grade(action, findings) {
    if (state.busy) return;
    if (action === "submit") state.round.findings = findings;
    state.busy = true;
    state.error = "";
    render();
    try {
      if (state.round.server) {
        const path = apiPath(`api/rounds/${state.round.id}/${action}`);
        state.round.debrief = await api(path, action === "submit" ? { findings } : {});
        state.round.graded = true;
      } else if (action === "submit") {
        state.round.debrief = await staticDebrief(findings, false);
        state.round.graded = true;
      } else {
        state.round.debrief = await staticDebrief("", true);
        state.round.graded = true;
      }
      saveHistory(state.round);
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  function history() {
    try { return JSON.parse(localStorage.getItem('redpen:history') || '[]'); } catch (_) { return []; }
  }
  function saveHistory(round) {
    const rows = history().filter(r => r.id !== round.id);
    rows.push({id:round.id, date:new Date().toISOString(), title:round.title, ...round.debrief});
    try { localStorage.setItem('redpen:history', JSON.stringify(rows.slice(-200))); } catch (_) { /* storage full */ }
  }
  function categoryStats() {
    const stats = {};
    for (const row of history()) for (const e of row.errors || []) {
      const item = stats[e.category] ||= {total:0,found:0}; item.total++; if(e.found) item.found++;
    }
    return Object.entries(stats).sort((a,b) => (a[1].found/a[1].total) - (b[1].found/b[1].total));
  }
  function weakSpots() { return categoryStats().filter(([,v]) => v.found < v.total).slice(0,3).map(([k]) => k); }
  function statsHtml() {
    const rows = history();
    return `<section class="panel"><h2>${locale === 'zh' ? '练习记录与薄弱项' : 'Practice history and weak spots'}</h2>
      <p>${locale === 'zh' ? '本浏览器已完成' : 'Completed in this browser'}: ${rows.length}</p>
      <table><thead><tr><th>${locale === 'zh' ? '类别' : 'Category'}</th><th>${locale === 'zh' ? '找到 / 遇到' : 'Found / encountered'}</th></tr></thead><tbody>${categoryStats().map(([k,v]) => `<tr><td>${esc(categoryLabel(k))}</td><td>${v.found}/${v.total}</td></tr>`).join('')}</tbody></table>
      ${rows.slice(-5).reverse().map(r => `<p>${esc(r.title)} · ${r.revealed ? esc(text.revealed) : esc(r.score)+'/100'}</p>`).join('')}
      <p>${locale === 'zh' ? '记录仅保存在当前浏览器。' : 'History is stored only in this browser.'}</p></section>`;
  }
  async function verifyRound() {
    if (state.busy) return;
    state.busy = true; render();
    try {
      const r = state.round;
      if (r.server) {
        const result = await api(apiPath(`api/rounds/${r.id}/verify`), {});
        r.verifyText = (result.commitment_ok ? text.hashOk(r.commitment_short) : text.hashBad) + ' ' + result.checks;
      } else {
        const secret = await ensureSecret();
        r.verifyText = (await hashMatches(secret.key, r.commitment) ? text.hashOk(r.commitment_short) : text.hashBad) + (locale === 'zh' ? ' 浏览器不执行 SymPy 验算。' : ' Browser does not run SymPy checks.');
      }
    } catch(e) { state.error = e.message; }
    finally { state.busy = false; render(); }
  }
  async function compareAI() {
    if (state.busy) return;
    state.busy = true; state.error = ''; render();
    try {
      const r = state.round;
      if (r.server && !RedPenAI.settings().key) {
        r.ai = await api(apiPath(`api/rounds/${r.id}/ai`), {});
      } else {
        const visible = {title:r.title,problem:r.problem,steps:r.steps,final_answer:r.final_answer};
        const rules = await protocol();
        const findings = await RedPenAI.request(`MODE: CLI-HUNTER\nWORKSHEET: ${JSON.stringify(visible)}\nLanguage: ${locale}`, rules, false);
        // The hunter receives only the visible worksheet. Load the key afterwards.
        let entry;
        if (r.server) {
          entry = {...r, level:r.debrief.level, key:{level:r.debrief.level, clean_steps:r.debrief.clean_steps,clean_final_answer:r.debrief.clean_final_answer,errors:r.debrief.errors.map(e => ({step:e.step,category:e.category,original:e.correct,corrupted:e.shown,why_wrong:e.why_wrong,why_tempting:e.why_tempting,catch_rule:e.catch_rule,practice:{problem:e.practice_problem,answer:e.practice_answer}}))}};
        } else entry = staticEntry(await ensureSecret());
        const g = RedPenAI.validateGrade(await RedPenAI.request(`MODE: CLI-GRADER\nWORKSHEET: ${JSON.stringify(visible)}\nANSWER KEY: ${JSON.stringify(entry.key)}\nSTUDENT FINDINGS: ${findings}\nLanguage: ${locale}`,rules),entry.key.errors.length);
        r.ai = {findings, debrief:RedPenGrade.buildDebrief(entry,r.mode,0,g,false,'model')};
      }
    } catch(e) { state.error = e.message; }
    finally { state.busy = false; render(); }
  }

  async function ensureSecret() {
    if (state.round.secret) {
      if (!await hashMatches(state.round.secret.key, state.round.commitment)) throw Error(text.hashBad);
      return state.round.secret;
    }
    const response = await fetch(`secrets/${state.round.worksheet_id}.json`);
    if (!response.ok) throw new Error(text.missingKey);
    const secret = await response.json();
    if (!await hashMatches(secret.key, state.round.commitment)) throw Error(text.hashBad);
    state.round.secret = secret;
    return secret;
  }

  function staticEntry(secret) {
    if (state.round.browserLive) return {...state.round, level:secret.key.level, key:secret.key};
    const card = state.catalog.worksheets.find((item) => item.id === state.round.worksheet_id);
    return {
      id: card.id,
      title: card.title,
      topic: card.topic,
      level: secret.key.level,
      lang: card.lang || state.round.lang || locale,
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
    const grade = state.round.browserLive && !revealed
      ? RedPenAI.validateGrade(await RedPenAI.request(`MODE: CLI-GRADER\nWORKSHEET: ${JSON.stringify({problem:entry.problem,steps:entry.steps,final_answer:entry.final_answer})}\nANSWER KEY: ${JSON.stringify(secret.key)}\nSTUDENT FINDINGS: ${findings}\nLanguage: ${locale}`, await protocol()), secret.key.errors.length)
      : revealed
      ? RedPenGrade.blankGrade(secret.key.errors.length, entry.lang)
      : RedPenGrade.gradeFindings(entry, findings);
    const debrief = RedPenGrade.buildDebrief(
      entry, state.round.mode, state.round.hints_used, grade, revealed, revealed ? "reveal" : state.round.browserLive ? "model" : "auto"
    );
    debrief.commitment_ok = await hashMatches(secret.key, entry.commitment);
    return debrief;
  }

  async function takeHint() {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    const findings = currentFindings();
    render();
    try {
      if (state.round.server) {
        const data = await api(apiPath(`api/rounds/${state.round.id}/hint`), {});
        state.round.hints_used = data.hints_used;
        state.round.hintText = data.hint;
      } else {
        const secret = await ensureSecret();
        const hints = RedPenGrade.hintLadder(
          state.round.mode, secret.key.level, state.round.steps, secret.key.errors, locale
        );
        if (!hints.length) state.round.hintText = text.noHints;
        else if (state.round.hints_used >= hints.length) state.round.hintText = text.noHintsLeft;
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
