/* Deterministic Daily RedPen selector, localStorage streak tracker,
   and Wordle-style spoiler-free share card generator. No backend required. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RedPenDaily = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_DOMAINS = ["logic", "code", "math"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayDateStr(now) {
    const d = now instanceof Date ? now : new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseDateUtc(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
    if (!m) return EPOCH_UTC;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function dayNumber(dateStr) {
    const diff = Math.floor((parseDateUtc(dateStr) - EPOCH_UTC) / DAY_MS);
    return Math.max(1, diff + 1);
  }

  function prevDateStr(dateStr) {
    const utc = parseDateUtc(dateStr) - DAY_MS;
    const d = new Date(utc);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleDeterministic(list, seedStr) {
    const copy = list.slice();
    const rand = mulberry32(fnv1a(seedStr));
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Deterministically pick `count` daily puzzles (default 3) for `dateStr`.
   * Targets logic, code, math in order. Uses per-cycle permutation so puzzles
   * do not repeat back-to-back, and falls back deterministically if any domain
   * has fewer items or is absent.
   */
  function selectDaily(worksheets, dateStr, count = 3) {
    const items = (worksheets || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!items.length) return [];
    const targetCount = Math.min(count, items.length);
    const dayIdx = dayNumber(dateStr) - 1;
    const picked = [];
    const usedIds = new Set();

    for (const domain of DEFAULT_DOMAINS) {
      if (picked.length >= targetCount) break;
      const pool = items.filter((item) => (item.domain || "math") === domain && !usedIds.has(item.id));
      if (!pool.length) continue;
      const cycle = Math.floor(dayIdx / pool.length);
      const offset = dayIdx % pool.length;
      const perm = shuffleDeterministic(pool, `redpen:daily:v1:${domain}:${cycle}`);
      const chosen = perm[offset];
      picked.push(chosen);
      usedIds.add(chosen.id);
    }

    if (picked.length < targetCount) {
      const remaining = items.filter((item) => !usedIds.has(item.id));
      const perm = shuffleDeterministic(remaining, `redpen:daily:v1:fallback:${dateStr}`);
      for (const item of perm) {
        if (picked.length >= targetCount) break;
        picked.push(item);
        usedIds.add(item.id);
      }
    }
    return picked;
  }

  function storageKey(locale) {
    return `redpen:daily:${locale === "zh" ? "zh" : "en"}`;
  }

  function emptyState() {
    return { streak: 0, bestStreak: 0, lastCompletedDate: null, days: {} };
  }

  function loadState(locale, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return emptyState();
    try {
      const raw = JSON.parse(store.getItem(storageKey(locale)) || "null");
      if (!raw || typeof raw !== "object") return emptyState();
      return {
        streak: Number(raw.streak) || 0,
        bestStreak: Number(raw.bestStreak) || 0,
        lastCompletedDate: raw.lastCompletedDate || null,
        days: raw.days && typeof raw.days === "object" ? raw.days : {},
      };
    } catch (_) {
      return emptyState();
    }
  }

  function saveState(locale, state, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return;
    // Prune older days beyond 90 entries to keep localStorage tiny.
    const dayKeys = Object.keys(state.days || {}).sort();
    if (dayKeys.length > 90) {
      for (const old of dayKeys.slice(0, dayKeys.length - 90)) delete state.days[old];
    }
    try {
      store.setItem(storageKey(locale), JSON.stringify(state));
    } catch (_) { /* private mode or quota */ }
  }

  function recordDailyResult(locale, dateStr, dailyIds, puzzleId, result, storage) {
    const state = loadState(locale, storage);
    if (!dailyIds.includes(puzzleId)) return state;
    const day = state.days[dateStr] || { results: {}, completedAt: null };
    day.results[puzzleId] = {
      score: result.score == null ? 0 : result.score,
      found: Number(result.found) || 0,
      planted: Number(result.planted) || 0,
      falseAlarms: Number(result.false_alarms != null ? result.false_alarms : result.falseAlarms) || 0,
      hintsUsed: Number(result.hints_used != null ? result.hints_used : result.hintsUsed) || 0,
      elapsedSec: Math.max(1, Math.round(Number(result.elapsedSec) || 0)),
      domain: result.domain || "math",
      revealed: !!result.revealed,
    };
    const allDone = dailyIds.length > 0 && dailyIds.every((id) => !!day.results[id]);
    if (allDone && !day.completedAt) {
      day.completedAt = new Date().toISOString();
      if (state.lastCompletedDate !== dateStr) {
        if (state.lastCompletedDate === prevDateStr(dateStr)) {
          state.streak = (state.streak || 0) + 1;
        } else {
          state.streak = 1;
        }
        state.bestStreak = Math.max(state.bestStreak || 0, state.streak);
        state.lastCompletedDate = dateStr;
      }
    }
    state.days[dateStr] = day;
    saveState(locale, state, storage);
    return state;
  }

  function currentStreak(state, dateStr) {
    if (!state || !state.lastCompletedDate) return 0;
    if (state.lastCompletedDate === dateStr || state.lastCompletedDate === prevDateStr(dateStr)) {
      return state.streak || 0;
    }
    return 0;
  }

  function formatDuration(seconds, locale) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (locale === "zh") {
      return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
    }
    return mins > 0 ? `${mins}m ${pad2(secs)}s` : `${secs}s`;
  }

  function resultSquare(res) {
    if (!res) return "⬜";
    if (res.revealed) return "🟥";
    if (res.score === 100 && res.falseAlarms === 0) return "🟩";
    if (res.score >= 60) return "🟨";
    return "🟥";
  }

  function domainLabel(domain, locale) {
    const zh = { logic: "逻辑", code: "代码", math: "数学" };
    const en = { logic: "Logic", code: "Code", math: "Math" };
    return (locale === "zh" ? zh : en)[domain] || domain;
  }

  /**
   * Build a Wordle-style spoiler-free share card (never mentions step numbers or flaws).
   */
  function formatShareCard({ locale, dateStr, dailyItems, dayResults, streak, url }) {
    const lang = locale === "zh" ? "zh" : "en";
    const num = dayNumber(dateStr);
    const entries = (dailyItems || []).map((item) => ({
      item,
      res: (dayResults || {})[item.id] || null,
    }));
    const tiles = entries.map(({ item, res }) =>
      `${resultSquare(res)} ${domainLabel(item.domain || "math", lang)}`
    ).join(" · ");

    const completed = entries.filter((e) => e.res);
    const avgScore = completed.length
      ? Math.round(completed.reduce((acc, e) => acc + (e.res.revealed ? 0 : e.res.score), 0) / completed.length)
      : 0;
    const totalFound = completed.reduce((acc, e) => acc + e.res.found, 0);
    const totalPlanted = completed.reduce((acc, e) => acc + e.res.planted, 0);
    const totalAlarms = completed.reduce((acc, e) => acc + e.res.falseAlarms, 0);
    const totalSec = completed.reduce((acc, e) => acc + e.res.elapsedSec, 0);
    const link = url || (lang === "zh" ? "https://xmtom111.github.io/redpen/zh/" : "https://xmtom111.github.io/redpen/");

    if (lang === "zh") {
      const streakPart = streak > 0 ? ` · 🔥 连续 ${streak} 天` : "";
      return [
        `🖍️ 今日红笔 #${num} (${dateStr})`,
        tiles,
        `得分 ${avgScore}/100 · 命中 ${totalFound}/${totalPlanted} · 误报 ${totalAlarms} · 用时 ${formatDuration(totalSec, "zh")}${streakPart}`,
        "红笔抓错：专治一本正经的胡说八道",
        link,
      ].join("\n");
    }
    const streakPart = streak > 0 ? ` · 🔥 ${streak}-day streak` : "";
    return [
      `🖍️ RedPen Daily #${num} (${dateStr})`,
      tiles,
      `Score ${avgScore}/100 · Hits ${totalFound}/${totalPlanted} · False alarms ${totalAlarms} · ${formatDuration(totalSec, "en")}${streakPart}`,
      "Spot the flaw. Beat the AI.",
      link,
    ].join("\n");
  }

  function formatSingleShareCard({ locale, domain, title, debrief, elapsedSec, url }) {
    const lang = locale === "zh" ? "zh" : "en";
    const sq = resultSquare({
      score: debrief.score,
      falseAlarms: debrief.false_alarms,
      revealed: debrief.revealed,
    });
    const scoreText = debrief.revealed ? (lang === "zh" ? "已看答案" : "Revealed") : `${debrief.score}/100`;
    const link = url || (lang === "zh" ? "https://xmtom111.github.io/redpen/zh/" : "https://xmtom111.github.io/redpen/");
    if (lang === "zh") {
      return [
        `🖍️ 红笔抓错 · ${domainLabel(domain || "math", "zh")}`,
        `${sq} ${title}`,
        `得分 ${scoreText} · 命中 ${debrief.found}/${debrief.planted} · 误报 ${debrief.false_alarms} · 用时 ${formatDuration(elapsedSec, "zh")}`,
        "专治一本正经的胡说八道",
        link,
      ].join("\n");
    }
    return [
      `🖍️ RedPen · ${domainLabel(domain || "math", "en")}`,
      `${sq} ${title}`,
      `Score ${scoreText} · Hits ${debrief.found}/${debrief.planted} · False alarms ${debrief.false_alarms} · ${formatDuration(elapsedSec, "en")}`,
      "Spot the flaw. Beat the AI.",
      link,
    ].join("\n");
  }

  return {
    todayDateStr,
    dayNumber,
    prevDateStr,
    selectDaily,
    loadState,
    saveState,
    recordDailyResult,
    currentStreak,
    formatDuration,
    resultSquare,
    formatShareCard,
    formatSingleShareCard,
  };
});
