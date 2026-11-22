/* Web-first RedPen browser engine.
   Renders segments, tap-to-flag light mode (default), free-text advanced mode,
   Daily RedPen + streaks + spoiler-free share cards, and decoupled domain packs.
   Works identically on static GitHub Pages (grade.js) and local python redpen.py demo. */
(function () {
  const app = document.getElementById("app");
  const topNav = document.getElementById("top-nav");
  const note = document.getElementById("mode-note");
  const locale = (document.documentElement.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  const zh = locale === "zh";

  const UI = {
    en: {
      headline: "Spot the flaw. Beat the AI.",
      navDaily: "Daily",
      navPacks: "Packs",
      navWorkshop: "Workshop",
      backToDaily: "← Back to Daily",
      streak: (n) => `${n}-day streak`,
      dailyTitle: (num) => `RedPen #${num}`,
      copyDaily: "Copy text",
      copySingle: "Copy text",
      saveImage: "Save image",
      savedImage: "Image saved.",
      copied: "Copied.",
      shared: "Shared.",
      copyFallback: "Copy this docket:",
      judgeQ: "Does this hold up?",
      judgeSub: "Tap a shaky line, or clear it as solid.",
      needPicks: "Pick what's off and what fixes it, then mark.",
      readyToScore: "Ready to mark.",
      stuck: "Stuck?",
      writeOwn: "Write your own diagnosis",
      backToTap: "Back to tap & pick",
      celebratePerfect: "Caught it clean.",
      celebrateGood: "Sharp catch.",
      celebrateOk: "Caught part of it.",
      celebrateLow: "That one slipped past.",
      celebrateReveal: "Revealed.",
      celebrateCleanHit: "Good call — it holds up.",
      celebrateCleanMiss: "This one actually held up.",
      docketLinePerfect: "Three for three. Nothing got past the red pen.",
      docketLineGood: "Sharp eye. Only a sliver slipped through.",
      docketLineMid: "Caught half, cleared half. Close calls today.",
      docketLineLow: "A few smooth talkers got past you today.",
      elapsedLine: (label) => `${label}`,
      domains: { all: "All", logic: "Logic", code: "Code", math: "Math" },
      evidenceKinds: { chat: "Group chat", code: "Code review", math: "Derivation", prose: "Argument" },
      estSec: (s) => `~${s}s`,
      levelPill: (n, name) => `L${n} · ${name}`,
      blindPill: "Blind",
      blindTitle: "Blind round",
      blindBlurb: "Random L0–L2 puzzle — could even be completely clean.",
      noFlawsBtn: "Holds up",
      noFlawsActive: "Marked: holds up",
      noFlawsNote: "Clearing this as solid. Confirm when sure.",
      confirmClean: "Clear as solid",
      modeLight: "Tap & pick",
      modeText: "Free text",
      panelTitle: "Red Pen",
      whyWrongPick: "What's off?",
      howFixPick: "What fixes it?",
      unmark: "Unmark",
      markedTag: "Flagged",
      hitTag: "Caught",
      missedTag: "Missed",
      alarmTag: "Holds up",
      submitLight: "Mark the flaw",
      submitText: "Submit",
      hintBtn: "Hint",
      reveal: "Reveal",
      revealed: "Revealed",
      accuracy: (pct) => `Accuracy ${pct}%`,
      nextDaily: () => "Next →",
      nextPuzzle: "Next →",
      keepPlaying: "Keep reading →",
      problem: "Context",
      finalAnswer: "Conclusion",
      commitment: (short) => `commitment ${short}`,
      verifyBtn: "Verify commitment",
      hashBad: "The revealed key does not match the commitment shown at the start.",
      hashOk: (short) => `Key matches commitment ${short}.`,
      hashWait: "Checking commitment…",
      whoModel: "Graded by AI model.",
      whoReveal: "Answer key revealed.",
      whoAuto: "Graded deterministically in-page.",
      foundDetail: (d, f) => `Caught · diag ${d} · fix ${f}`,
      whyWrong: "Why it fails",
      theFix: "Instead",
      catchRule: "Check next time",
      cleanRound: "This one holds up — zero planted flaws.",
      cleanTitle: "Clean version",
      falseAlarms: "Marked valid lines",
      alarmItem: (label, why) => `${label}: ${why}`,
      practice: "Quick practice",
      practiceAnswers: "Show answer",
      moreDetails: "Clean version & details",
      aiCompare: "Compare with AI hunter",
      confirmEmpty: "No line flagged. Clear this item as solid?",
      confirmReveal: "Reveal the answer key? Planted flaws will count as missed.",
      noHints: "No hints for this item (it may hold up!).",
      noHintsLeft: "No hints left.",
      missingKey: "The sealed key for this item is missing.",
      missingLexicon: "Missing grade lexicon.",
      requestFailed: "Request failed.",
      startDemo: "Start the demo with <code>python redpen.py demo</code>.",
      noteServerLive: "Local server · keys stay server-side · live rounds on.",
      noteServer: "Local server · keys stay server-side until submit.",
      noteStatic: "Runs locally in your browser · no login needed.",
      packsTitle: "Archive",
      packsSubtitle: "Browse by domain, or open a blind round where clean items mix with flawed ones.",
      workshopTitle: "Workshop",
      workshopSubtitle: "All built-in puzzles work with zero setup. Use the Workshop only if you want your own AI API key to generate custom rounds.",
      liveTitle: "Generate a custom round",
      topicLabel: "Topic or problem",
      topicPlaceholder: "e.g. integration by parts, async JS bugs, Bayes theorem",
      levelLabel: "Error level",
      levels: [
        ["2", "2 · Minor (2–3 flaws)", true],
        ["0", "0 · Clean (0 flaws)", false],
        ["1", "1 · Subtle (1 flaw)", false],
        ["3", "3 · Mixed", false],
        ["4", "4 · Nonsense", false],
        ["blind", "Blind (0–2)", false],
      ],
      liveButton: "Generate custom round",
      solvedTag: "Done",
      categories: {
        "mutable-default": "Mutable default",
        "security-injection": "SQL injection",
        "shallow-copy": "Shallow copy",
        "off-by-one": "Off-by-one",
        "branch-order": "Dead branch",
        concurrency: "Race condition",
        "selection-bias": "Survivorship bias",
        "base-rate": "Base-rate fallacy",
        "percentage-base": "Percentage base",
        "correlation-causation": "Correlation ≠ causation",
        "misleading-chart": "Truncated axis",
        "simpson-paradox": "Simpson's paradox",
        "small-sample": "Tiny sample",
        "calendar-midnight": "Wrong night",
        "leftover-half": "The other half",
        "parallel-time": "Same thirty days",
        "already-yours": "Days you already had",
        "forgotten-goods": "Forgot the goods",
      },
    },
    zh: {
      headline: "红笔抓错：专治一本正经的胡说八道",
      navDaily: "今日三题",
      navPacks: "题库",
      navWorkshop: "工坊",
      backToDaily: "← 返回今日三题",
      streak: (n) => `连续 ${n} 天`,
      dailyTitle: (num) => `RedPen #${num}`,
      copyDaily: "复制战绩文本",
      copySingle: "复制战绩文本",
      saveImage: "保存图片",
      savedImage: "图片已保存。",
      copied: "已复制。",
      shared: "已分享。",
      copyFallback: "请复制以下审结单：",
      judgeQ: "这段话站得住脚吗？",
      judgeSub: "觉得不对就用红笔点那一句；若没漏洞也可以直接放行",
      needPicks: "选出「哪儿不对」与「怎么改」，即可落笔。",
      readyToScore: "已选好，可以落笔。",
      stuck: "卡了？",
      writeOwn: "自己写诊断",
      backToTap: "返回点选",
      celebratePerfect: "抓得准。",
      celebrateGood: "眼挺尖。",
      celebrateOk: "拦住了一部分。",
      celebrateLow: "这回被它糊弄过去了。",
      celebrateReveal: "已摊牌。",
      celebrateCleanHit: "放行得对，确实站得住。",
      celebrateCleanMiss: "其实这段没漏洞。",
      docketLinePerfect: "三道全抓，今天没被糊弄过去。",
      docketLineGood: "眼挺尖，只漏了点边角料。",
      docketLineMid: "拦住了一半，另一半差一点就放行了。",
      docketLineLow: "今天红笔手软了，明天再来。",
      elapsedLine: (label) => `${label}`,
      domains: { all: "全部", logic: "逻辑", code: "代码", math: "数学" },
      evidenceKinds: { chat: "日常聊天", code: "代码审阅", math: "数学推导", prose: "逻辑辨析" },
      estSec: (s) => `约 ${s} 秒`,
      levelPill: (n, name) => `级别 ${n} · ${name}`,
      blindPill: "盲测",
      blindTitle: "盲测一题",
      blindBlurb: "从级别 0–2 随机抽一题——也可能完全无错。",
      noFlawsBtn: "没毛病，站得住",
      noFlawsActive: "已选：站得住",
      noFlawsNote: "准备直接放行。确认无漏洞后点右侧确认。",
      confirmClean: "确认放行",
      modeLight: "点选模式",
      modeText: "自由输入",
      panelTitle: "红笔批注",
      whyWrongPick: "哪儿不对？",
      howFixPick: "怎么改才对？",
      unmark: "取消",
      markedTag: "已标",
      hitTag: "抓到了",
      missedTag: "漏掉了",
      alarmTag: "站得住",
      submitLight: "落笔抓错",
      submitText: "提交",
      hintBtn: "提示",
      reveal: "看答案",
      revealed: "已摊牌",
      accuracy: (pct) => `准确度 ${pct}%`,
      nextDaily: () => "下一题 →",
      nextPuzzle: "下一题 →",
      keepPlaying: "继续翻题 →",
      problem: "背景",
      finalAnswer: "结论",
      commitment: (short) => `承诺 ${short}`,
      verifyBtn: "校验承诺",
      hashBad: "揭晓的钥匙与开始时展示的承诺不一致。",
      hashOk: (short) => `钥匙与承诺 ${short} 一致。`,
      hashWait: "正在核对承诺…",
      whoModel: "由模型评分。",
      whoReveal: "已揭晓答案钥匙。",
      whoAuto: "本地自动批改。",
      foundDetail: (d, f) => `命中 · 诊断 ${d} · 修正 ${f}`,
      whyWrong: "错因",
      theFix: "正确说法",
      catchRule: "记住一条",
      cleanRound: "这段话站得住，没有埋漏洞。",
      cleanTitle: "完整正确版本",
      falseAlarms: "错标了站得住的句子",
      alarmItem: (label, why) => `${label}：${why}`,
      practice: "同类小练",
      practiceAnswers: "查看答案",
      moreDetails: "完整正确版与细节",
      aiCompare: "让 AI 同台找错对比",
      confirmEmpty: "还没有标红任何一句。确认直接放行、判定「站得住」吗？",
      confirmReveal: "直接查看答案？本轮漏洞会记为漏掉。",
      noHints: "这一题没有提示（也许它本来就站得住）。",
      noHintsLeft: "没有更多提示了。",
      missingKey: "这一题的密封钥匙缺失。",
      missingLexicon: "缺少评分词表。",
      requestFailed: "请求失败。",
      startDemo: "请用 <code>python redpen.py demo</code> 启动演示。",
      noteServerLive: "本地服务 · 答案钥匙留在服务端 · 已开启现场出题。",
      noteServer: "本地服务 · 答案钥匙在提交前留在服务端。",
      noteStatic: "纯本地静态运行 · 无需登录。",
      packsTitle: "题库",
      packsSubtitle: "按领域挑题，或来一道盲测（无错题混在其中）。",
      workshopTitle: "出题工坊",
      workshopSubtitle: "内置题库全部开箱即玩。只有想用自己的 API Key 现场出题时，才需要这里。",
      liveTitle: "AI 自定义出题",
      topicLabel: "题目或知识点",
      topicPlaceholder: "例如：分部积分、Python 异步坑、贝叶斯直觉",
      levelLabel: "错误级别",
      levels: [
        ["2", "2 · 轻微（2–3 处错）", true],
        ["0", "0 · 无错（0 处错）", false],
        ["1", "1 · 隐蔽（1 处错）", false],
        ["3", "3 · 混杂", false],
        ["4", "4 · 胡来", false],
        ["blind", "盲测（0–2 级）", false],
      ],
      liveButton: "生成自定义题",
      solvedTag: "已做",
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
        "mutable-default": "可变默认参数",
        "security-injection": "SQL 注入",
        "shallow-copy": "浅拷贝",
        "off-by-one": "边界差一",
        "branch-order": "死分支顺序",
        concurrency: "异步竞态",
        "selection-bias": "幸存者偏差",
        "base-rate": "基率谬误",
        "percentage-base": "百分比基数",
        "correlation-causation": "相关≠因果",
        "misleading-chart": "截断坐标轴",
        "simpson-paradox": "辛普森悖论",
        "small-sample": "极小样本",
        "calendar-midnight": "记错了那天晚上",
        "leftover-half": "另外那一半",
        "parallel-time": "其实是同一段时间",
        "already-yours": "本来就有的假期",
        "forgotten-goods": "漏算了那件东西",
      },
    },
  };
  const text = UI[locale];

  const state = {
    locale,
    kind: null, // "server" | "static"
    live: false,
    banner: "",
    packs: [],
    worksheets: [],
    byId: new Map(),
    dateStr: RedPenDaily.todayDateStr(),
    daily: [],
    view: "play", // "play" | "packs" | "workshop"
    packFilter: "all",
    round: null,
    error: "",
    busy: false,
    shareMessage: "",
    shareText: "",
    justFlagged: 0,
    justPicked: null,
    justGraded: false,
  };

  let timerHandle = null;

  function esc(value) {
    return String(value == null ? "" : value)
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

  function isOpenerRound(round) {
    if (round && round.opener) return true;
    const entry = round && state.byId.get(round.worksheet_id);
    return !!(entry && entry.opener);
  }

  function domainLabel(domain) {
    return text.domains[domain] || domain;
  }

  function remember(id, value) {
    try { sessionStorage.setItem("redpen-demo:" + locale + ":" + id, value); } catch (_) {}
  }

  function recall(id) {
    try { return sessionStorage.getItem("redpen-demo:" + locale + ":" + id) || ""; } catch (_) { return ""; }
  }

  async function api(path, body) {
    const response = await fetch(path, body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
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
    if (!note) return;
    if (state.kind === "server") {
      note.textContent = state.live ? text.noteServerLive : text.noteServer;
    } else if (state.kind === "static") {
      note.textContent = text.noteStatic;
    } else {
      note.textContent = "";
    }
  }

  function dailyState() {
    return RedPenDaily.loadState(locale);
  }

  function todayResults() {
    const ds = dailyState();
    return (ds.days && ds.days[state.dateStr] && ds.days[state.dateStr].results) || {};
  }

  function isDailyComplete() {
    const res = todayResults();
    return state.daily.length > 0 && state.daily.every((item) => !!res[item.id]);
  }

  function dailyDoneCount() {
    const res = todayResults();
    return state.daily.filter((item) => !!res[item.id]).length;
  }

  function dailyIds() {
    return state.daily.map((item) => item.id);
  }

  function solvedIds() {
    const set = new Set();
    for (const row of history()) {
      if (row.worksheet_id) set.add(row.worksheet_id);
      if (row.title) {
        const match = state.worksheets.find((w) => w.title === row.title);
        if (match) set.add(match.id);
      }
    }
    for (const id of Object.keys(todayResults())) set.add(id);
    return set;
  }

  function hasLightChoices(round) {
    return !!(round && round.light_choices && Object.keys(round.light_choices).length > 0);
  }

  function isLightPlay(round) {
    return !!(round && hasLightChoices(round) && round.inputMode !== "text");
  }

  function lightReady(round) {
    if (!round) return false;
    if (round.cleanClaim) return true;
    const sels = round.selections || [];
    return sels.length > 0 && sels.every((s) => s.diagnosis_id && s.fix_id);
  }

  function canNativeShare() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  }

  function celebrateCopy(debrief) {
    if (!debrief) return "";
    if (debrief.revealed) return text.celebrateReveal;
    if (debrief.planted === 0) {
      return debrief.false_alarms === 0 ? text.celebrateCleanHit : text.celebrateCleanMiss;
    }
    if (debrief.score === 100 && debrief.false_alarms === 0) return text.celebratePerfect;
    if (debrief.score >= 80) return text.celebrateGood;
    if (debrief.score >= 50) return text.celebrateOk;
    return text.celebrateLow;
  }

  function applyPlayMotion() {
    if (state.justFlagged) {
      const li = app.querySelector(`[data-seg-item="${state.justFlagged}"]`);
      if (li) {
        li.classList.add("just-flagged");
        const drawer = li.querySelector(".choice-drawer");
        if (drawer && drawer.scrollIntoView) {
          drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      state.justFlagged = 0;
    }
    if (state.justPicked) {
      const kind = state.justPicked.kind === "fix" ? "data-pick-fix" : "data-pick-diag";
      const btn = app.querySelector(`[data-step="${state.justPicked.step}"][${kind}="${state.justPicked.id}"]`);
      if (btn) btn.classList.add("just-picked");
      state.justPicked = null;
    }
    if (state.justGraded) {
      const panel = app.querySelector(".results-stage");
      if (panel) {
        panel.classList.add("just-graded");
        if (panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      state.justGraded = false;
    }
  }

  function normalizeSegments(round) {
    if (Array.isArray(round.segments) && round.segments.length === round.steps.length) {
      return round.segments;
    }
    const prefix = zh ? "步骤" : "Step";
    return (round.steps || []).map((step, i) => ({
      id: i + 1,
      label: `${prefix} ${i + 1}`,
      text: step,
    }));
  }

  function segmentLabel(round, stepNum) {
    const segs = normalizeSegments(round);
    const found = segs.find((s) => s.id === stepNum);
    return found ? found.label : (zh ? `第 ${stepNum} 步` : `Step ${stepNum}`);
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const el = document.getElementById("round-timer");
      if (!el || !state.round || state.round.graded) return;
      const sec = Math.max(0, Math.floor((Date.now() - (state.round.startedAt || Date.now())) / 1000));
      el.textContent = formatClock(sec);
    }, 1000);
  }

  function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function elapsedSeconds(round) {
    if (!round) return 0;
    if (round.elapsedSec != null) return round.elapsedSec;
    return Math.max(1, Math.round((Date.now() - (round.startedAt || Date.now())) / 1000));
  }

  async function loadAllPacksServer() {
    const q = locale === "zh" ? "?lang=zh" : "";
    try {
      const index = await api(apiPath("api/packs" + q));
      state.packs = index.packs || [];
      state.banner = index.banner || "";
      const loaded = await Promise.all(
        state.packs.map((p) => api(apiPath(`api/packs/${encodeURIComponent(p.id)}${q}`)))
      );
      state.worksheets = loaded.flatMap((item) => item.worksheets || []);
    } catch (_) {
      const catalog = await api(apiPath("api/catalog" + q));
      state.packs = catalog.packs || [];
      state.banner = catalog.banner || "";
      state.worksheets = catalog.worksheets || [];
    }
    rebuildIndex();
  }

  async function loadAllPacksStatic() {
    try {
      const idxResp = await fetch("packs/index.json");
      if (idxResp.ok) {
        const index = await idxResp.json();
        state.packs = index.packs || [];
        state.banner = index.banner || "";
        const loaded = await Promise.all(
          state.packs.map(async (p) => {
            const resp = await fetch(p.file || `packs/${p.id}.json`);
            return resp.ok ? resp.json() : { worksheets: [] };
          })
        );
        state.worksheets = loaded.flatMap((item) => item.worksheets || []);
        rebuildIndex();
        return true;
      }
    } catch (_) { /* fall back to catalog.json */ }
    const catResp = await fetch("catalog.json");
    if (!catResp.ok) return false;
    const catalog = await catResp.json();
    state.packs = catalog.packs || [];
    state.banner = catalog.banner || "";
    state.worksheets = catalog.worksheets || [];
    rebuildIndex();
    return true;
  }

  function rebuildIndex() {
    state.byId = new Map();
    for (const w of state.worksheets) state.byId.set(w.id, w);
    state.daily = RedPenDaily.selectDaily(state.worksheets, state.dateStr, 3);
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
          await loadAllPacksServer();
          setNote();
          await restoreOrAutoStart();
          startTimer();
          render();
          return;
        }
      }
    } catch (_) { /* static host */ }

    const ok = await loadAllPacksStatic();
    if (!ok) {
      app.innerHTML = `<p>${text.startDemo}</p>`;
      return;
    }
    state.kind = "static";
    state.live = false;
    setNote();
    await restoreOrAutoStart();
    startTimer();
    render();
  }

  function pickDefaultPuzzle() {
    const doneToday = todayResults();
    const firstUnfinishedDaily = state.daily.find((item) => !doneToday[item.id]);
    if (firstUnfinishedDaily) return firstUnfinishedDaily;
    const solved = solvedIds();
    const nextUnplayed = state.worksheets.find((item) => !solved.has(item.id));
    if (nextUnplayed) return nextUnplayed;
    return state.daily[0] || state.worksheets[0] || null;
  }

  async function restoreOrAutoStart() {
    const hash = location.hash.replace(/^#/, "");
    if (hash === "packs") {
      state.view = "packs";
      return;
    }
    if (hash === "workshop") {
      state.view = "workshop";
      return;
    }
    const params = new URLSearchParams(hash);
    try {
      const stored = JSON.parse(sessionStorage.getItem("redpen:active:" + locale) || "null");
      if (stored && !stored.server && (
        (stored.browserLive && !hash) ||
        (params.get("w") && stored.worksheet_id === params.get("w") && (stored.mode === "blind") === (params.get("blind") === "1"))
      )) {
        state.round = stored;
        state.view = "play";
        return;
      }
    } catch (_) {}

    if (state.kind === "server" && params.get("r")) {
      try {
        const round = await api(apiPath("api/rounds/" + params.get("r")));
        adoptServerRound(round);
        state.view = "play";
        return;
      } catch (err) {
        state.error = err.message;
      }
    }

    if (params.get("w")) {
      const entry = state.byId.get(params.get("w"));
      if (entry) {
        await startEntry(entry, params.get("blind") === "1", false);
        return;
      }
    }

    // First-screen instant play: immediately load today's first unfinished Daily puzzle (or next warmup).
    const first = pickDefaultPuzzle();
    if (first) {
      await startEntry(first, false, false);
    } else {
      state.view = "packs";
    }
  }

  function initRoundState(round) {
    round.segments = normalizeSegments(round);
    round.selections = Array.isArray(round.selections) ? round.selections : [];
    round.cleanClaim = !!round.cleanClaim;
    round.inputMode = round.inputMode || (hasLightChoices(round) ? "light" : "text");
    round.startedAt = round.startedAt || Date.now();
    round.hintText = round.hintText || "";
    round.verifyText = round.verifyText || "";
    return round;
  }

  function adoptServerRound(round) {
    round.server = true;
    round.findings = recall(round.id);
    initRoundState(round);
    state.round = round;
    state.view = "play";
  }

  function openStatic(entry, blind, updateHash = true) {
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
      .replace(/-/g, "").slice(0, 16);
    state.round = initRoundState({
      server: false,
      id,
      worksheet_id: entry.id,
      pack_id: entry.pack_id || entry.domain || "math",
      domain: entry.domain || "math",
      renderer: entry.renderer || "math",
      code_language: entry.code_language || "",
      estimated_seconds: entry.estimated_seconds || 60,
      title: entry.title,
      topic: entry.topic,
      problem: entry.problem,
      segments: entry.segments,
      steps: entry.steps,
      final_answer: entry.final_answer,
      light_choices: entry.light_choices || {},
      mode: blind ? "blind" : String(entry.level),
      level: blind ? null : entry.level,
      level_name: blind ? null : entry.level_name,
      lang: entry.lang || locale,
      commitment: entry.commitment,
      commitment_short: entry.commitment_short,
      verified: entry.verified,
      opener: !!entry.opener,
      hints_used: 0,
      graded: false,
      live: false,
      banner: state.banner,
      findings: recall(entry.id + (blind ? ":blind" : "")),
      hintText: "",
      debrief: null,
    });
    state.view = "play";
    if (updateHash) location.hash = "w=" + entry.id + (blind ? "&blind=1" : "");
  }

  async function startEntry(entry, blind = false, updateHash = true) {
    state.error = "";
    state.shareMessage = "";
    state.shareText = "";
    state.justFlagged = 0;
    state.justPicked = null;
    state.justGraded = false;
    if (state.kind === "server") {
      try {
        const body = blind ? { blind: true, lang: locale } : { worksheet_id: entry.id, lang: locale };
        const round = await api(apiPath("api/rounds"), body);
        adoptServerRound(round);
        if (updateHash) location.hash = "r=" + round.id;
      } catch (err) {
        state.error = err.message;
      }
      return;
    }
    openStatic(entry, blind, updateHash);
  }

  function persistActive() {
    if (state.round && !state.round.server) {
      try { sessionStorage.setItem("redpen:active:" + locale, JSON.stringify(state.round)); } catch (_) {}
    }
  }

  const CIRCLED = ["①", "②", "③", "④", "⑤"];
  const INK_PATHS = [
    "M2,11 C46,7 118,14 184,9 C212,7 228,10 238,9",
    "M3,9 C52,13 108,7 176,12 C206,14 224,9 237,11",
    "M2,12 C60,8 124,13 190,8 C214,7 228,11 238,10",
    "M4,10 C54,14 116,8 178,12 C208,13 226,8 236,10",
  ];
  const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

  function inkSlashSvg(seed) {
    const d = INK_PATHS[Math.abs(Number(seed) || 0) % INK_PATHS.length];
    return `<svg class="ink-slash-svg" viewBox="0 0 240 20" preserveAspectRatio="none" aria-hidden="true"><path class="ink-slash-path" d="${d}"/></svg>`;
  }

  function evidenceKind(round) {
    if (!round) return "prose";
    if (round.renderer === "chat" || isOpenerRound(round)) return "chat";
    if (round.renderer === "code") return "code";
    if (round.renderer === "math") return "math";
    return "prose";
  }

  function isPassedResult(res) {
    if (!res) return false;
    return !res.revealed && res.score >= 80 && (res.falseAlarms || 0) === 0;
  }

  function bindChromeNav() {
    document.querySelectorAll(".brand-btn[data-nav], #foot-nav [data-nav]").forEach((btn) => {
      if (btn.dataset.boundNav) return;
      btn.dataset.boundNav = "1";
      btn.addEventListener("click", () => navigate(btn.dataset.nav));
    });
  }

  function renderTopNav() {
    bindChromeNav();
    const inDaily = state.view === "play" && state.round && dailyIds().includes(state.round.worksheet_id);
    document.querySelectorAll("#foot-nav [data-nav]").forEach((btn) => {
      const target = btn.dataset.nav;
      const active = (target === "daily" && inDaily) || (target === state.view);
      btn.classList.toggle("active", active);
    });
    if (!topNav) return;
    if (!state.daily.length) {
      topNav.innerHTML = "";
      return;
    }
    const doneToday = todayResults();
    const currentId = state.view === "play" && state.round ? state.round.worksheet_id : "";
    topNav.innerHTML = state.daily.map((item, idx) => {
      const res = doneToday[item.id];
      const active = currentId === item.id;
      const passed = isPassedResult(res);
      const cls = [
        "daily-slot",
        active ? "active" : "",
        res ? (passed ? "done done-good" : "done done-miss") : "",
      ].filter(Boolean).join(" ");
      const glyph = res ? (passed ? "✓" : "✕") : (CIRCLED[idx] || String(idx + 1));
      const aria = zh
        ? `今日第 ${idx + 1} 题（${domainLabel(item.domain)}）`
        : `Daily ${idx + 1} (${domainLabel(item.domain)})`;
      const sep = idx > 0 ? `<span class="daily-sep" aria-hidden="true"></span>` : "";
      return `${sep}<button type="button" class="${cls}" data-daily-id="${esc(item.id)}" aria-label="${esc(aria)}"${active ? ' aria-current="step"' : ""}>${esc(glyph)}</button>`;
    }).join("");
    topNav.querySelectorAll("[data-daily-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const entry = state.byId.get(btn.dataset.dailyId);
        if (!entry) return;
        state.busy = true;
        render();
        await startEntry(entry, false, true);
        state.busy = false;
        render();
        window.scrollTo(0, 0);
      });
    });
  }

  async function navigate(target) {
    state.error = "";
    state.shareMessage = "";
    state.shareText = "";
    if (target === "packs") {
      state.view = "packs";
      location.hash = "packs";
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (target === "workshop") {
      state.view = "workshop";
      location.hash = "workshop";
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (target === "daily") {
      const doneToday = todayResults();
      const nextDaily = state.daily.find((item) => !doneToday[item.id]) || state.daily[0];
      if (nextDaily) {
        state.busy = true;
        render();
        await startEntry(nextDaily, false, true);
        state.busy = false;
        render();
        window.scrollTo(0, 0);
      }
    }
  }

  function render() {
    persistActive();
    setNote();
    renderTopNav();
    if (state.view === "packs") {
      app.innerHTML = packsHtml();
    } else if (state.view === "workshop") {
      app.innerHTML = workshopHtml();
    } else if (state.round) {
      app.innerHTML = roundHtml();
    } else {
      app.innerHTML = packsHtml();
    }
    bind();
    applyPlayMotion();
    typeset();
  }

  function packsHtml() {
    const solved = solvedIds();
    const filters = ["all", "logic", "code", "math"].map((d) =>
      `<button type="button" class="filter-tab ${state.packFilter === d ? "active" : ""}" data-filter="${d}">${esc(domainLabel(d))}</button>`
    ).join("");
    const visiblePacks = state.packs.filter((p) => state.packFilter === "all" || p.domain === state.packFilter);
    const sections = visiblePacks.map((pack) => {
      const items = state.worksheets.filter((w) => (w.pack_id || w.domain || "math") === pack.id);
      if (!items.length) return "";
      const cards = items.map((entry) => {
        const done = solved.has(entry.id);
        return `
          <button class="card ${done ? "solved" : ""}" type="button" data-id="${esc(entry.id)}">
            <div class="card-top">
              <span class="card-meta">${esc(domainLabel(entry.domain))} · ${esc(text.levelPill(entry.level, entry.level_name))}</span>
              <span class="card-time">${done ? `✓ ${esc(text.solvedTag)}` : esc(text.estSec(entry.estimated_seconds || 60))}</span>
            </div>
            <h2>${esc(entry.title)}</h2>
            <p class="blurb">${esc(entry.blurb || entry.problem)}</p>
          </button>`;
      }).join("");
      return `
        <section class="pack-section">
          <div class="pack-head">
            <h2>${esc(pack.title)}</h2>
            ${pack.tagline ? `<p class="pack-tagline">${esc(pack.tagline)}</p>` : ""}
          </div>
          <div class="cards">${cards}</div>
        </section>`;
    }).join("");

    return `
      <div class="view-back"><button type="button" class="linkish" data-nav-inline="daily">${esc(text.backToDaily)}</button></div>
      <div class="view-header">
        <div>
          <h1>${esc(text.packsTitle)}</h1>
          <p class="lede">${esc(text.packsSubtitle)}</p>
        </div>
        <button class="btn secondary small" type="button" data-blind="1">${esc(text.blindTitle)}</button>
      </div>
      <div class="filter-bar">${filters}</div>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      ${sections}`;
  }

  function workshopHtml() {
    const options = text.levels.map(([value, label, selected]) =>
      `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`).join("");
    const focusIds = [
      "arithmetic", "sign", "distribution", "cancellation", "exponent-log",
      "division-by-zero", "extraneous-root", "domain", "inequality",
      "differentiation", "integration", "limit", "series", "matrix",
      "probability", "counting", "hypothesis", "quantifier", "converse",
      "circular", "induction", "case-missing", "units", "misread",
      "wrong-method", "invented-rule",
    ];
    return `
      <div class="view-back"><button type="button" class="linkish" data-nav-inline="daily">${esc(text.backToDaily)}</button></div>
      <div class="view-header">
        <div>
          <h1>${esc(text.workshopTitle)}</h1>
          <p class="lede">${esc(text.workshopSubtitle)}</p>
        </div>
        <button class="btn secondary small" type="button" id="ai-settings">${zh ? "AI 模型设置" : "AI model settings"}</button>
      </div>
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
      <section class="panel workshop-box">
        <h2>${esc(text.liveTitle)}</h2>
        <form id="live-form">
          <label>${esc(text.topicLabel)}
            <input name="topic" required maxlength="4000" placeholder="${esc(text.topicPlaceholder)}">
          </label>
          <div class="row">
            <label>${esc(text.levelLabel)}
              <select name="level">${options}</select>
            </label>
            <label>${zh ? "难度" : "Difficulty"}
              <select name="difficulty">
                <option value="intro">${zh ? "入门" : "Intro"}</option>
                <option value="standard" selected>${zh ? "标准" : "Standard"}</option>
                <option value="advanced">${zh ? "进阶" : "Advanced"}</option>
                <option value="competition">${zh ? "竞赛" : "Competition"}</option>
              </select>
            </label>
          </div>
          <details class="focus-options">
            <summary>${zh ? "高级选项（上传题目 / 标准答案 / 错误侧重点）" : "Advanced options (upload text / reference answer / focus)"}</summary>
            <label>${zh ? "上传题目文本（可选）" : "Upload problem text (optional)"}
              <input id="problem-file" type="file" accept=".txt,.md,text/plain,text/markdown">
            </label>
            <label>${zh ? "参考标准答案（可选）" : "Reference answer (optional)"}
              <textarea name="answer" maxlength="4000"></textarea>
            </label>
            <div class="focus-grid">
              ${focusIds.map((id) => `<label><input type="checkbox" name="focus" value="${id}">${esc(categoryLabel(id))}</label>`).join("")}
            </div>
          </details>
          <button class="btn" type="submit" ${state.busy ? "disabled" : ""}>${esc(text.liveButton)}</button>
        </form>
      </section>
      ${statsHtml()}`;
  }

  function docketSummaryData() {
    const ds = dailyState();
    const streak = RedPenDaily.currentStreak(ds, state.dateStr);
    const num = RedPenDaily.dayNumber(state.dateStr);
    const results = todayResults();
    const rows = state.daily.map((item, idx) => {
      const res = results[item.id] || null;
      const passed = isPassedResult(res);
      const mid = res && !res.revealed && res.score >= 50 && !passed;
      const kind = item.opener ? text.evidenceKinds.chat : domainLabel(item.domain);
      const mark = !res ? "—" : passed ? "✓" : mid ? "△" : "✕";
      const tone = !res ? "" : passed ? "good" : mid ? "mid" : "miss";
      const scoreLabel = !res ? "" : res.revealed ? text.revealed : `${res.score}`;
      return { idx: idx + 1, kind, mark, tone, scoreLabel, res };
    });
    const completed = rows.map((r) => r.res).filter(Boolean);
    const avg = completed.length
      ? Math.round(completed.reduce((acc, res) => acc + (res.revealed ? 0 : res.score), 0) / completed.length)
      : 0;
    const totalSec = completed.reduce((acc, res) => acc + (res.elapsedSec || 0), 0);
    const timeLabel = RedPenDaily.formatDuration(totalSec, locale);
    const allClean = rows.length > 0 && rows.every((r) => r.tone === "good");
    const verdict = allClean
      ? text.docketLinePerfect
      : avg >= 80
        ? text.docketLineGood
        : avg >= 50
          ? text.docketLineMid
          : text.docketLineLow;
    return { num, dateStr: state.dateStr, rows, avg, timeLabel, streak, verdict };
  }

  function saveDocketImage() {
    const d = docketSummaryData();
    const scale = 2;
    const width = 420;
    const height = 310;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);

    const sans = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    const mono = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

    ctx.fillStyle = "#F6F5F1";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(18, 18, width - 36, height - 36);
    ctx.strokeStyle = "#18181B";
    ctx.lineWidth = 1;
    ctx.strokeRect(18.5, 18.5, width - 37, height - 37);
    ctx.fillStyle = "#18181B";
    ctx.fillRect(18, 18, width - 36, 4);

    // Header
    ctx.font = `700 14px ${mono}`;
    ctx.fillStyle = "#18181B";
    ctx.fillText(zh ? `RedPen 红笔 · #${d.num}` : `RedPen · #${d.num}`, 36, 52);
    ctx.font = `400 12px ${mono}`;
    ctx.fillStyle = "#71717A";
    const dateW = ctx.measureText(d.dateStr).width;
    ctx.fillText(d.dateStr, width - 36 - dateW, 52);

    // Dashed rule
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#D4D4D8";
    ctx.beginPath();
    ctx.moveTo(36, 66);
    ctx.lineTo(width - 36, 66);
    ctx.stroke();
    ctx.restore();

    // 3 marks
    d.rows.forEach((row, i) => {
      const y = 100 + i * 34;
      ctx.font = `600 12px ${mono}`;
      ctx.fillStyle = "#71717A";
      ctx.fillText(`0${row.idx}`, 36, y);
      ctx.font = `500 15px ${sans}`;
      ctx.fillStyle = "#18181B";
      ctx.fillText(row.kind, 66, y);

      const rightText = `${row.mark}  ${row.scoreLabel}`;
      ctx.font = `700 14px ${mono}`;
      ctx.fillStyle = row.tone === "good" ? "#15803D" : row.tone === "mid" ? "#92400E" : "#D92D20";
      const tw = ctx.measureText(rightText).width;
      ctx.fillText(rightText, width - 36 - tw, y);
    });

    // Bottom dashed rule
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#D4D4D8";
    ctx.beginPath();
    ctx.moveTo(36, 198);
    ctx.lineTo(width - 36, 198);
    ctx.stroke();
    ctx.restore();

    // Dry verdict line
    ctx.font = `600 14px ${sans}`;
    ctx.fillStyle = "#18181B";
    ctx.fillText(d.verdict, 36, 228, width - 72);

    // Meta line (score, time, streak)
    const metaParts = [
      zh ? `均分 ${d.avg}/100` : `Avg ${d.avg}/100`,
      d.timeLabel,
    ];
    if (d.streak > 0) metaParts.push(text.streak(d.streak));
    ctx.font = `400 12px ${mono}`;
    ctx.fillStyle = "#71717A";
    ctx.fillText(metaParts.join(" · "), 36, 256);

    const a = document.createElement("a");
    a.download = `redpen-daily-${d.num}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    state.shareMessage = text.savedImage;
    render();
  }

  function shareCardVisualHtml({ kind }) {
    if (kind === "daily") {
      const d = docketSummaryData();
      const rowsHtml = d.rows.map((r) => `
        <li class="docket-row">
          <span class="docket-row-left"><span class="docket-idx">0${r.idx}</span><span>${esc(r.kind)}</span></span>
          <span class="docket-mark ${esc(r.tone)}">${esc(r.mark)} ${esc(r.scoreLabel)}</span>
        </li>`).join("");
      const metaParts = [
        zh ? `均分 ${d.avg}/100` : `Avg ${d.avg}/100`,
        d.timeLabel,
      ];
      if (d.streak > 0) metaParts.push(text.streak(d.streak));
      return `
        <aside class="share-card" aria-label="${esc(zh ? "今日审结单" : "Daily docket")}">
          <div class="docket-head">
            <span class="docket-brand">${esc(zh ? `RedPen 红笔 · #${d.num}` : `RedPen · #${d.num}`)}</span>
            <span>${esc(d.dateStr)}</span>
          </div>
          <ul class="docket-rows">${rowsHtml}</ul>
          <p class="docket-verdict">${esc(d.verdict)}</p>
          <p class="docket-meta">${esc(metaParts.join(" · "))}</p>
          <div class="docket-actions">
            <button type="button" class="btn secondary small" data-share-daily="1">${esc(text.copyDaily)}</button>
            <button type="button" class="btn secondary small" data-save-docket="1">${esc(text.saveImage)}</button>
          </div>
        </aside>`;
    }
    const round = state.round;
    if (!round || !round.debrief) return "";
    const passed = !round.debrief.revealed && round.debrief.score >= 80 && round.debrief.false_alarms === 0;
    const mark = passed ? "✓" : "✕";
    const tone = passed ? "good" : "miss";
    const scoreText = round.debrief.revealed ? text.revealed : `${round.debrief.score}/100`;
    const timeLabel = RedPenDaily.formatDuration(elapsedSeconds(round), locale);
    return `
      <aside class="share-card" aria-label="${esc(zh ? "审结记录" : "Round slip")}">
        <div class="docket-head">
          <span class="docket-brand">${esc(zh ? `RedPen · ${domainLabel(round.domain)}` : `RedPen · ${domainLabel(round.domain)}`)}</span>
          <span>${esc(state.dateStr)}</span>
        </div>
        <ul class="docket-rows">
          <li class="docket-row">
            <span>${esc(round.title)}</span>
            <span class="docket-mark ${tone}">${esc(mark)} ${esc(scoreText)}</span>
          </li>
        </ul>
        <p class="docket-meta">${esc(timeLabel)}</p>
        <div class="docket-actions">
          <button type="button" class="btn secondary small" data-share-single="1">${esc(text.copySingle)}</button>
        </div>
      </aside>`;
  }

  function choiceDrawerHtml(round, step) {
    const sel = (round.selections || []).find((s) => s.step === step);
    if (!sel) return "";
    const choices = (round.light_choices && round.light_choices[String(step)]) || { diagnosis: [], fix: [] };
    const diagBtns = (choices.diagnosis || []).map((opt, idx) => {
      const picked = sel.diagnosis_id === opt.id;
      const letter = CHOICE_LETTERS[idx] || String(idx + 1);
      return `<button type="button" class="choice-btn ${picked ? "picked" : ""}" data-step="${step}" data-pick-diag="${esc(opt.id)}" aria-pressed="${picked ? "true" : "false"}"><span class="choice-key" aria-hidden="true">${esc(letter)}</span><span class="choice-text">${esc(opt.label)}</span></button>`;
    }).join("");
    const fixBtns = (choices.fix || []).map((opt, idx) => {
      const picked = sel.fix_id === opt.id;
      const letter = CHOICE_LETTERS[idx] || String(idx + 1);
      return `<button type="button" class="choice-btn ${picked ? "picked" : ""}" data-step="${step}" data-pick-fix="${esc(opt.id)}" aria-pressed="${picked ? "true" : "false"}"><span class="choice-key" aria-hidden="true">${esc(letter)}</span><span class="choice-text">${esc(opt.label)}</span></button>`;
    }).join("");
    const fresh = state.justFlagged === step;
    return `
      <div class="choice-drawer sel-card ${fresh ? "is-new" : ""}" data-sel-step="${step}">
        <div class="sel-card-head">
          <strong>${esc(segmentLabel(round, step))}</strong>
          <button type="button" class="linkish small-link" data-unflag="${step}">${esc(text.unmark)} ×</button>
        </div>
        <p class="choice-heading">${esc(text.whyWrongPick)}</p>
        <div class="choice-list">${diagBtns}</div>
        <p class="choice-heading">${esc(text.howFixPick)}</p>
        <div class="choice-list">${fixBtns}</div>
      </div>`;
  }

  function playDockHtml(round) {
    const ready = lightReady(round);
    const hasFlags = !round.cleanClaim && (round.selections || []).length > 0;
    const incomplete = hasFlags && !ready;

    let subHtml;
    if (round.cleanClaim) {
      subHtml = `<p class="dock-note clean-ready">${esc(text.noFlawsNote)}</p>`;
    } else if (incomplete) {
      subHtml = `<p class="dock-note">${esc(text.needPicks)}</p>`;
    } else if (ready) {
      subHtml = `<p class="dock-note ready">${esc(text.readyToScore)}</p>`;
    } else {
      subHtml = `<p class="judge-sub">${esc(text.judgeSub)}</p>`;
    }

    const ctaClass = round.cleanClaim
      ? "is-clean-go"
      : ready
        ? ""
        : "is-idle";
    const ctaLabel = round.cleanClaim ? text.confirmClean : text.submitLight;

    return `
      <div class="play-dock ${ready ? "is-ready" : ""}">
        <p class="judge-q">${esc(text.judgeQ)}</p>
        ${subHtml}
        ${round.hintText ? `<p class="hint" role="status">${esc(round.hintText)}</p>` : ""}
        ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
        <div class="dock-actions">
          <button type="button" class="btn ghost ${round.cleanClaim ? "active" : ""}" data-act="toggle-clean" aria-pressed="${round.cleanClaim ? "true" : "false"}">
            ${round.cleanClaim ? "✓ " : ""}${esc(round.cleanClaim ? text.noFlawsActive : text.noFlawsBtn)}
          </button>
          <button class="btn primary-cta ${ctaClass}" type="button" data-act="submit" ${state.busy ? "disabled" : ""}>${esc(ctaLabel)}</button>
        </div>
        <div class="dock-meta-row">
          <details class="stuck-menu">
            <summary>${esc(text.stuck)}</summary>
            <div class="stuck-panel">
              <button type="button" data-act="hint" ${state.busy ? "disabled" : ""}>${esc(text.hintBtn)}</button>
              <button type="button" data-act="reveal" ${state.busy ? "disabled" : ""}>${esc(text.reveal)}</button>
              <button type="button" data-input-mode="text">${esc(text.writeOwn)}</button>
            </div>
          </details>
        </div>
      </div>`;
  }

  function renderEvidenceHtml(round, segs, ctx) {
    const { kind, debrief, light, selectedSteps, hitSteps, missedSteps, alarmSteps } = ctx;

    if (kind === "chat") {
      let prevSpeaker = null;
      const items = segs.map((seg, idx) => {
        const id = seg.id;
        let cls = "seg-item";
        let stamp = "";
        let drawer = "";
        let slashed = false;

        if (debrief) {
          if (hitSteps.has(id)) {
            cls += " seg-hit";
            slashed = true;
            stamp = `<span class="seg-stamp hit">✓ ${esc(text.hitTag)}</span>`;
          } else if (missedSteps.has(id)) {
            cls += " seg-missed";
            slashed = true;
            stamp = `<span class="seg-stamp missed">! ${esc(text.missedTag)}</span>`;
          } else if (alarmSteps.has(id)) {
            cls += " seg-alarm";
            stamp = `<span class="seg-stamp alarm">× ${esc(text.alarmTag)}</span>`;
          }
        } else if (selectedSteps.has(id)) {
          cls += " selected";
          slashed = true;
          stamp = `<span class="seg-stamp flagged">${esc(text.markedTag)}</span>`;
          if (light && !round.cleanClaim) drawer = choiceDrawerHtml(round, id);
        }

        const speaker = seg.speaker || (zh ? "友" : "F");
        const showAvatar = idx === 0 || (seg.speaker && seg.speaker !== prevSpeaker);
        const showSpeakerName = !!(seg.speaker && seg.speaker !== prevSpeaker);
        prevSpeaker = speaker;
        const avatarChar = String(speaker).trim().slice(0, 1) || (zh ? "友" : "F");
        const avatarHtml = `<span class="chat-avatar${showAvatar ? "" : " spacer"}" aria-hidden="true">${esc(avatarChar)}</span>`;
        const bubbleInner = `
          ${showSpeakerName ? `<span class="chat-speaker">${esc(seg.speaker)}</span>` : ""}
          <span class="seg-body"><span class="seg-text">${esc(seg.text)}${slashed ? inkSlashSvg(id) : ""}</span>${stamp ? `<span class="chat-bubble-meta">${stamp}</span>` : ""}</span>`;

        if (debrief) {
          return `<li class="${cls}" data-seg-item="${id}">
            <div class="chat-row seg-static">${avatarHtml}<div class="chat-bubble">${bubbleInner}</div></div>
          </li>`;
        }
        return `<li class="${cls}" data-seg-item="${id}">
          <button type="button" class="chat-row seg-btn" data-seg="${id}" aria-pressed="${selectedSteps.has(id) ? "true" : "false"}">
            ${avatarHtml}
            <span class="chat-bubble">${bubbleInner}</span>
          </button>
          ${drawer}
        </li>`;
      }).join("");

      return `
        ${!isOpenerRound(round) && round.problem ? `<p class="evidence-brief">${esc(round.problem)}</p>` : ""}
        <div class="evidence-chat"><ol class="segments segments-chat">${items}</ol></div>
        ${!isOpenerRound(round) && round.final_answer ? `<div class="evidence-conclusion"><span class="evidence-conclusion-label">${esc(text.finalAnswer)}</span>${esc(round.final_answer)}</div>` : ""}`;
    }

    const isCode = kind === "code";
    const items = segs.map((seg) => {
      const id = seg.id;
      let cls = "seg-item";
      let stamp = "";
      let drawer = "";
      let slashed = false;

      if (debrief) {
        if (hitSteps.has(id)) {
          cls += " seg-hit";
          slashed = true;
          stamp = `<span class="seg-stamp hit">✓ ${esc(text.hitTag)}</span>`;
        } else if (missedSteps.has(id)) {
          cls += " seg-missed";
          slashed = true;
          stamp = `<span class="seg-stamp missed">! ${esc(text.missedTag)}</span>`;
        } else if (alarmSteps.has(id)) {
          cls += " seg-alarm";
          stamp = `<span class="seg-stamp alarm">× ${esc(text.alarmTag)}</span>`;
        }
      } else if (selectedSteps.has(id)) {
        cls += " selected";
        slashed = true;
        stamp = `<span class="seg-stamp flagged">${esc(text.markedTag)}</span>`;
        if (light && !round.cleanClaim) drawer = choiceDrawerHtml(round, id);
      }

      const labelText = (isCode || kind === "math")
        ? String(id).padStart(2, "0")
        : (seg.label || String(id).padStart(2, "0"));
      const bodyHtml = isCode ? `<code>${esc(seg.text)}</code>` : esc(seg.text);
      const rowInner = `
        <span class="seg-label">${esc(labelText)}</span>
        <span class="seg-body">${bodyHtml}${slashed ? inkSlashSvg(id) : ""}</span>
        ${stamp}`;

      if (debrief) {
        return `<li class="${cls}" data-seg-item="${id}"><div class="seg-static">${rowInner}</div></li>`;
      }
      return `<li class="${cls}" data-seg-item="${id}">
        <button type="button" class="seg-btn" data-seg="${id}" aria-pressed="${selectedSteps.has(id) ? "true" : "false"}">${rowInner}</button>
        ${drawer}
      </li>`;
    }).join("");

    if (isCode) {
      const langLabel = round.code_language || "code";
      const linesLabel = zh ? `${segs.length} 行` : `${segs.length} lines`;
      return `
        ${round.problem ? `<p class="evidence-brief">${esc(round.problem)}</p>` : ""}
        <div class="evidence-code">
          <div class="code-bar"><span>${esc(langLabel)}</span><span>${esc(linesLabel)}</span></div>
          <ol class="segments segments-code">${items}</ol>
        </div>
        ${round.final_answer ? `<div class="evidence-conclusion"><span class="evidence-conclusion-label">${esc(text.finalAnswer)}</span>${esc(round.final_answer)}</div>` : ""}`;
    }

    return `
      <div class="evidence-block ${kind === "math" ? "evidence-math" : ""}">
        ${round.problem ? `<p class="evidence-brief">${esc(round.problem)}</p>` : ""}
        <div class="evidence-paper">
          <ol class="segments segments-prose">${items}</ol>
        </div>
        ${round.final_answer ? `<div class="evidence-conclusion"><span class="evidence-conclusion-label">${esc(text.finalAnswer)}</span>${esc(round.final_answer)}</div>` : ""}
      </div>`;
  }

  function roundHtml() {
    const round = state.round;
    const debrief = round.debrief;
    const blind = round.mode === "blind" && !debrief;
    const kind = evidenceKind(round);
    const segs = normalizeSegments(round);
    const light = !debrief && isLightPlay(round);
    const dailyIndex = dailyIds().indexOf(round.worksheet_id);
    const kindLabel = text.evidenceKinds[kind] || domainLabel(round.domain || "math");
    const dossierPrefix = dailyIndex >= 0
      ? (zh ? `第 ${dailyIndex + 1} 题 · ${kindLabel}` : `0${dailyIndex + 1} · ${kindLabel}`)
      : kindLabel;

    const selectedSteps = new Set((round.selections || []).map((s) => s.step));
    const hitSteps = new Set((debrief && debrief.errors || []).filter((e) => e.found).map((e) => e.step));
    const missedSteps = new Set((debrief && debrief.errors || []).filter((e) => !e.found).map((e) => e.step));
    const alarmSteps = new Set((debrief && debrief.false_alarm_details || []).map((a) => a.step));

    const evidenceHtml = renderEvidenceHtml(round, segs, {
      kind, debrief, light, selectedSteps, hitSteps, missedSteps, alarmSteps,
    });
    const afterSheet = debrief
      ? debriefHtml(debrief)
      : (light ? playDockHtml(round) : composerHtml(round));

    return `
      <div class="play-stage">
        <div class="dossier-head">
          <span class="dossier-id">
            <span>${esc(dossierPrefix)}</span>
            <span aria-hidden="true">·</span>
            <span class="dossier-title">${esc(round.title)}</span>
          </span>
          ${blind ? `<span class="dossier-tag">${esc(text.blindPill)}</span>` : ""}
        </div>
        ${!debrief && state.error && !light ? `<p class="error" role="alert">${esc(state.error)}</p>` : ""}
        ${evidenceHtml}
        ${afterSheet}
      </div>`;
  }

  function composerHtml(round) {
    const canLight = hasLightChoices(round);
    const body = textComposerBody(round);
    return `
      <aside class="panel">
        <div class="panel-head">
          <h2>${esc(text.panelTitle)}</h2>
          ${canLight ? `<button type="button" class="linkish" data-input-mode="light">${esc(text.backToTap)}</button>` : ""}
        </div>
        ${body}
        ${round.hintText ? `<p class="hint" role="status">${esc(round.hintText)}</p>` : ""}
        <div class="actions">
          <button class="btn primary-cta" type="button" data-act="submit" ${state.busy ? "disabled" : ""}>${esc(text.submitText)}</button>
          <button class="btn secondary" type="button" data-act="hint" ${state.busy ? "disabled" : ""}>${esc(text.hintBtn)}</button>
          <button class="btn ghost" type="button" data-act="reveal" ${state.busy ? "disabled" : ""}>${esc(text.reveal)}</button>
        </div>
      </aside>`;
  }

  function textComposerBody(round) {
    const mathTools = (round.renderer || "math") === "math" ? `
      <p class="small-muted">${zh ? "点入输入框可快捷插入符号，公式用 $…$ 包围。" : "Focus an input to insert symbols; wrap formulas in $…$."}</p>
      <div class="symbols">${[["分数 / frac", "\\frac{a}{b}"], ["√", "\\sqrt{x}"], ["x²", "x^{2}"], ["x₁", "x_{1}"], ["d/dx", "\\frac{d}{dx}"], ["∫", "\\int_{a}^{b}"], ["α", "\\alpha"], ["θ", "\\theta"], ["π", "\\pi"]].map(([label, value]) => `<button type="button" data-symbol="${esc(value)}">${esc(label)}</button>`).join("")}</div>
      <div id="math-preview" aria-live="polite"></div>` : "";
    return `
      <p class="small-muted">${zh ? "定位、诊断、修正各 1 分；误报影响准确度并扣 1 分。" : "Locate, diagnose, and fix: 1 pt each. False alarms lower accuracy (−1)."}</p>
      ${findingRows(round)}
      <button class="btn secondary small" type="button" id="add-finding">${zh ? "+ 添加一处" : "+ Add finding"}</button>
      ${mathTools}
      <textarea id="findings" hidden>${esc(round.findings || "")}</textarea>`;
  }

  function findingRows(round) {
    if (!round.rows) {
      const parsed = RedPenGrade.parseFindings(round.findings || "");
      round.rows = parsed.items.length
        ? parsed.items.map((r) => ({ step: String(r.step || 1), wrong: r.wrong, fix: r.fix }))
        : [{ step: "", wrong: "", fix: "" }];
    }
    const segs = normalizeSegments(round);
    return round.rows.map((row, i) => `
      <fieldset class="finding-row" data-row="${i}">
        <legend>${zh ? "发现" : "Finding"} ${i + 1}</legend>
        <label>${zh ? "位置（定位）" : "Segment (locate)"}
          <select data-field="step">
            <option value="">${zh ? "请选择" : "Choose segment"}</option>
            <option value="clean" ${row.step === "clean" ? "selected" : ""}>${zh ? "本题无错" : "No errors found"}</option>
            ${segs.map((s) => `<option value="${s.id}" ${String(row.step) === String(s.id) ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
          </select>
        </label>
        <label>${zh ? "错在哪里（诊断）" : "What's wrong (diagnosis)"}
          <textarea data-field="wrong" ${row.step === "clean" ? "disabled" : ""} placeholder="${zh ? "说明违反了哪条规则或事实" : "Which rule or fact fails?"}">${esc(row.wrong)}</textarea>
        </label>
        <label>${zh ? "怎么改（修正）" : "Fix (correction)"}
          <textarea data-field="fix" ${row.step === "clean" ? "disabled" : ""} placeholder="${zh ? "写出正确步骤或改法" : "Write the corrected version"}">${esc(row.fix)}</textarea>
        </label>
        <button type="button" class="linkish small-link" data-remove="${i}">${zh ? "删除" : "Remove"}</button>
      </fieldset>`).join("");
  }

  function syncRows() {
    const r = state.round;
    if (!r || !r.rows) return;
    const active = r.rows.filter((row) => row.step);
    r.findings = active.map((row) =>
      row.step === "clean" ? "No errors found." : `Step ${row.step}\nWhat's wrong: ${row.wrong}\nFix: ${row.fix}`
    ).join("\n\n");
    const hidden = document.getElementById("findings");
    if (hidden) hidden.value = r.findings;
    persistActive();
    remember(r.server ? r.id : r.worksheet_id + (r.mode === "blind" ? ":blind" : ""), r.findings);
    const preview = document.getElementById("math-preview");
    if (preview) {
      preview.textContent = active.map((row) => row.wrong + "\n" + row.fix).join("\n");
      typeset(preview);
    }
  }

  function calcAccuracy(debrief) {
    if (debrief.revealed) return 0;
    if (debrief.planted === 0) return debrief.false_alarms === 0 ? 100 : 0;
    const totalFlags = debrief.found + debrief.false_alarms;
    if (totalFlags === 0) return 0;
    return Math.round((100 * debrief.found) / totalFlags);
  }

  function nextPuzzleTarget() {
    const doneToday = todayResults();
    const nextDaily = state.daily.find((item) => !doneToday[item.id] && (!state.round || item.id !== state.round.worksheet_id));
    if (nextDaily) {
      const idx = state.daily.findIndex((item) => item.id === nextDaily.id) + 1;
      return { entry: nextDaily, isDaily: true, label: text.nextDaily(idx, state.daily.length) };
    }
    const solved = solvedIds();
    const currentId = state.round ? state.round.worksheet_id : "";
    const sameDomain = state.round
      ? state.worksheets.find((w) => w.domain === state.round.domain && !solved.has(w.id) && w.id !== currentId)
      : null;
    const anyUnsolved = state.worksheets.find((w) => !solved.has(w.id) && w.id !== currentId);
    const currentIdx = state.worksheets.findIndex((w) => w.id === currentId);
    const wrapped = state.worksheets[(currentIdx + 1) % Math.max(1, state.worksheets.length)];
    const chosen = sameDomain || anyUnsolved || wrapped;
    return {
      entry: chosen,
      isDaily: false,
      label: isDailyComplete() ? text.keepPlaying : text.nextPuzzle,
    };
  }


  function debriefHtml(debrief) {
    const round = state.round;
    const score = debrief.revealed ? text.revealed : `${debrief.score}/100`;
    const tone = debrief.revealed ? "" : debrief.score >= 80 ? "good" : debrief.score >= 50 ? "mid" : "low";
    const acc = calcAccuracy(debrief);
    const nextInfo = nextPuzzleTarget();
    const dailyComplete = isDailyComplete();
    const inDaily = dailyIds().includes(round.worksheet_id);
    const celebrate = celebrateCopy(debrief);
    const missClass = (!debrief.revealed && debrief.score < 50) ? "is-miss" : "";

    const primaryCta = nextInfo && nextInfo.entry
      ? `<button class="btn next-btn" type="button" data-next-id="${esc(nextInfo.entry.id)}">${esc(nextInfo.label)}</button>`
      : "";

    const sep = zh ? "：" : ": ";
    const errors = (debrief.errors || []).map((error) => `
      <article class="debrief-error ${error.found ? "is-hit" : "is-missed"}">
        <div class="debrief-loc">
          <span class="debrief-loc-name">${esc(segmentLabel(round, error.step))}</span>
          <span class="status-chip ${error.found ? "hit" : "missed"}">${error.found ? esc(text.foundDetail(error.diagnosis, error.fix)) : esc(text.missedTag)}</span>
        </div>
        <p class="debrief-punch">${esc(error.why_wrong)}</p>
        <p class="debrief-line"><strong>${esc(text.theFix)}${sep}</strong>${esc(error.correct)}</p>
        <p class="debrief-rule">${esc(text.catchRule)}${sep}${esc(error.catch_rule)}</p>
      </article>`).join("");

    const alarms = (debrief.false_alarm_details || []).map((alarm) =>
      `<li>${esc(text.alarmItem(segmentLabel(round, alarm.step), alarm.why_correct || ""))}</li>`
    ).join("");
    const bounties = (debrief.bounty_details || []).map((b) =>
      `<li>${esc(text.alarmItem(segmentLabel(round, b.step), b.description || ""))}</li>`
    ).join("");
    const clean = (debrief.clean_steps || []).map((step) => `<li>${esc(step)}</li>`).join("");
    const practice = (debrief.errors || []).map((error) => `<li>${esc(error.practice_problem)}</li>`).join("");
    const practiceAnswers = (debrief.errors || []).map((error) => `<li>${esc(error.practice_answer)}</li>`).join("");
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

    const showDailyDocket = dailyComplete && inDaily;
    const showSingleDocket = !inDaily;
    const docketHtml = showDailyDocket
      ? shareCardVisualHtml({ kind: "daily" })
      : showSingleDocket
        ? shareCardVisualHtml({ kind: "single" })
        : "";

    return `
      <section class="results-stage ${missClass}" aria-live="polite">
        <div class="verdict-head">
          <div class="verdict-stamp-row">
            <p class="celebrate ${tone}">${esc(celebrate)}</p>
          </div>
          <div class="score-stamp">
            <p class="score ${tone}">${esc(score)}</p>
            ${!debrief.revealed ? `<span class="accuracy-pill">${esc(text.accuracy(acc))}</span>` : ""}
          </div>
        </div>
        <div class="debrief-list">
          ${errors || (debrief.planted === 0 ? `<p class="clean-msg">${text.cleanRound}</p>` : "")}
        </div>
        ${bounties ? `<h3 class="sub-head">${zh ? "额外发现" : "Bounties"}</h3><ul class="alarm-list">${bounties}</ul>` : ""}
        ${alarms ? `<h3 class="sub-head">${esc(text.falseAlarms)}</h3><ul class="alarm-list">${alarms}</ul>` : ""}
        ${docketHtml}
        ${state.shareMessage ? `<p class="share-status" role="status">${esc(state.shareMessage)}</p>` : ""}
        ${state.shareText ? `<div class="share-preview"><p class="small-muted">${esc(text.copyFallback)}</p><pre>${esc(state.shareText)}</pre></div>` : ""}
        <div class="next-bar">
          ${primaryCta}
        </div>
        <details class="more-details" ${round.ai ? "open" : ""}>
          <summary>${esc(text.moreDetails)}</summary>
          <div class="clean">
            <h3>${esc(text.cleanTitle)}</h3>
            <ol>${clean}</ol>
            <p><strong>${esc(text.finalAnswer)}:</strong> ${esc(debrief.clean_final_answer || "")}</p>
          </div>
          ${practice ? `<h3>${esc(text.practice)}</h3><ol class="practice-list">${practice}</ol>
            <details><summary>${esc(text.practiceAnswers)}</summary><ol class="practice-list">${practiceAnswers}</ol></details>` : ""}
          <p class="breakdown">${esc(who)} ${esc(hashLine)}</p>
          <div class="sheet-meta">
            <span>${esc(text.commitment(round.commitment_short || debrief.commitment_short || ""))} · ${esc(round.verified || "")}</span>
            <button class="linkish small-link" type="button" data-act="verify" ${state.busy ? "disabled" : ""}>${esc(text.verifyBtn)}</button>
          </div>
          ${round.verifyText ? `<p class="verify-status" role="status">${esc(round.verifyText)}</p>` : ""}
          <button class="btn secondary small" type="button" data-act="ai" ${state.busy ? "disabled" : ""}>${esc(text.aiCompare)}</button>
          ${round.ai ? `<p class="small-muted">${zh ? "AI 得分" : "AI score"}: ${esc(round.ai.debrief.score)}/100 · ${zh ? "你的得分" : "Your score"}: ${esc(debrief.score)}/100</p><pre>${esc(round.ai.findings)}</pre>` : ""}
        </details>
      </section>`;
  }

  function toggleSegment(stepNum) {
    const r = state.round;
    if (!r || r.graded) return;
    if (r.inputMode === "light" && hasLightChoices(r)) {
      r.cleanClaim = false;
      const idx = (r.selections || []).findIndex((s) => s.step === stepNum);
      if (idx >= 0) {
        r.selections.splice(idx, 1);
      } else {
        r.selections.push({ step: stepNum, diagnosis_id: "", fix_id: "", diagnosis_label: "" });
        state.justFlagged = stepNum;
      }
      render();
      return;
    }
    // Free-text mode helper: tapping a segment selects or appends a finding row for that step.
    if (!r.rows) r.rows = [{ step: "", wrong: "", fix: "" }];
    const emptyRow = r.rows.find((row) => !row.step);
    const existing = r.rows.find((row) => String(row.step) === String(stepNum));
    if (existing) {
      // Focus its textarea after render.
    } else if (emptyRow) {
      emptyRow.step = String(stepNum);
    } else {
      r.rows.push({ step: String(stepNum), wrong: "", fix: "" });
    }
    syncRows();
    render();
  }

  function bind() {
    // Daily strip buttons
    app.querySelectorAll("[data-daily-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const entry = state.byId.get(btn.dataset.dailyId);
        if (!entry) return;
        state.busy = true;
        render();
        await startEntry(entry, false, true);
        state.busy = false;
        render();
      });
    });

    // Pack filters & cards
    app.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.packFilter = btn.dataset.filter;
        render();
      });
    });
    app.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => begin({ worksheet_id: btn.dataset.id }));
    });
    app.querySelectorAll("[data-blind]").forEach((btn) => {
      btn.addEventListener("click", () => begin({ blind: true }));
    });
    app.querySelectorAll("[data-next-id]").forEach((btn) => {
      btn.addEventListener("click", () => begin({ worksheet_id: btn.dataset.nextId }));
    });

    // Inline navigation links (e.g. Back to Daily from Packs/Workshop)
    app.querySelectorAll("[data-nav-inline]").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.navInline));
    });

    // Share & docket image save buttons
    app.querySelectorAll("[data-share-daily]").forEach((btn) => {
      btn.addEventListener("click", () => copyShareCard(true));
    });
    app.querySelectorAll("[data-share-single]").forEach((btn) => {
      btn.addEventListener("click", () => copyShareCard(false));
    });
    app.querySelectorAll("[data-save-docket]").forEach((btn) => {
      btn.addEventListener("click", () => saveDocketImage());
    });

    // Tap-to-flag segments
    app.querySelectorAll("button.seg-btn[data-seg]").forEach((btn) => {
      btn.addEventListener("click", () => toggleSegment(Number(btn.dataset.seg)));
    });

    // Input mode switch
    app.querySelectorAll("[data-input-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state.round || state.round.graded) return;
        state.round.inputMode = btn.dataset.inputMode;
        render();
      });
    });

    // Light mode controls
    const toggleClean = app.querySelector("[data-act=toggle-clean]");
    if (toggleClean) {
      toggleClean.addEventListener("click", () => {
        if (!state.round || state.round.graded) return;
        state.round.cleanClaim = !state.round.cleanClaim;
        if (state.round.cleanClaim) state.round.selections = [];
        render();
      });
    }
    app.querySelectorAll("[data-unflag]").forEach((btn) => {
      btn.addEventListener("click", () => toggleSegment(Number(btn.dataset.unflag)));
    });
    app.querySelectorAll("[data-pick-diag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        const sel = (state.round.selections || []).find((s) => s.step === step);
        if (!sel) return;
        sel.diagnosis_id = btn.dataset.pickDiag;
        const labelEl = btn.querySelector(".choice-text");
        sel.diagnosis_label = (labelEl || btn).textContent.trim();
        state.justPicked = { step, kind: "diag", id: sel.diagnosis_id };
        render();
      });
    });
    app.querySelectorAll("[data-pick-fix]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = Number(btn.dataset.step);
        const sel = (state.round.selections || []).find((s) => s.step === step);
        if (!sel) return;
        sel.fix_id = btn.dataset.pickFix;
        state.justPicked = { step, kind: "fix", id: sel.fix_id };
        render();
      });
    });

    // Free-text mode controls
    let target = null;
    app.querySelectorAll("[data-row]").forEach((el) => {
      el.querySelectorAll("[data-field]").forEach((input) => {
        input.onfocus = () => { if (input.tagName === "TEXTAREA") target = input; };
        input.oninput = () => {
          state.round.rows[Number(el.dataset.row)][input.dataset.field] = input.value;
          if (input.dataset.field === "step") {
            el.querySelectorAll("textarea").forEach((t) => { t.disabled = input.value === "clean"; });
          }
          syncRows();
        };
      });
    });
    app.querySelectorAll("[data-symbol]").forEach((b) => {
      b.onclick = () => {
        if (!target || target.disabled) target = app.querySelector("[data-field=fix]:not(:disabled)");
        if (!target) return;
        const symbol = "$" + b.dataset.symbol + "$";
        target.setRangeText(symbol, target.selectionStart, target.selectionEnd, "end");
        target.dispatchEvent(new Event("input"));
        target.focus();
      };
    });
    app.querySelectorAll("[data-remove]").forEach((b) => {
      b.onclick = () => {
        state.round.rows.splice(Number(b.dataset.remove), 1);
        syncRows();
        render();
      };
    });
    const add = document.getElementById("add-finding");
    if (add) add.onclick = () => { state.round.rows.push({ step: "", wrong: "", fix: "" }); render(); };

    // Actions
    const settings = document.getElementById("ai-settings");
    if (settings) settings.onclick = showSettings;
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
    if (submit) submit.addEventListener("click", () => submitRound());
    const hint = app.querySelector("[data-act=hint]");
    if (hint) hint.addEventListener("click", () => takeHint());
    const reveal = app.querySelector("[data-act=reveal]");
    if (reveal) reveal.addEventListener("click", () => revealKey());
    const verify = app.querySelector("[data-act=verify]");
    if (verify) verify.onclick = verifyRound;
    const ai = app.querySelector("[data-act=ai]");
    if (ai) ai.onclick = compareAI;

    const file = document.getElementById("problem-file");
    if (file) {
      file.onchange = async () => {
        if (file.files[0]) {
          if (file.files[0].size > 16000) {
            state.error = zh ? "文件过大，最多 16KB" : "File too large; maximum 16KB";
            render();
            return;
          }
          const uploaded = await file.files[0].text();
          if (uploaded.length > 4000) {
            state.error = zh ? "题目最多 4000 字符，请缩短后重试。" : "Problem text exceeds 4000 characters; shorten it and retry.";
            render();
            return;
          }
          document.querySelector("[name=topic]").value = uploaded;
        }
      };
    }
    const form = document.getElementById("live-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const selectedFocus = data.getAll("focus").map(String);
        const focus = selectedFocus.length ? selectedFocus : weakSpots();
        startLive(String(data.get("topic") || ""), String(data.get("level") || "2"), {
          difficulty: String(data.get("difficulty") || "standard"),
          answer: String(data.get("answer") || ""),
          focus,
        });
      });
    }
  }

  async function copyShareCard(daily) {
    const baseUrl = location.origin && location.origin !== "null"
      ? location.origin + pageDir()
      : (zh ? "https://xmtom111.github.io/redpen/zh/" : "https://xmtom111.github.io/redpen/");
    let cardText;
    if (daily) {
      const ds = dailyState();
      cardText = RedPenDaily.formatShareCard({
        locale,
        dateStr: state.dateStr,
        dailyItems: state.daily,
        dayResults: todayResults(),
        streak: RedPenDaily.currentStreak(ds, state.dateStr),
        url: baseUrl,
      });
    } else if (state.round && state.round.debrief) {
      cardText = RedPenDaily.formatSingleShareCard({
        locale,
        domain: state.round.domain || "math",
        title: state.round.title,
        debrief: state.round.debrief,
        elapsedSec: elapsedSeconds(state.round),
        url: baseUrl,
      });
    } else {
      return;
    }
    state.shareText = cardText;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cardText);
        state.shareMessage = text.copied;
      } else {
        state.shareMessage = text.copyFallback;
      }
    } catch (_) {
      state.shareMessage = text.copyFallback;
    }
    render();
  }

  async function begin(body) {
    state.error = "";
    state.shareMessage = "";
    state.shareText = "";
    if (body.blind) {
      if (state.kind === "server") {
        state.busy = true;
        render();
        await startEntry(null, true, true);
        state.busy = false;
        render();
        return;
      }
      const pool = state.worksheets.filter((entry) => entry.level <= 2);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (picked) openStatic(picked, true, true);
      render();
      window.scrollTo(0, 0);
      return;
    }
    const entry = state.byId.get(body.worksheet_id);
    if (!entry) return;
    if (state.kind === "server") {
      state.busy = true;
      render();
      await startEntry(entry, false, true);
      state.busy = false;
      render();
      window.scrollTo(0, 0);
      return;
    }
    openStatic(entry, false, true);
    render();
    window.scrollTo(0, 0);
  }

  async function protocol() {
    const response = await fetch(apiPath("protocol.txt"));
    if (!response.ok) throw Error("Missing AI protocol");
    return response.text();
  }

  function showSettings() {
    const config = RedPenAI.settings();
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form method="dialog"><h2>${zh ? "AI 模型设置" : "AI model settings"}</h2>
      <p>${zh ? "Key 仅存于当前浏览器；请求直达所选平台，可能收费。部分接口限制浏览器跨域调用。" : "Key stays in this browser. Requests go directly to the provider and may incur charges. Some endpoints block browser CORS."}</p>
      <label>${zh ? "平台" : "Provider"}<select id="provider">${Object.keys(RedPenAI.providers).map((p) => `<option>${p}</option>`).join("")}</select></label>
      <label>Base URL<input id="base" required value="${esc(config.base || RedPenAI.providers.OpenAI[0])}"></label>
      <label>${zh ? "模型（可修改）" : "Model (editable)"}<input id="model" required value="${esc(config.model || "o3")}"></label>
      <label>API Key<input id="key" type="password" autocomplete="off" required value="${esc(config.key || "")}"></label>
      <p role="alert" id="settings-error"></p>
      <button type="button" id="save">${zh ? "保存" : "Save"}</button>
      <button type="button" id="clear">${zh ? "清除 Key" : "Clear key"}</button>
      <button>${zh ? "关闭" : "Close"}</button></form>`;
    document.body.append(dialog);
    dialog.querySelector("#provider").value = config.provider || "OpenAI";
    dialog.querySelector("#provider").onchange = (e) => {
      const [base, model] = RedPenAI.providers[e.target.value];
      dialog.querySelector("#base").value = base;
      dialog.querySelector("#model").value = model;
    };
    dialog.querySelector("#save").onclick = () => {
      try {
        RedPenAI.save(Object.fromEntries(["provider", "base", "model", "key"].map((k) => [k, dialog.querySelector("#" + k).value.trim()])));
        dialog.close();
      } catch (e) { dialog.querySelector("#settings-error").textContent = e.message; }
    };
    dialog.querySelector("#clear").onclick = () => { localStorage.removeItem("redpen:ai"); dialog.querySelector("#key").value = ""; };
    dialog.onclose = () => dialog.remove();
    dialog.showModal();
  }

  async function startLive(topic, level, options = { difficulty: "standard", focus: [], answer: "" }) {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      if (RedPenAI.settings().key || state.kind === "static" || !state.live) {
        const chosen = level === "blind" ? [0, 1, 1, 2, 2][Math.floor(Math.random() * 5)] : Number(level);
        const task = `MODE: CLI-SETTER\nTopic or problem: ${topic}\nError level: ${chosen}\nDifficulty: ${options.difficulty}\nFocus categories: ${options.focus.join(", ")}\nReference answer: ${options.answer || "none"}\nLanguage: ${locale}\nReturn JSON only. Corrupted fields must exactly match visible steps.`;
        const draft = await RedPenAI.checkedRequest(task, await protocol(), (value) => RedPenAI.validate(value, chosen));
        const commitment = await RedPenAI.hash(draft.key);
        state.round = initRoundState({
          ...draft,
          id: crypto.randomUUID(),
          worksheet_id: "browser-live",
          domain: "math",
          renderer: "math",
          estimated_seconds: 90,
          topic,
          lang: locale,
          mode: level,
          level: level === "blind" ? null : chosen,
          level_name: zh ? ["无错", "隐蔽", "轻微", "混杂", "胡来"][chosen] : RedPenGrade.LEVELS[chosen],
          commitment,
          commitment_short: commitment.slice(0, 12),
          hints_used: 0,
          graded: false,
          live: true,
          browserLive: true,
          inputMode: "text",
          secret: { key: draft.key },
          verified: zh ? "模型生成，未经 SymPy 验算" : "Model generated; not SymPy checked",
        });
        delete state.round.key;
        state.view = "play";
        location.hash = "";
        return;
      }
      const round = await api(apiPath("api/live"), { topic, level, ...options, lang: locale });
      adoptServerRound(round);
      location.hash = "r=" + round.id;
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      if (state.round && state.round.graded) state.justGraded = true;
      render();
    }
  }

  function currentFindings() {
    const box = document.getElementById("findings");
    return box ? box.value : (state.round.findings || "");
  }

  async function submitRound() {
    const r = state.round;
    if (!r || r.graded) return;
    if (isLightPlay(r)) {
      const selections = (r.selections || []).slice();
      if (!r.cleanClaim && !selections.length) {
        if (!window.confirm(text.confirmEmpty)) return;
        r.cleanClaim = true;
      } else if (!lightReady(r)) {
        state.error = text.needPicks;
        render();
        const drawer = app && app.querySelector(".choice-drawer");
        if (drawer && drawer.scrollIntoView) drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      await grade("submit", { mode: "light", selections, clean_claim: !!r.cleanClaim });
      return;
    }
    if (r.rows && (r.rows.some((row) => !row.step && (row.wrong || row.fix)) ||
      (r.rows.some((row) => row.step === "clean") && r.rows.some((row) => row.step && row.step !== "clean")))) {
      state.error = zh ? "请选择位置；「本题无错」不能与报错同时提交。" : "Choose a segment. A clean claim cannot be combined with flaw findings.";
      render();
      return;
    }
    const findings = currentFindings();
    const empty = RedPenGrade.parseFindings(findings).clean_claim;
    if (empty && !window.confirm(text.confirmEmpty)) return;
    await grade("submit", { mode: "text", findings });
  }

  async function revealKey() {
    if (!window.confirm(text.confirmReveal)) return;
    await grade("reveal", null);
  }

  async function grade(action, payload) {
    if (state.busy) return;
    if (action === "submit" && payload && payload.mode === "text") {
      state.round.findings = payload.findings;
    }
    state.busy = true;
    state.error = "";
    render();
    try {
      const elapsed = elapsedSeconds(state.round);
      if (state.round.server) {
        const path = apiPath(`api/rounds/${state.round.id}/${action}`);
        let body = {};
        if (action === "submit") {
          body = payload.mode === "light"
            ? { mode: "light", selections: payload.selections, clean_claim: payload.clean_claim }
            : { findings: payload.findings };
        }
        state.round.debrief = await api(path, body);
        state.round.graded = true;
      } else if (action === "submit") {
        state.round.debrief = await staticDebrief(payload, false);
        state.round.graded = true;
      } else {
        state.round.debrief = await staticDebrief(null, true);
        state.round.graded = true;
      }
      state.round.elapsedSec = elapsed;
      state.justGraded = true;
      saveHistory(state.round);
      RedPenDaily.recordDailyResult(
        locale,
        state.dateStr,
        dailyIds(),
        state.round.worksheet_id,
        { ...state.round.debrief, elapsedSec: elapsed, domain: state.round.domain || "math" }
      );
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  function history() {
    try { return JSON.parse(localStorage.getItem("redpen:history") || "[]"); } catch (_) { return []; }
  }

  function saveHistory(round) {
    const rows = history().filter((r) => r.id !== round.id);
    rows.push({
      id: round.id,
      worksheet_id: round.worksheet_id,
      domain: round.domain || "math",
      date: new Date().toISOString(),
      title: round.title,
      ...round.debrief,
    });
    try { localStorage.setItem("redpen:history", JSON.stringify(rows.slice(-200))); } catch (_) {}
  }

  function categoryStats() {
    const stats = {};
    for (const row of history()) {
      for (const e of row.errors || []) {
        const item = stats[e.category] ||= { total: 0, found: 0 };
        item.total += 1;
        if (e.found) item.found += 1;
      }
    }
    return Object.entries(stats).sort((a, b) => (a[1].found / a[1].total) - (b[1].found / b[1].total));
  }

  function weakSpots() {
    return categoryStats().filter(([, v]) => v.found < v.total).slice(0, 3).map(([k]) => k);
  }

  function statsHtml() {
    const rows = history();
    const catRows = categoryStats();
    return `<section class="panel stats-box">
      <h2>${zh ? "本机练习记录与薄弱项" : "Local history & weak spots"}</h2>
      <p class="small-muted">${zh ? "本浏览器已完成" : "Completed in this browser"}: <strong>${rows.length}</strong></p>
      ${catRows.length ? `<table><thead><tr><th>${zh ? "类别" : "Category"}</th><th>${zh ? "命中 / 遇到" : "Hits / seen"}</th></tr></thead><tbody>${catRows.map(([k, v]) => `<tr><td>${esc(categoryLabel(k))}</td><td>${v.found}/${v.total}</td></tr>`).join("")}</tbody></table>` : ""}
      ${rows.slice(-5).reverse().map((r) => `<p class="small-muted">${esc(r.title)} · ${r.revealed ? esc(text.revealed) : esc(r.score) + "/100"}</p>`).join("")}
      <p class="small-muted">${zh ? "记录仅保存在当前浏览器。" : "History is stored only in this browser."}</p>
    </section>`;
  }

  async function verifyRound() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const r = state.round;
      if (r.server) {
        const result = await api(apiPath(`api/rounds/${r.id}/verify`), {});
        r.verifyText = (result.commitment_ok ? text.hashOk(r.commitment_short) : text.hashBad) + " " + result.checks;
      } else {
        const secret = await ensureSecret();
        r.verifyText = (await hashMatches(secret.key, r.commitment) ? text.hashOk(r.commitment_short) : text.hashBad)
          + (zh ? " 浏览器不执行 SymPy 验算。" : " Browser does not run SymPy checks.");
      }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function compareAI() {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      const r = state.round;
      if (r.server && !RedPenAI.settings().key) {
        r.ai = await api(apiPath(`api/rounds/${r.id}/ai`), {});
      } else {
        const visible = { title: r.title, problem: r.problem, steps: r.steps, final_answer: r.final_answer };
        const rules = await protocol();
        const findings = await RedPenAI.request(`MODE: CLI-HUNTER\nWORKSHEET: ${JSON.stringify(visible)}\nLanguage: ${locale}`, rules, false);
        let entry;
        if (r.server) {
          entry = {
            ...r,
            level: r.debrief.level,
            key: {
              level: r.debrief.level,
              clean_steps: r.debrief.clean_steps,
              clean_final_answer: r.debrief.clean_final_answer,
              errors: r.debrief.errors.map((e) => ({
                step: e.step, category: e.category, original: e.correct, corrupted: e.shown,
                why_wrong: e.why_wrong, why_tempting: e.why_tempting, catch_rule: e.catch_rule,
                practice: { problem: e.practice_problem, answer: e.practice_answer },
              })),
            },
          };
        } else {
          entry = staticEntry(await ensureSecret());
        }
        const g = RedPenAI.validateGrade(
          await RedPenAI.request(`MODE: CLI-GRADER\nWORKSHEET: ${JSON.stringify(visible)}\nANSWER KEY: ${JSON.stringify(entry.key)}\nSTUDENT FINDINGS: ${findings}\nLanguage: ${locale}`, rules),
          entry.key.errors.length
        );
        r.ai = { findings, debrief: RedPenGrade.buildDebrief(entry, r.mode, 0, g, false, "model") };
      }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.busy = false;
      render();
    }
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
    if (state.round.browserLive) return { ...state.round, level: secret.key.level, key: secret.key };
    const card = state.byId.get(state.round.worksheet_id);
    return {
      id: card.id,
      domain: card.domain || "math",
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

  async function staticDebrief(payload, revealed) {
    const secret = await ensureSecret();
    const entry = staticEntry(secret);
    let gradeObj;
    if (revealed) {
      gradeObj = RedPenGrade.blankGrade(secret.key.errors.length, entry.lang);
    } else if (state.round.browserLive) {
      gradeObj = RedPenAI.validateGrade(
        await RedPenAI.request(
          `MODE: CLI-GRADER\nWORKSHEET: ${JSON.stringify({ problem: entry.problem, steps: entry.steps, final_answer: entry.final_answer })}\nANSWER KEY: ${JSON.stringify(secret.key)}\nSTUDENT FINDINGS: ${payload.findings}\nLanguage: ${locale}`,
          await protocol()
        ),
        secret.key.errors.length
      );
    } else if (payload && payload.mode === "light") {
      gradeObj = RedPenGrade.gradeSelections(entry, payload.selections, payload.clean_claim);
    } else {
      gradeObj = RedPenGrade.gradeFindings(entry, payload ? payload.findings : "");
    }
    const debrief = RedPenGrade.buildDebrief(
      entry, state.round.mode, state.round.hints_used, gradeObj, revealed,
      revealed ? "reveal" : state.round.browserLive ? "model" : "auto"
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
