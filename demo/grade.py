"""Deterministic grader for canned demo rounds.

The model grader in the CLI reads free-form prose. This one does not call a model.
It matches each note to a planted step, then scores the diagnosis and the fix from
wording overlap with the sealed key. `demo/static/grade.js` is a line-by-line port;
`tests/test_demo.py` fails if the two disagree.

Thresholds (recall of stemmed content words):
  diagnosis 1: category cue hits >= 2, or recall >= 0.34
  diagnosis 0.5: cue hits >= 1, or recall >= 0.17
  fix 1: recall >= 0.40, a shared run of 7 normalized words, or every integer
         present in the correct step and absent from the shown step appears in the fix
  fix 0.5: recall >= 0.18, a shared run of 4 words, or at least one of those integers
A note locates an error when it names that step, a neighbor (±1) that is not
itself a different planted step, or describes the mistake strongly enough to
stand without a step number. Flagging an earlier correct step is a false alarm.
Flagging a later line, after some planted step, is treated as a symptom of that
earlier mistake and is not penalized.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

LEXICON_PATH = Path(__file__).resolve().parent / "static" / "grade_lexicon.json"

RECALL_HIGH = 0.34
RECALL_PARTIAL = 0.17
FIX_HIGH = 0.40
FIX_PARTIAL = 0.18

STEP_LINE = re.compile(r"^\s*\**\s*step\s*(\d+)[*:.)\s\-]*\s*(.*)$", re.IGNORECASE)
WRONG_LINE = re.compile(
    r"^\s*\**\s*what(?:'s|’s| is)\s+wrong\s*\**\s*:?\s*(.*)$", re.IGNORECASE
)
FIX_LINE = re.compile(r"^\s*\**\s*fix\s*\**\s*:?\s*(.*)$", re.IGNORECASE)
CLEAN_CLAIM = re.compile(r"\bno errors found\b", re.IGNORECASE)
FRAC = re.compile(r"\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")


def load_lexicon(path: Path = LEXICON_PATH) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["stopwords"] = set(data["stopwords"])
    data["keep_short"] = set(data["keep_short"])
    return data


LEXICON = load_lexicon()


def stem(word: str) -> str:
    for suffix in ("tion", "ing", "ed", "es", "ly", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def separate_numbers(text: str) -> str:
    parts = re.split(r"(\d+/\d+)", text)
    out = []
    for index, part in enumerate(parts):
        if index % 2 == 1:
            out.append(f" {part} ")
        else:
            out.append(re.sub(r"\d+", lambda match: f" {match.group(0)} ", part))
    return "".join(out)


def normalize(text: str) -> str:
    text = text.lower().replace("≠", " neq ")
    text = FRAC.sub(r" \1/\2 ", text)
    text = text.replace("\\", " ")
    text = re.sub(r"[{}$]", " ", text)
    text = text.replace("^", " ").replace("_", " ")
    text = re.sub(r"[^a-z0-9/+.\-]+", " ", text)
    # Keep a minus sign that is glued to a word ("-cos") as its own token.
    text = re.sub(r"(^|[^a-z0-9])-(?=[a-z])", r"\1- ", text)
    text = separate_numbers(text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str, lexicon: dict | None = None) -> set[str]:
    lexicon = lexicon or LEXICON
    stop, keep = lexicon["stopwords"], lexicon["keep_short"]
    found: set[str] = set()
    for part in normalize(text).split():
        if re.fullmatch(r"\d+/\d+", part):
            found.add(part)
            found.update(re.findall(r"\d+", part))
            continue
        if re.fullmatch(r"\d+", part):
            found.add(part)
            continue
        if not re.fullmatch(r"[a-z][a-z\-]*", part):
            continue
        if len(part) < 3 and part not in keep:
            continue
        if part in stop:
            continue
        word = stem(part) if len(part) >= 3 else part
        if word in stop or not word:
            continue
        found.add(word)
    return found


def cue_hits(text: str, category: str, lexicon: dict | None = None) -> int:
    lexicon = lexicon or LEXICON
    norm = normalize(text)
    return sum(1 for cue in lexicon["cues"].get(category, []) if cue and cue in norm)


def recall(student: set[str], reference: set[str]) -> float:
    if not reference:
        return 0.0
    return len(student & reference) / len(reference)


def signal(text: str, error: dict, lexicon: dict | None = None) -> tuple[float, int]:
    student = tokens(text, lexicon)
    reference = tokens(error["why_wrong"], lexicon)
    return recall(student, reference), cue_hits(text, error["category"], lexicon)


def is_strong(score: float, cues: int) -> bool:
    return cues >= 2 or score >= RECALL_HIGH or (cues >= 1 and score >= 0.20)


def diagnosis_score(text: str, error: dict, lexicon: dict | None = None) -> float:
    score, cues = signal(text, error, lexicon)
    if cues >= 2 or score >= RECALL_HIGH:
        return 1.0
    if cues >= 1 or score >= RECALL_PARTIAL:
        return 0.5
    return 0.0


def longest_common_run(left: list[str], right: list[str]) -> int:
    """Length of the longest shared sequence of normalized words."""
    best = 0
    for i in range(len(left)):
        for j in range(len(right)):
            k = 0
            while i + k < len(left) and j + k < len(right) and left[i + k] == right[j + k]:
                k += 1
            if k > best:
                best = k
    return best


def fix_score(text: str, error: dict, lexicon: dict | None = None) -> float:
    score = recall(tokens(text, lexicon), tokens(error["original"], lexicon))
    if score >= FIX_HIGH:
        value = 1.0
    elif score >= FIX_PARTIAL:
        value = 0.5
    else:
        value = 0.0
    # A copied formula is a run of the same tokens, which word-overlap underweights.
    run = longest_common_run(normalize(text).split(), normalize(error["original"]).split())
    if run >= 7:
        value = 1.0
    elif run >= 4:
        value = max(value, 0.5)
    original_nums = set(re.findall(r"-?\d+", error["original"]))
    corrupted_nums = set(re.findall(r"-?\d+", error["corrupted"]))
    missing = original_nums - corrupted_nums
    student_nums = set(re.findall(r"-?\d+", text))
    if missing and missing <= student_nums:
        return 1.0
    if missing & student_nums:
        return max(value, 0.5)
    return value


def only_clean_claim(body: str) -> bool:
    """True when the note says the solution is clean and cites no step."""
    if not CLEAN_CLAIM.search(body):
        return False
    if re.search(r"\bstep\s*\d+", body, re.IGNORECASE):
        return False
    stripped = CLEAN_CLAIM.sub(" ", body)
    stripped = re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()
    return stripped == ""


def parse_findings(text: str) -> dict:
    """Split a findings note into step-sized items. Empty input claims the work is clean."""
    lines = [line for line in text.splitlines() if not line.lstrip().startswith("#")]
    body = "\n".join(lines).strip()
    if not body or only_clean_claim(body):
        return {"clean_claim": True, "items": []}

    items: list[dict] = []
    current: dict | None = None
    field = "wrong"

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        content = (current["wrong"] + current["fix"] + current["raw"]).strip()
        if content or current["step"] is not None:
            items.append(current)
        current = None

    for line in lines:
        step_match = STEP_LINE.match(line)
        if step_match:
            flush()
            rest = step_match.group(2).strip()
            current = {"step": int(step_match.group(1)), "wrong": "", "fix": "", "raw": ""}
            field = "wrong"
            if rest:
                pieces = re.split(r"\bfix\s*:\s*", rest, maxsplit=1, flags=re.IGNORECASE)
                current["wrong"] = pieces[0].strip(" .;")
                current["raw"] = rest
                if len(pieces) == 2:
                    current["fix"] = pieces[1].strip()
                    field = "fix"
            continue
        if current is None:
            current = {"step": None, "wrong": "", "fix": "", "raw": ""}
            field = "wrong"
        wrong_match = WRONG_LINE.match(line)
        if wrong_match:
            field = "wrong"
            extra = wrong_match.group(1).strip()
            if extra:
                current["wrong"] = (current["wrong"] + " " + extra).strip()
                current["raw"] = (current["raw"] + " " + extra).strip()
            continue
        fix_match = FIX_LINE.match(line)
        if fix_match:
            field = "fix"
            extra = fix_match.group(1).strip()
            if extra:
                current["fix"] = (current["fix"] + " " + extra).strip()
                current["raw"] = (current["raw"] + " " + extra).strip()
            continue
        if line.strip():
            current[field] = (current[field] + " " + line.strip()).strip()
            current["raw"] = (current["raw"] + " " + line.strip()).strip()
    flush()

    kept = [
        item for item in items
        if (item["wrong"] or item["fix"] or item["raw"]).strip() or item["step"] is not None
    ]
    if not kept:
        return {"clean_claim": True, "items": []}
    return {"clean_claim": False, "items": kept}


def item_text(item: dict) -> str:
    return " ".join(part for part in (item.get("wrong"), item.get("fix"), item.get("raw")) if part)


def choose_error(item: dict, errors: list[dict], lexicon: dict | None = None) -> int | None:
    """Return the planted-error index this note is about, or None."""
    scored = []
    text = item_text(item)
    for index, error in enumerate(errors):
        score, cues = signal(text, error, lexicon)
        distance = None if item["step"] is None else abs(item["step"] - error["step"])
        scored.append((index, distance, is_strong(score, cues), score, cues))
    if item["step"] is not None:
        exact = [row for row in scored if row[1] == 0]
        if exact:
            return exact[0][0]
        near = [row for row in scored if row[1] is not None and row[1] <= 1]
        if len(near) == 1:
            return near[0][0]
        if len(near) > 1:
            near.sort(key=lambda row: (row[2], row[3], row[4]), reverse=True)
            return near[0][0]
    strong = [row for row in scored if row[2]]
    if not strong:
        return None
    strong.sort(key=lambda row: (row[3], row[4]), reverse=True)
    return strong[0][0]


def row_comment(found: bool, diagnosis: float, fix: float) -> str:
    if not found:
        return "This step was not identified as the root error."
    if diagnosis == 1 and fix == 1:
        return "You named the broken rule and gave a correction that restores the valid step."
    if diagnosis >= 0.5 and fix == 0:
        return "You are in the right area, but the fix does not yet state the corrected step."
    if diagnosis == 0 and fix >= 0.5:
        return "The correction is pointed the right way, but name the rule that failed."
    if diagnosis == 0:
        return "You marked the step, but the note does not yet say which rule or fact fails."
    return "Right area. Tighten the diagnosis or the corrected step."


def make_feedback(errors: list[dict], rows: list[dict], false_alarms: list[dict], revealed: bool = False) -> str:
    if revealed:
        return "The key is revealed, so every planted error counts as missed. Read the correction before the next round."
    missed = [error for error, row in zip(errors, rows) if not row["found"]]
    sentences = []
    if not errors:
        if not false_alarms:
            sentences.append(
                "This solution was clean, and you treated it as clean. Trusting correct work is part of the skill."
            )
        else:
            sentences.append(
                "This solution was clean. Flagging a correct step costs a point, so verify a claim before you reject it."
            )
    else:
        if not missed and not false_alarms:
            sentences.append("You caught every planted error, and you did not flag a correct step.")
        if missed:
            sentences.append(f"You missed {len(missed)} planted error(s). {missed[0]['catch_rule']}")
        if false_alarms:
            sentences.append(
                "A wrong final line does not make every earlier line wrong. Find the first line that breaks."
            )
    sentences.append("After you correct a step, redo the lines that follow from it.")
    return " ".join(sentences)


def why_correct(step: int, level: int) -> str:
    if level == 0:
        return f"This round is clean, so step {step} is valid. Flagging it is a false alarm."
    return (
        f"Step {step} is valid. It is earlier than every planted mistake, "
        "so a wrong result later does not make this line false."
    )


def claim_text(item: dict) -> str:
    text = (item.get("wrong") or item.get("raw") or item.get("fix") or "").strip()
    return re.sub(r"\s+", " ", text)[:140]


def blank_grade(n_errors: int) -> dict:
    return {
        "errors": [
            {"found": False, "diagnosis": 0, "fix": 0, "comment": ""}
            for _ in range(n_errors)
        ],
        "false_alarms": [],
        "bounties": [],
        "feedback": make_feedback([], [], [], revealed=True),
    }


def grade_findings(entry: dict, findings: str, lexicon: dict | None = None) -> dict:
    """Grade findings against one sealed worksheet. The result passes redpen.validate_grade."""
    lexicon = lexicon or LEXICON
    errors = entry["key"]["errors"]
    parsed = parse_findings(findings)
    items = [] if parsed["clean_claim"] else parsed["items"]
    buckets: list[list[dict]] = [[] for _ in errors]
    used: set[int] = set()
    for index, item in enumerate(items):
        chosen = choose_error(item, errors, lexicon)
        if chosen is None:
            continue
        buckets[chosen].append(item)
        used.add(index)

    rows = []
    for error, group in zip(errors, buckets):
        if not group:
            rows.append({
                "found": False,
                "diagnosis": 0,
                "fix": 0,
                "comment": row_comment(False, 0, 0),
            })
            continue
        wrong_text = " ".join((item.get("wrong") or item.get("raw") or "") for item in group).strip()
        fix_text = " ".join(item.get("fix") or "" for item in group).strip() or wrong_text
        diagnosis = diagnosis_score(wrong_text, error, lexicon)
        fix = fix_score(fix_text, error, lexicon)
        rows.append({
            "found": True,
            "diagnosis": diagnosis,
            "fix": fix,
            "comment": row_comment(True, diagnosis, fix),
        })

    false_alarms = []
    level = entry["key"]["level"]
    for index, item in enumerate(items):
        if index in used or item["step"] is None:
            continue
        if errors and any(error["step"] < item["step"] for error in errors):
            continue
        false_alarms.append({
            "step": item["step"],
            "claim": claim_text(item),
            "why_correct": why_correct(item["step"], level),
        })

    return {
        "errors": rows,
        "false_alarms": false_alarms,
        "bounties": [],
        "feedback": make_feedback(errors, rows, false_alarms),
    }
