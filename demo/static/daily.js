/* Deterministic Daily RedPen selector, localStorage streak tracker,
   and spoiler-free ticket formatter. No backend required. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RedPenDaily = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const DAY_MS = 24 * 60 * 60 * 1000;
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

  const DAILY_SEED = "redpen:daily:v4";

  function cyclePicker(pool, name) {
    let cycle = 0;
    let remaining = [];
    return (used, previous) => {
      if (!remaining.length) {
        remaining = shuffleDeterministic(pool, `${DAILY_SEED}:${name}:${cycle++}`);
        // Keep yesterday's items at the far end of a fresh cycle.
        remaining.sort((a, b) => Number(previous.has(a.id)) - Number(previous.has(b.id)));
      }
      let index = remaining.findIndex((item) => !used.has(item.id) && !previous.has(item.id));
      if (index < 0) index = remaining.findIndex((item) => !used.has(item.id));
      if (index < 0) return pool.find((item) => !used.has(item.id));
      return remaining.splice(index, 1)[0];
    };
  }

  function selectDaily(worksheets, dateStr, count = 3) {
    const general = (worksheets || []).filter((item) => item.domain === "logic").sort((a, b) =>
      a.id < b.id ? -1 : a.id === b.id ? 0 : 1);
    const planted = general.filter((item) => item.kind ? item.kind === "planted" : item.level !== 0);
    const correct = general.filter((item) => !planted.includes(item));
    const preferred = correct.filter((item) => item.kind === "trick_clean" || item.daily_priority);
    // Four items can cover two clean slots on successive days.
    const clean = preferred.length >= 4 ? preferred : correct;
    const target = Math.min(count, planted.length + clean.length);
    if (target < 1) return [];

    const openers = planted.filter((item) => item.opener);
    const otherPlanted = planted.filter((item) => !item.opener);
    const pickOpener = cyclePicker(openers, "opener");
    const pickPlanted = cyclePicker(otherPlanted, "planted");
    const pickClean = cyclePicker(clean, "clean");
    const dayIdx = dayNumber(dateStr) - 1;
    let previous = new Set();
    let picked = [];
    let plantedDraws = 0;
    let openerDraws = 0;
    for (let day = 0; day <= dayIdx; day += 1) {
      const roll = mulberry32(fnv1a(`${DAILY_SEED}:budget:${day}`))();
      const budget = roll < 0.52 ? 0 : roll < 0.94 ? 1 : 2;
      const cleanCount = Math.max(target - planted.length, Math.min(budget, clean.length, target));
      const plantedCount = target - cleanCount;
      plantedDraws += plantedCount;
      // Keep the opener and other planted queues in proportion over time.
      const openerTarget = Math.round(plantedDraws * openers.length / Math.max(1, planted.length));
      const openerCount = Math.max(
        plantedCount - otherPlanted.length,
        cleanCount === 0 && openers.length ? 1 : 0,
        Math.min(openerTarget - openerDraws, openers.length, plantedCount)
      );
      openerDraws += openerCount;
      picked = [];
      const used = new Set();
      for (let slot = 0; slot < target; slot += 1) {
        const pick = slot < openerCount ? pickOpener : slot < plantedCount ? pickPlanted : pickClean;
        const item = pick(used, previous);
        picked.push(item);
        used.add(item.id);
      }
      previous = used;
    }
    return shuffleDeterministic(picked, `${DAILY_SEED}:order:${dayIdx}`)
      .sort((a, b) => Number(!!b.opener) - Number(!!a.opener));
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
    const attitude = day.results[puzzleId]?.attitude;
    day.results[puzzleId] = {
      ...(attitude ? { attitude } : {}),
      found: Number(result.found) || 0,
      planted: Number(result.planted) || 0,
      falseAlarms: Number(result.false_alarms != null ? result.false_alarms : result.falseAlarms) || 0,
      hintsUsed: Number(result.hints_used != null ? result.hints_used : result.hintsUsed) || 0,
      elapsedSec: Math.max(1, Math.round(Number(result.elapsedSec) || 0)),
      domain: result.domain || "math",
      revealed: !!result.revealed,
    };
    const allDone = dailyIds.length > 0 && dailyIds.every((id) => !!day.results[id]);
    if (allDone) {
      day.completedAt ||= new Date().toISOString();
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

  const stamps = {
    zh: { caught: "一针见血", missed: "放虎归山", alarm: "冤假错案", held: "没上钩", revealed: "已摊牌" },
    en: { caught: "Sharp catch", missed: "Let it slip", alarm: "False alarm", held: "Saw through the bait", revealed: "Revealed" },
  };

  function verdictOf(result) {
    if (!result) return null;
    if (result.revealed) return "revealed";
    if (result.false_alarms || result.falseAlarms) return "alarm";
    if (result.found) return "caught";
    return result.planted ? "missed" : "held";
  }

  function stampLabel(result, locale) {
    return stamps[locale === "zh" ? "zh" : "en"][verdictOf(result)] || "—";
  }

  const attitudeLines = {
    invite: ["请继续。红笔还没盖帽。", "Do go on. The pen is still uncapped."],
    file: ["按例归档。红笔照常上班。", "Filed as usual. The red pen is still on duty."],
    concede: ["错判认了，红笔还得接着用。", "I stand corrected. The pen stays on duty."],
    shrug: ["卷翻过去了，案底还在。", "I turned the page. The record stayed put."],
  };

  function docketLine(results, locale) {
    const chosen = results.find((result) => result && Object.hasOwn(attitudeLines, result.attitude));
    if (chosen) return attitudeLines[chosen.attitude][locale === "zh" ? 0 : 1];
    const verdicts = results.map(verdictOf);
    const alarms = verdicts.filter((verdict) => verdict === "alarm").length;
    const misses = verdicts.filter((verdict) => verdict === "missed").length;
    if (alarms > misses) return locale === "zh" ? "今天看谁都像有案底。" : "Today, everybody looked like a suspect.";
    if (misses > alarms) return locale === "zh" ? "今天耳根子有点软。" : "I was a little too easy to talk past today.";
    if (verdicts.every((verdict) => verdict === "caught" || verdict === "held")) {
      return locale === "zh" ? "今天红笔只在该落的地方落。" : "The red pen knew when to stay in its pocket.";
    }
    if (alarms) return locale === "zh" ? "有漏网的，也有被冤枉的。" : "Some got away. Some got stopped for nothing.";
    return locale === "zh" ? "今天翻了翻答案，也算审完了。" : "I peeked at the key. Case closed, technically.";
  }

  function domainLabel(domain, locale) {
    const zh = { logic: "逻辑", code: "代码", math: "数学" };
    const en = { logic: "Logic", code: "Code", math: "Math" };
    return (locale === "zh" ? zh : en)[domain] || domain;
  }

  /**
   * Build a spoiler-free ticket with verdicts, timing, and streak.
   */
  function formatShareCard({ locale, dateStr, dailyItems, dayResults, streak, url }) {
    const lang = locale === "zh" ? "zh" : "en";
    const num = dayNumber(dateStr);
    const results = (dailyItems || []).map((item) => (dayResults || {})[item.id]);
    const tiles = results.map((result) => stampLabel(result, lang)).join(" · ");
    const totalSec = results.reduce((acc, result) => acc + (result ? result.elapsedSec : 0), 0);
    const line = docketLine(results, lang);
    const link = url || (lang === "zh" ? "https://xmtom111.github.io/redpen/zh/" : "https://xmtom111.github.io/redpen/");

    if (lang === "zh") {
      const streakPart = streak > 0 ? ` · 🔥 连续 ${streak} 天` : "";
      return [
        `🖍️ 今日红笔 #${num} (${dateStr})`,
        tiles,
        line,
        `${formatDuration(totalSec, "zh")}${streakPart}`,
        "红笔抓错：这段话站得住脚吗？",
        link,
      ].join("\n");
    }
    const streakPart = streak > 0 ? ` · 🔥 ${streak}-day streak` : "";
    return [
      `🖍️ RedPen Daily #${num} (${dateStr})`,
      tiles,
      line,
      `${formatDuration(totalSec, "en")}${streakPart}`,
      "Does this hold up?",
      link,
    ].join("\n");
  }

  function formatSingleShareCard({ locale, domain, title, debrief, elapsedSec, url }) {
    const lang = locale === "zh" ? "zh" : "en";
    const stamp = stampLabel(debrief, lang);
    const link = url || (lang === "zh" ? "https://xmtom111.github.io/redpen/zh/" : "https://xmtom111.github.io/redpen/");
    if (lang === "zh") {
      return [
        `🖍️ 红笔抓错 · ${domainLabel(domain || "math", "zh")}`,
        title,
        `${stamp} · ${formatDuration(elapsedSec, lang)}`,
        "这段话站得住脚吗？",
        link,
      ].join("\n");
    }
    return [
      `🖍️ RedPen · ${domainLabel(domain || "math", "en")}`,
      title,
        `${stamp} · ${formatDuration(elapsedSec, lang)}`,
      "Does this hold up?",
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
    verdictOf,
    stampLabel,
    docketLine,
    formatShareCard,
    formatSingleShareCard,
  };
});
