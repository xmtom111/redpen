/* Deterministic grader for the static demo. Keep this in lockstep with demo/grade.py.
   tests/test_demo.py fails if a canned round grades differently in Python and here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RedPenGrade = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const RECALL_HIGH = 0.34;
  const RECALL_PARTIAL = 0.17;
  const FIX_HIGH = 0.40;
  const FIX_PARTIAL = 0.18;
  const LEVELS = { 0: "Clean", 1: "Subtle", 2: "Minor", 3: "Mixed", 4: "Nonsense" };
  const STEP_LINE = /^\s*\**\s*step\s*(\d+)[*:.)\s\-]*\s*(.*)$/i;
  const WRONG_LINE = /^\s*\**\s*what(?:'s|’s| is)\s+wrong\s*\**\s*:?\s*(.*)$/i;
  const FIX_LINE = /^\s*\**\s*fix\s*\**\s*:?\s*(.*)$/i;
  const FRAC = /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;

  let LEX = null;

  function init(lexicon) {
    LEX = {
      stopwords: new Set(lexicon.stopwords),
      keep_short: new Set(lexicon.keep_short),
      cues: lexicon.cues,
    };
  }

  function lex() {
    if (!LEX) throw new Error("Call RedPenGrade.init with grade_lexicon.json first.");
    return LEX;
  }

  function stem(word) {
    const suffixes = ["tion", "ing", "ed", "es", "ly", "s"];
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
        return word.slice(0, -suffix.length);
      }
    }
    return word;
  }

  function separateNumbers(text) {
    const parts = text.split(/(\d+\/\d+)/);
    return parts.map((part, index) => (
      index % 2 === 1 ? ` ${part} ` : part.replace(/\d+/g, (match) => ` ${match} `)
    )).join("");
  }

  function normalize(text) {
    let out = String(text).toLowerCase().replaceAll("≠", " neq ");
    FRAC.lastIndex = 0;
    out = out.replace(FRAC, (_, a, b) => ` ${a}/${b} `);
    out = out.replaceAll("\\", " ");
    out = out.replace(/[{}$]/g, " ");
    out = out.replaceAll("^", " ").replaceAll("_", " ");
    out = out.replace(/[^a-z0-9/+.\-]+/g, " ");
    out = out.replace(/(^|[^a-z0-9])-(?=[a-z])/g, "$1- ");
    out = separateNumbers(out);
    return out.replace(/\s+/g, " ").trim();
  }

  function tokens(text) {
    const lexicon = lex();
    const found = new Set();
    for (const part of normalize(text).split(" ")) {
      if (!part) continue;
      if (/^\d+\/\d+$/.test(part)) {
        found.add(part);
        for (const piece of part.match(/\d+/g)) found.add(piece);
        continue;
      }
      if (/^\d+$/.test(part)) {
        found.add(part);
        continue;
      }
      if (!/^[a-z][a-z\-]*$/.test(part)) continue;
      if (part.length < 3 && !lexicon.keep_short.has(part)) continue;
      if (lexicon.stopwords.has(part)) continue;
      const word = part.length >= 3 ? stem(part) : part;
      if (!word || lexicon.stopwords.has(word)) continue;
      found.add(word);
    }
    return found;
  }

  function cueHits(text, category) {
    const norm = normalize(text);
    const cues = lex().cues[category] || [];
    let hits = 0;
    for (const cue of cues) if (cue && norm.includes(cue)) hits += 1;
    return hits;
  }

  function recall(student, reference) {
    if (!reference.size) return 0;
    let shared = 0;
    for (const token of student) if (reference.has(token)) shared += 1;
    return shared / reference.size;
  }

  function signal(text, error) {
    return [recall(tokens(text), tokens(error.why_wrong)), cueHits(text, error.category)];
  }

  function isStrong(score, cues) {
    return cues >= 2 || score >= RECALL_HIGH || (cues >= 1 && score >= 0.20);
  }

  function diagnosisScore(text, error) {
    const [score, cues] = signal(text, error);
    if (cues >= 2 || score >= RECALL_HIGH) return 1;
    if (cues >= 1 || score >= RECALL_PARTIAL) return 0.5;
    return 0;
  }

  function longestCommonRun(left, right) {
    let best = 0;
    for (let i = 0; i < left.length; i += 1) {
      for (let j = 0; j < right.length; j += 1) {
        let k = 0;
        while (i + k < left.length && j + k < right.length && left[i + k] === right[j + k]) k += 1;
        if (k > best) best = k;
      }
    }
    return best;
  }

  function numberSet(text) {
    return new Set(String(text).match(/-?\d+/g) || []);
  }

  function isSubset(small, big) {
    for (const item of small) if (!big.has(item)) return false;
    return true;
  }

  function intersects(left, right) {
    for (const item of left) if (right.has(item)) return true;
    return false;
  }

  function fixScore(text, error) {
    const score = recall(tokens(text), tokens(error.original));
    let value = 0;
    if (score >= FIX_HIGH) value = 1;
    else if (score >= FIX_PARTIAL) value = 0.5;
    const run = longestCommonRun(
      normalize(text).split(" ").filter(Boolean),
      normalize(error.original).split(" ").filter(Boolean),
    );
    if (run >= 7) value = 1;
    else if (run >= 4) value = Math.max(value, 0.5);
    const missing = numberSet(error.original);
    for (const item of numberSet(error.corrupted)) missing.delete(item);
    const studentNums = numberSet(text);
    if (missing.size && isSubset(missing, studentNums)) return 1;
    if (intersects(missing, studentNums)) return Math.max(value, 0.5);
    return value;
  }

  function onlyCleanClaim(body) {
    if (!/\bno errors found\b/i.test(body)) return false;
    if (/\bstep\s*\d+/i.test(body)) return false;
    const stripped = body.replace(/\bno errors found\b/gi, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return stripped === "";
  }

  function stripEdges(text) {
    return text.replace(/^[ .;]+|[ .;]+$/g, "");
  }

  function splitFix(rest) {
    const match = /\bfix\s*:\s*/i.exec(rest);
    if (!match) return [rest];
    return [rest.slice(0, match.index), rest.slice(match.index + match[0].length)];
  }

  function parseFindings(text) {
    const lines = String(text).split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
    const body = lines.join("\n").trim();
    if (!body || onlyCleanClaim(body)) return { clean_claim: true, items: [] };
    const items = [];
    let current = null;
    let field = "wrong";

    function flush() {
      if (!current) return;
      const content = `${current.wrong}${current.fix}${current.raw}`.trim();
      if (content || current.step !== null) items.push(current);
      current = null;
    }

    for (const line of lines) {
      const stepMatch = STEP_LINE.exec(line);
      if (stepMatch) {
        flush();
        const rest = stepMatch[2].trim();
        current = { step: Number(stepMatch[1]), wrong: "", fix: "", raw: "" };
        field = "wrong";
        if (rest) {
          const pieces = splitFix(rest);
          current.wrong = stripEdges(pieces[0]);
          current.raw = rest;
          if (pieces.length === 2) {
            current.fix = pieces[1].trim();
            field = "fix";
          }
        }
        continue;
      }
      if (!current) {
        current = { step: null, wrong: "", fix: "", raw: "" };
        field = "wrong";
      }
      const wrongMatch = WRONG_LINE.exec(line);
      if (wrongMatch) {
        field = "wrong";
        const extra = wrongMatch[1].trim();
        if (extra) {
          current.wrong = `${current.wrong} ${extra}`.trim();
          current.raw = `${current.raw} ${extra}`.trim();
        }
        continue;
      }
      const fixMatch = FIX_LINE.exec(line);
      if (fixMatch) {
        field = "fix";
        const extra = fixMatch[1].trim();
        if (extra) {
          current.fix = `${current.fix} ${extra}`.trim();
          current.raw = `${current.raw} ${extra}`.trim();
        }
        continue;
      }
      if (line.trim()) {
        current[field] = `${current[field]} ${line.trim()}`.trim();
        current.raw = `${current.raw} ${line.trim()}`.trim();
      }
    }
    flush();
    const kept = items.filter((item) => `${item.wrong}${item.fix}${item.raw}`.trim() || item.step !== null);
    if (!kept.length) return { clean_claim: true, items: [] };
    return { clean_claim: false, items: kept };
  }

  function itemText(item) {
    return [item.wrong, item.fix, item.raw].filter(Boolean).join(" ");
  }

  function chooseError(item, errors) {
    const text = itemText(item);
    const scored = errors.map((error, index) => {
      const [score, cues] = signal(text, error);
      const distance = item.step === null ? null : Math.abs(item.step - error.step);
      return [index, distance, isStrong(score, cues), score, cues];
    });
    if (item.step !== null) {
      const exact = scored.filter((row) => row[1] === 0);
      if (exact.length) return exact[0][0];
      const near = scored.filter((row) => row[1] !== null && row[1] <= 1);
      if (near.length === 1) return near[0][0];
      if (near.length > 1) {
        near.sort((a, b) => (b[2] - a[2]) || (b[3] - a[3]) || (b[4] - a[4]));
        return near[0][0];
      }
    }
    const strong = scored.filter((row) => row[2]);
    if (!strong.length) return null;
    strong.sort((a, b) => (b[3] - a[3]) || (b[4] - a[4]));
    return strong[0][0];
  }

  function rowComment(found, diagnosis, fix) {
    if (!found) return "This step was not identified as the root error.";
    if (diagnosis === 1 && fix === 1) {
      return "You named the broken rule and gave a correction that restores the valid step.";
    }
    if (diagnosis >= 0.5 && fix === 0) {
      return "You are in the right area, but the fix does not yet state the corrected step.";
    }
    if (diagnosis === 0 && fix >= 0.5) {
      return "The correction is pointed the right way, but name the rule that failed.";
    }
    if (diagnosis === 0) return "You marked the step, but the note does not yet say which rule or fact fails.";
    return "Right area. Tighten the diagnosis or the corrected step.";
  }

  function makeFeedback(errors, rows, falseAlarms, revealed) {
    if (revealed) {
      return "The key is revealed, so every planted error counts as missed. Read the correction before the next round.";
    }
    const missed = errors.filter((error, index) => !rows[index].found);
    const sentences = [];
    if (!errors.length) {
      if (!falseAlarms.length) {
        sentences.push("This solution was clean, and you treated it as clean. Trusting correct work is part of the skill.");
      } else {
        sentences.push("This solution was clean. Flagging a correct step costs a point, so verify a claim before you reject it.");
      }
    } else {
      if (!missed.length && !falseAlarms.length) {
        sentences.push("You caught every planted error, and you did not flag a correct step.");
      }
      if (missed.length) sentences.push(`You missed ${missed.length} planted error(s). ${missed[0].catch_rule}`);
      if (falseAlarms.length) {
        sentences.push("A wrong final line does not make every earlier line wrong. Find the first line that breaks.");
      }
    }
    sentences.push("After you correct a step, redo the lines that follow from it.");
    return sentences.join(" ");
  }

  function whyCorrect(step, level) {
    if (level === 0) return `This round is clean, so step ${step} is valid. Flagging it is a false alarm.`;
    return `Step ${step} is valid. It is earlier than every planted mistake, so a wrong result later does not make this line false.`;
  }

  function claimText(item) {
    const text = (item.wrong || item.raw || item.fix || "").trim().replace(/\s+/g, " ");
    return text.slice(0, 140);
  }

  function blankGrade(nErrors) {
    return {
      errors: Array.from({ length: nErrors }, () => ({ found: false, diagnosis: 0, fix: 0, comment: "" })),
      false_alarms: [],
      bounties: [],
      feedback: makeFeedback([], [], [], true),
    };
  }

  function gradeFindings(entry, findings) {
    lex();
    const errors = entry.key.errors;
    const parsed = parseFindings(findings);
    const items = parsed.clean_claim ? [] : parsed.items;
    const buckets = errors.map(() => []);
    const used = new Set();
    items.forEach((item, index) => {
      const chosen = chooseError(item, errors);
      if (chosen === null) return;
      buckets[chosen].push(item);
      used.add(index);
    });
    const rows = errors.map((error, index) => {
      const group = buckets[index];
      if (!group.length) {
        return { found: false, diagnosis: 0, fix: 0, comment: rowComment(false, 0, 0) };
      }
      const wrongText = group.map((item) => item.wrong || item.raw || "").join(" ").trim();
      const fixText = group.map((item) => item.fix || "").join(" ").trim() || wrongText;
      const diagnosis = diagnosisScore(wrongText, error);
      const fix = fixScore(fixText, error);
      return { found: true, diagnosis, fix, comment: rowComment(true, diagnosis, fix) };
    });
    const falseAlarms = [];
    const level = entry.key.level;
    items.forEach((item, index) => {
      if (used.has(index) || item.step === null) return;
      if (errors.some((error) => error.step < item.step)) return;
      falseAlarms.push({
        step: item.step,
        claim: claimText(item),
        why_correct: whyCorrect(item.step, level),
      });
    });
    return {
      errors: rows,
      false_alarms: falseAlarms,
      bounties: [],
      feedback: makeFeedback(errors, rows, falseAlarms, false),
    };
  }

  function pyRound(value) {
    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.abs(value);
    const floor = Math.floor(magnitude);
    const frac = magnitude - floor;
    let whole;
    if (frac > 0.5) whole = floor + 1;
    else if (frac < 0.5) whole = floor;
    else whole = floor % 2 === 0 ? floor : floor + 1;
    return sign * whole;
  }

  function scoreRound(nErrors, grade, hintsUsed) {
    const rows = grade.errors || [];
    let earned = 0;
    for (const row of rows) if (row.found) earned += 1 + row.diagnosis + row.fix;
    let possible = 3 * nErrors;
    if (nErrors === 0) {
      earned = 3;
      possible = 3;
    }
    earned += 3 * (grade.bounties || []).length;
    const penalty = (grade.false_alarms || []).length + 0.5 * hintsUsed;
    const ratio = Math.max(0, Math.min(1, (earned - penalty) / possible));
    return {
      score: pyRound(100 * ratio),
      found: rows.filter((row) => row.found).length,
      planted: nErrors,
      false_alarms: (grade.false_alarms || []).length,
      bounties: (grade.bounties || []).length,
      hints_used: hintsUsed,
    };
  }

  function nextMode(mode, level, score) {
    if (score >= 80) return mode === "blind" || level <= 1 ? "blind" : String(level - 1);
    if (score < 40) {
      if (mode === "blind") return "2";
      if (level > 0) return String(Math.min(4, level + 1));
    }
    return mode;
  }

  function nextCommand(topic, title, mode, level, score) {
    const shown = score == null ? mode : nextMode(mode, level, score);
    const label = (topic.length <= 60 ? topic : title).trim().split(/\s+/).join(" ").replaceAll('"', "'");
    return `python redpen.py new "${label}" --level ${shown}`;
  }

  function canonicalize(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }

  function commitmentOk(key, expected) {
    if (typeof require !== "function") return null;
    const hex = require("crypto").createHash("sha256").update(canonicalize(key), "utf8").digest("hex");
    return hex === expected;
  }

  function hintLadder(mode, level, steps, errors) {
    const hints = [];
    if (mode === "blind" || level >= 2) {
      hints.push(`This worksheet contains ${errors.length} planted error(s).`);
    }
    errors.forEach((error, index) => {
      const low = Math.max(1, error.step - 1);
      const high = Math.min(steps.length, error.step + 1);
      hints.push(`Error ${index + 1}: look closely at steps ${low}-${high}.`);
      hints.push(`Error ${index + 1}: ${error.hint}`);
    });
    return hints;
  }

  function buildDebrief(entry, mode, hintsUsed, grade, revealed, grader) {
    const key = entry.key;
    const scored = scoreRound(key.errors.length, grade, hintsUsed);
    const score = revealed ? null : scored.score;
    const errors = key.errors.map((error, index) => {
      const row = grade.errors[index];
      return {
        index: index + 1,
        step: error.step,
        category: error.category,
        found: row.found,
        diagnosis: row.diagnosis,
        fix: row.fix,
        shown: error.corrupted,
        correct: error.original,
        why_wrong: error.why_wrong,
        why_tempting: error.why_tempting,
        catch_rule: error.catch_rule,
        comment: row.comment || "",
        practice_problem: error.practice.problem,
        practice_answer: error.practice.answer,
      };
    });
    return {
      title: entry.title,
      grader: grader || "auto",
      score,
      revealed: !!revealed,
      found: scored.found,
      planted: scored.planted,
      false_alarms: scored.false_alarms,
      bounties: scored.bounties,
      hints_used: scored.hints_used,
      level: entry.level,
      level_name: LEVELS[entry.level],
      mode,
      commitment: entry.commitment,
      commitment_short: entry.commitment.slice(0, 12),
      commitment_ok: commitmentOk(key, entry.commitment),
      verified: entry.verified,
      feedback: grade.feedback || "",
      next: nextCommand(entry.topic, entry.title, mode, entry.level, score),
      clean_steps: key.clean_steps.slice(),
      clean_final_answer: key.clean_final_answer,
      errors,
      false_alarm_details: (grade.false_alarms || []).slice(),
    };
  }

  return {
    init,
    parseFindings,
    gradeFindings,
    blankGrade,
    scoreRound,
    hintLadder,
    canonicalize,
    buildDebrief,
    LEVELS,
  };
});
