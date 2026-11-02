#!/usr/bin/env python3
"""RedPen: learn math by catching an AI's planted mistakes.

Student commands: new, hint, submit, reveal, stats, verify, demo
Agent commands:   seal, score, check  (an AI agent writes the JSON, this script does the rest)

Needs only the Python standard library (3.9+). `pip install sympy` to machine-check answer keys.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import math
import multiprocessing as mp
import os
import random
import re
import sys
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Callable, NoReturn

ROOT = Path(__file__).resolve().parent
LEVELS = {0: "Clean", 1: "Subtle", 2: "Minor", 3: "Mixed", 4: "Nonsense"}
BLIND_WEIGHTS = {0: 0.2, 1: 0.4, 2: 0.4}
DIFFICULTIES = ("intro", "standard", "advanced", "competition")
ERROR_FIELDS = ("category", "original", "corrupted", "why_wrong", "why_tempting", "catch_rule", "hint")
HINT_COST = 0.5
CHECK_TIMEOUT = 15  # seconds per SymPy check
BANNER = "RedPen worksheet: this solution may contain deliberately planted errors. Do not use it as a reference."
STEP_PREFIX = re.compile(r"^\s*(?:step\s*)?\d+\s*[.):]\s+", re.IGNORECASE)

ANSWERS_TEMPLATE = """\
# Findings for session {id}. Lines starting with # are ignored.
# One block per suspected error. Think the solution is fully correct? Write: No errors found.
#
#   Step 4
#   What's wrong: the rule or fact that is violated
#   Fix: the corrected step or result

Step:
What's wrong:
Fix:
"""


# ── Files and sessions ──────────────────────────────────────────────────────

def fail(message: str) -> NoReturn:
    sys.exit(f"redpen: {message}")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_env(path: Path = ROOT / ".env") -> None:
    """Read KEY=VALUE lines from .env without overriding the real environment."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def sessions_dir() -> Path:
    path = Path(os.environ.get("REDPEN_HOME") or ROOT / "sessions")
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_session_dir() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path, n = sessions_dir() / stamp, 2
    while path.exists():
        path, n = sessions_dir() / f"{stamp}-{n}", n + 1
    path.mkdir()
    return path


def find_session(session_id: str | None) -> Path:
    if session_id:
        path = sessions_dir() / session_id
        if not (path / "meta.json").exists():
            fail(f"no session '{session_id}'")
        return path
    found = sorted(p for p in sessions_dir().iterdir() if (p / "meta.json").exists())
    if not found:
        fail('no sessions yet. Start one with: python redpen.py new "your topic"')
    return found[-1]


def load_session(session_id: str | None) -> tuple[Path, dict, dict]:
    path = find_session(session_id)
    return path, read_json(path / "meta.json"), read_json(path / "key.json")


def commitment(key: dict) -> str:
    """SHA-256 of the canonical answer key, published before the student starts."""
    canonical = json.dumps(key, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def mode_label(mode: str) -> str:
    return "blind" if mode == "blind" else f"L{mode} {LEVELS[int(mode)]}"


def confirm(question: str) -> bool:
    try:
        return input(f"{question} [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        return False


# ── Validation ──────────────────────────────────────────────────────────────

def need(obj: dict, name: str, kind: type):
    value = obj.get(name)
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise ValueError(f"'{name}' is missing or not a {kind.__name__}")
    return value


def error_bounds(level: int, n_steps: int) -> tuple[int, int]:
    """Allowed number of planted errors for a level (AGENTS.md, section 3)."""
    return {
        0: (0, 0),
        1: (1, 1),
        2: (2, 3),
        3: (max(3, math.ceil(0.4 * n_steps)), n_steps),
        4: (math.ceil(0.7 * n_steps), n_steps),
    }[level]


def validate_draft(draft: dict) -> None:
    """Check a setter draft against AGENTS.md section 8.1 and sort its errors by step."""
    for name in ("title", "problem", "final_answer"):
        need(draft, name, str)
    steps = need(draft, "steps", list)
    if not 3 <= len(steps) <= 30 or not all(isinstance(s, str) and s.strip() for s in steps):
        raise ValueError("'steps' must be a list of 3-30 non-empty strings")
    key = need(draft, "key", dict)
    level = need(key, "level", int)
    if level not in LEVELS:
        raise ValueError("'key.level' must be 0-4")
    need(key, "clean_steps", list)
    need(key, "clean_final_answer", str)
    errors = need(key, "errors", list)
    low, high = error_bounds(level, len(steps))
    if not low <= len(errors) <= high:
        raise ValueError(f"level {level} with {len(steps)} steps needs {low}-{high} planted errors, got {len(errors)}")
    seen = set()
    for error in errors:
        if not isinstance(error, dict):
            raise ValueError("each entry in 'key.errors' must be an object")
        step = need(error, "step", int)
        if not 1 <= step <= len(steps) or step in seen:
            raise ValueError(f"error step {step} is out of range or used twice")
        seen.add(step)
        for name in ERROR_FIELDS:
            need(error, name, str)
        if error["original"].strip() == error["corrupted"].strip():
            raise ValueError(f"error at step {step}: 'original' and 'corrupted' are identical")
        practice = need(error, "practice", dict)
        need(practice, "problem", str)
        need(practice, "answer", str)
    checks = key.setdefault("checks", [])
    if not isinstance(checks, list) or not all(isinstance(c, str) for c in checks):
        raise ValueError("'key.checks' must be a list of strings")
    errors.sort(key=lambda e: e["step"])


def validate_grade(grade: dict, n_errors: int) -> None:
    """Check a grader reply against AGENTS.md section 8.2."""
    rows = need(grade, "errors", list)
    if len(rows) != n_errors:
        raise ValueError(f"'errors' needs exactly {n_errors} entries, one per planted error in key order")
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("each entry in 'errors' must be an object")
        need(row, "found", bool)
        for name in ("diagnosis", "fix"):
            value = row.get(name)
            if isinstance(value, bool) or value not in (0, 0.5, 1):
                raise ValueError(f"'{name}' must be 0, 0.5 or 1")
        if not row["found"]:
            row["diagnosis"] = row["fix"] = 0
        row.setdefault("comment", "")
    for name in ("false_alarms", "bounties"):
        items = grade.setdefault(name, [])
        if not isinstance(items, list) or not all(isinstance(i, dict) for i in items):
            raise ValueError(f"'{name}' must be a list of objects")
    need(grade, "feedback", str)


# ── Model calls (CLI mode) ──────────────────────────────────────────────────

# LaTeX commands whose first letter collides with a JSON escape (\f, \t, \n, \b, \r).
LATEX_WORDS = (
    "frac|dfrac|tfrac|forall|frown|flat|theta|tau|times|to|top|tan|tanh|text|textbf|textit|textrm|"
    "tilde|triangle|nabla|neq|neg|not|notin|nu|nmid|ni|beta|binom|bar|bigl|bigr|bigm|bigg|bigcup|"
    "bigcap|bigoplus|bmod|boxed|bot|bullet|rho|right|rightarrow|rangle|rceil|rfloor|rbrace|rvert"
)
BACKSLASH_FIX = re.compile(
    r"\\\\"                                     # an escaped backslash: keep it
    rf"|\\(?=(?:{LATEX_WORDS})(?![A-Za-z]))"     # \frac, \theta...: LaTeX, not \f or \t
    r"|\\(?=u(?![0-9a-fA-F]{4}))"                # \underline, \uparrow...
    r'|\\(?![\\"/bfnrtu])'                       # any other invalid escape: \sqrt, \pi...
)


def strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def extract_json(text: str) -> dict:
    """Parse the JSON object in a reply, repairing unescaped LaTeX backslashes."""
    text = strip_thinking(text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object found")
    raw = BACKSLASH_FIX.sub(lambda _: "\\\\", text[start:end + 1])
    try:
        data = json.loads(raw, strict=False)
    except json.JSONDecodeError as err:
        raise ValueError(f"invalid JSON ({err})") from None
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return data


def llm(task: str, model_var: str = "REDPEN_MODEL") -> str:
    """One chat completion on any OpenAI-compatible endpoint, with AGENTS.md as the system prompt."""
    model = os.environ.get(model_var) or os.environ.get("REDPEN_MODEL")
    if not model:
        fail("set REDPEN_MODEL in .env (see .env.example), or use RedPen through an AI agent (see README)")
    base = os.environ.get("REDPEN_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    headers = {"Content-Type": "application/json"}
    if os.environ.get("REDPEN_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['REDPEN_API_KEY']}"
    messages = [
        {"role": "system", "content": (ROOT / "AGENTS.md").read_text(encoding="utf-8")},
        {"role": "user", "content": task},
    ]
    body = json.dumps({"model": model, "messages": messages}).encode("utf-8")
    request = urllib.request.Request(f"{base}/chat/completions", data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            reply = json.load(response)
        return reply["choices"][0]["message"]["content"] or ""
    except urllib.error.HTTPError as err:
        fail(f"model request failed ({err.code}): {err.read().decode('utf-8', 'replace')[:300]}")
    except (urllib.error.URLError, TimeoutError) as err:
        fail(f"cannot reach {base}: {getattr(err, 'reason', err)}")
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        fail("unexpected response format from the model endpoint")


def ask_json(task: str, validate: Callable[[dict], None]) -> dict:
    """Ask for a JSON object; on invalid output, retry with the reason."""
    prompt, problem = task, ""
    for _ in range(3):
        try:
            data = extract_json(llm(prompt))
            validate(data)
            return data
        except ValueError as err:
            problem = str(err)
            prompt = f"{task}\n\nYour previous reply was rejected: {problem}\nReply with the corrected JSON object only."
    fail(f"the model did not return valid output after 3 attempts ({problem})")


def worksheet_text(worksheet: dict) -> str:
    steps = "\n".join(f"Step {i}. {s}" for i, s in enumerate(worksheet["steps"], 1))
    return f"Problem: {worksheet['problem']}\n\n{steps}\n\nFinal answer: {worksheet['final_answer']}"


def setter_task(topic: str, level: int, difficulty: str, focus: list[str], answer: str | None) -> str:
    lines = [
        "MODE: CLI-SETTER",
        f"Topic or problem: {topic}",
        f"Error level: {level} ({LEVELS[level]})",
        f"Difficulty: {difficulty}",
    ]
    if focus:
        lines.append(f"Focus categories: {', '.join(focus)}")
    if answer:
        lines.append(f"Reference answer from the student's source: {answer}")
    if os.environ.get("REDPEN_LANGUAGE"):
        lines.append(f"Language for all text: {os.environ['REDPEN_LANGUAGE']}")
    lines.append("Return only the JSON object described in section 8.1.")
    return "\n".join(lines)


def grader_task(meta: dict, key: dict, findings: str) -> str:
    return "\n\n".join([
        "MODE: CLI-GRADER",
        "WORKSHEET (exactly what the student saw):\n" + worksheet_text(meta["worksheet"]),
        "ANSWER KEY:\n" + json.dumps(key, ensure_ascii=False, indent=1),
        "STUDENT FINDINGS:\n" + (findings or "(none: the student claims the solution is fully correct)"),
        "Return only the JSON object described in section 8.2.",
    ])


def hunter_task(meta: dict) -> str:
    return ("MODE: CLI-HUNTER\n\nWORKSHEET:\n" + worksheet_text(meta["worksheet"])
            + "\n\nReturn only your findings in the format of section 8.3.")


# ── SymPy checks ────────────────────────────────────────────────────────────

SAFE_BUILTINS = {"abs", "min", "max", "pow", "round", "sum", "range", "list", "tuple", "set", "int", "float",
                 "True", "False", "None"}
BLOCKED_NAMES = {"sympify", "lambdify", "var", "preview", "pprint", "init_printing", "init_session", "plot"}


def run_checks(checks: list[str]) -> list[dict]:
    """Evaluate 'left == right' checks in a worker process, with a timeout per check."""
    if not checks:
        return []
    if importlib.util.find_spec("sympy") is None:
        return [{"check": c, "status": "skipped", "detail": "sympy not installed"} for c in checks]
    results, pool = [], mp.Pool(1)
    try:
        for check in checks:
            try:
                results.append(pool.apply_async(check_one, (check,)).get(CHECK_TIMEOUT))
            except mp.TimeoutError:
                results.append({"check": check, "status": "unverified", "detail": "timed out"})
                pool.terminate()
                pool = mp.Pool(1)
            except Exception as err:  # a crashed check must not stop the session
                results.append({"check": check, "status": "unverified", "detail": f"checker crashed: {err}"})
    finally:
        pool.terminate()
        pool.join()
    return results


def check_one(check: str) -> dict:
    """Runs in the worker. Status: pass, fail, unverified (undecided) or error (malformed check)."""
    import builtins
    import sympy
    from sympy.parsing.sympy_parser import convert_xor, parse_expr, standard_transformations

    def result(status: str, detail: str) -> dict:
        return {"check": check, "status": status, "detail": detail}

    left, sep, right = check.partition("==")
    if not sep or "==" in right:
        return result("error", "write checks as 'left == right'")
    if re.search(r"__|['\"`;\\]|\.\s*[A-Za-z_]", check):
        return result("error", "quotes, attribute access and dunder names are not allowed")
    names = set(re.findall(r"[A-Za-z_]\w*", check))
    unsafe = sorted(n for n in names if n in BLOCKED_NAMES or (
        hasattr(builtins, n) and not hasattr(sympy, n) and n not in SAFE_BUILTINS))
    if unsafe:
        return result("error", f"not allowed: {', '.join(unsafe)}")
    try:
        transformations = standard_transformations + (convert_xor,)
        lhs = parse_expr(left, transformations=transformations)
        rhs = parse_expr(right, transformations=transformations)
    except Exception as err:
        return result("error", f"cannot parse: {err}")
    try:
        return result(*compare(lhs, rhs))
    except Exception as err:
        return result("unverified", f"{type(err).__name__}: {err}"[:200])


def compare(lhs, rhs) -> tuple[str, str]:
    import sympy

    def items(value):
        return list(value) if isinstance(value, (list, set, sympy.FiniteSet)) else None

    if lhs == rhs:
        return "pass", "identical"
    left_items, right_items = items(lhs), items(rhs)
    if left_items is not None or right_items is not None:
        if left_items is None or right_items is None or len(left_items) != len(right_items):
            return "fail", "collections differ in size or type"
        remaining = list(right_items)
        for a in left_items:
            match = next((b for b in remaining if compare(a, b)[0] == "pass"), None)
            if match is None:
                return "fail", f"no match for {a}"
            remaining.remove(match)
        return "pass", "same elements"
    if isinstance(lhs, (tuple, sympy.Tuple)):
        lhs, rhs = sympy.Matrix(list(lhs)), sympy.Matrix(list(rhs))
    diff = sympy.simplify(lhs - rhs)
    if diff == 0 or getattr(diff, "is_zero_matrix", False):
        return "pass", "symbolic"
    if isinstance(diff, sympy.MatrixBase):
        outcomes = [numeric_zero(entry) for entry in diff]
        for status in ("fail", "unverified"):
            for outcome in outcomes:
                if outcome[0] == status:
                    return outcome
        return "pass", "numeric"
    return numeric_zero(diff)


def numeric_zero(expr) -> tuple[str, str]:
    """Test expr == 0 at random positive rational points (where most domains overlap)."""
    import sympy

    symbols = sorted(expr.free_symbols, key=str)
    rng, tested = random.Random(0), 0
    for _ in range(20):
        point = {s: sympy.Rational(rng.randint(11, 290), 100) for s in symbols}
        try:
            value = complex(sympy.N(expr.subs(point), 30))
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        if not math.isfinite(abs(value)):
            continue
        tested += 1
        if abs(value) > 1e-8:
            where = ", ".join(f"{s}={v}" for s, v in point.items()) or "constant"
            return "fail", f"differs by {abs(value):.3g} at {where}"
        if tested >= 5 or not symbols:
            return "pass", "numeric"
    return "unverified", "could not evaluate numerically"


def verify_checks(draft: dict) -> None:
    """Run the key's checks; a failing check means the clean solution (or the check) is wrong."""
    results = run_checks(draft["key"]["checks"])
    bad = [r for r in results if r["status"] in ("fail", "error")]
    if bad:
        raise ValueError("checks of the clean solution failed: "
                         + "; ".join(f"{r['check']} ({r['detail']})" for r in bad))
    draft["key"]["check_results"] = results


def check_summary(results: list[dict]) -> str:
    if not results:
        return "no machine checks"
    if any(r["status"] == "skipped" for r in results):
        return "not machine-checked (pip install sympy)"
    passed = sum(r["status"] == "pass" for r in results)
    return f"{passed}/{len(results)} SymPy checks passed"


# ── Worksheets and reports ──────────────────────────────────────────────────

HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<script>window.MathJax = {tex: {inlineMath: [["$", "$"], ["\\(", "\\)"]]}};</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
  onerror="var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-chtml.js';document.head.appendChild(s);"></script>
<style>
  :root { --ink: #1f2328; --muted: #656d76; --red: #c62828; --paper: #fffdf8; --line: #e7e2d6; }
  body { margin: 0; background: var(--paper); color: var(--ink);
         font: 17px/1.65 Georgia, "Times New Roman", "Noto Serif CJK SC", serif; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 22px 64px; }
  h1 { font-size: 1.6rem; margin: 0 0 18px; }
  .banner { background: #fff4e5; border-left: 4px solid #f0a020; padding: 10px 14px;
            font: 14px/1.5 system-ui, sans-serif; color: #6b4a00; }
  .problem { margin: 24px 0; padding: 16px 18px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
  ol.steps { list-style: none; counter-reset: step; padding: 0; margin: 0; }
  ol.steps li { counter-increment: step; position: relative; padding: 12px 0 12px 68px; border-bottom: 1px solid var(--line); }
  ol.steps li::before { content: "Step " counter(step); position: absolute; left: 0; top: 15px;
                        font: 600 13px system-ui, sans-serif; color: var(--red); }
  .text { white-space: pre-wrap; }
  .final { margin-top: 24px; padding: 14px 18px; border: 2px solid var(--ink); border-radius: 8px; }
  footer { margin-top: 36px; font: 13px/1.6 system-ui, sans-serif; color: var(--muted); }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; }
</style>
</head>
<body>
<main>
  <h1>{{title}}</h1>
  <div class="banner">{{banner}}</div>
  <div class="problem"><strong>Problem.</strong> <span class="text">{{problem}}</span></div>
  <ol class="steps">
{{steps}}
  </ol>
  <div class="final"><strong>Final answer.</strong> <span class="text">{{final}}</span></div>
  <footer>Session <code>{{id}}</code> · {{mode}} · key commitment <code>{{commitment}}</code><br>
    Write your findings in <code>answers.md</code> in this folder, then run <code>python redpen.py submit</code>.
    Stuck? <code>python redpen.py hint</code></footer>
</main>
</body>
</html>
"""


def worksheet_md(meta: dict) -> str:
    w = meta["worksheet"]
    lines = [f"# {w['title']}", "", f"> ⚠️ {BANNER}", "", f"**Problem.** {w['problem']}", "", "## Solution", ""]
    for i, step in enumerate(w["steps"], 1):
        lines += [f"**Step {i}.** {step}", ""]
    lines += [
        f"**Final answer.** {w['final_answer']}", "", "---", "",
        f"Session `{meta['id']}` · {mode_label(meta['mode'])} · key commitment `{meta['commitment'][:12]}`",
    ]
    return "\n".join(lines) + "\n"


def worksheet_html(meta: dict) -> str:
    w = meta["worksheet"]

    def esc(text: str) -> str:
        return html.escape(text, quote=False)

    values = {
        "title": esc(w["title"]),
        "banner": esc(BANNER),
        "problem": esc(w["problem"]),
        "steps": "\n".join(f'    <li><span class="text">{esc(s)}</span></li>' for s in w["steps"]),
        "final": esc(w["final_answer"]),
        "id": meta["id"],
        "mode": mode_label(meta["mode"]),
        "commitment": meta["commitment"][:12],
    }
    return re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], HTML_TEMPLATE)


def create_session(draft: dict, *, topic: str, mode: str, difficulty: str, focus: list[str], model: str) -> Path:
    path, key = new_session_dir(), draft["key"]
    meta = {
        "id": path.name,
        "created": datetime.now().isoformat(timespec="seconds"),
        "topic": topic,
        "mode": mode,
        "difficulty": difficulty,
        "focus": focus,
        "model": model,
        "commitment": commitment(key),
        "verified": check_summary(key.get("check_results", [])),
        "hints_used": 0,
        "worksheet": {
            "title": draft["title"],
            "problem": draft["problem"],
            "steps": [STEP_PREFIX.sub("", s).strip() for s in draft["steps"]],
            "final_answer": draft["final_answer"],
        },
    }
    write_json(path / "key.json", key)
    write_json(path / "meta.json", meta)
    (path / "worksheet.md").write_text(worksheet_md(meta), encoding="utf-8")
    (path / "worksheet.html").write_text(worksheet_html(meta), encoding="utf-8")
    (path / "answers.md").write_text(ANSWERS_TEMPLATE.format(id=path.name), encoding="utf-8")
    return path


def announce(path: Path, open_browser: bool) -> None:
    meta, key = read_json(path / "meta.json"), read_json(path / "key.json")
    print(worksheet_md(meta))
    print(f"Worksheet:  {path / 'worksheet.html'}")
    print(f"Answers:    {path / 'answers.md'}")
    print(f"Answer key: sealed, {meta['verified']}, commitment {meta['commitment'][:12]}")
    if str(key.get("reference_check", "")).lower().startswith("mismatch"):
        print("Note: the verified solution disagrees with your reference answer. Details appear after grading.")
    print("\nNext: write your findings in answers.md, then run  python redpen.py submit   (stuck? python redpen.py hint)")
    if open_browser:
        webbrowser.open((path / "worksheet.html").as_uri())


def number(value: float) -> str:
    return f"{value:g}"


def render_report(meta: dict, key: dict, result: dict, who: str) -> str:
    w, grade = meta["worksheet"], result["grade"]
    level = f"Level {key['level']} ({LEVELS[key['level']]})" + (", blind round" if meta["mode"] == "blind" else "")
    lines = [f"# RedPen report: {w['title']}", "",
             f"{level} · key commitment `{meta['commitment'][:12]}` · {meta['verified']}", ""]
    if result.get("revealed"):
        lines.append("**Answer key revealed without a submission.**")
    else:
        line = (f"**{who}: {result['score']}/100** · found {result['found']}/{result['planted']}"
                f" · false alarms {result['false_alarms']} · hints {result['hints_used']}")
        if result["bounties"]:
            line += f" · bounties {result['bounties']} (+3 each)"
        lines.append(line)
    lines.append("")
    if not key["errors"]:
        lines += ["This was a **clean round**: the solution contained no planted errors.", ""]
    for i, (error, row) in enumerate(zip(key["errors"], grade["errors"]), 1):
        status = f"✅ diagnosis {number(row['diagnosis'])}, fix {number(row['fix'])}" if row["found"] else "❌ missed"
        lines += [
            f"## Error {i}: step {error['step']} · `{error['category']}` · {status}", "",
            f"- **Shown:** {error['corrupted']}",
            f"- **Correct:** {error['original']}",
            f"- **Why it's wrong:** {error['why_wrong']}",
            f"- **Why it's tempting:** {error['why_tempting']}",
            f"- **Catch it next time:** {error['catch_rule']}",
        ]
        if row.get("comment"):
            lines.append(f"- **Grader:** {row['comment']}")
        lines.append("")
    if grade["false_alarms"]:
        lines += ["## False alarms (these steps were correct)", ""]
        lines += [f"- Step {f.get('step', '?')}: {f.get('why_correct', '')}" for f in grade["false_alarms"]]
        lines.append("")
    if grade["bounties"]:
        lines += ["## Bounties: real errors the setter did not plant", ""]
        lines += [f"- Step {b.get('step', '?')}: {b.get('description', '')}" for b in grade["bounties"]]
        lines.append("")
    if grade["feedback"]:
        lines += ["## Coach", "", grade["feedback"], ""]
    if key["errors"]:
        lines += ["## Practice: the same traps in new problems", ""]
        lines += [f"{i}. {e['practice']['problem']}" for i, e in enumerate(key["errors"], 1)]
        lines.append("")
    lines += ["## Correct solution", ""]
    lines += [f"{i}. {s}" for i, s in enumerate(key["clean_steps"], 1)]
    lines += ["", f"**Final answer:** {key['clean_final_answer']}", ""]
    if key.get("reference_check") and key["reference_check"] != "none":
        lines += [f"Reference answer check: {key['reference_check']}", ""]
    if key["errors"]:
        lines += ["## Practice answers", ""]
        lines += [f"{i}. {e['practice']['answer']}" for i, e in enumerate(key["errors"], 1)]
        lines.append("")
    if result.get("next"):
        lines.append(f"**Next round:** `{result['next']}`")
    return "\n".join(lines).rstrip()


# ── Scoring and progress ────────────────────────────────────────────────────

def score_round(n_errors: int, grade: dict, hints_used: int) -> dict:
    """Each found error earns 1 + diagnosis + fix (max 3). Penalties: false alarms and hints."""
    rows = grade["errors"]
    earned = sum(1 + r["diagnosis"] + r["fix"] for r in rows if r["found"])
    possible = 3 * n_errors
    if n_errors == 0:
        earned = possible = 3  # a clean round rewards trusting correct work
    earned += 3 * len(grade["bounties"])
    penalty = len(grade["false_alarms"]) + HINT_COST * hints_used
    return {
        "score": round(100 * max(0.0, min(1.0, (earned - penalty) / possible))),
        "found": sum(1 for r in rows if r["found"]),
        "planted": n_errors,
        "false_alarms": len(grade["false_alarms"]),
        "bounties": len(grade["bounties"]),
        "hints_used": hints_used,
    }


def next_mode(mode: str, level: int, score: int) -> str:
    """Harder after a strong round, easier after a weak one. Lower levels are harder to hunt."""
    if score >= 80:
        return "blind" if mode == "blind" or level <= 1 else str(level - 1)
    if score < 40:
        if mode == "blind":
            return "2"
        if level > 0:
            return str(min(4, level + 1))
    return mode


def next_command(meta: dict, key: dict, result: dict) -> str:
    mode = meta["mode"] if result["score"] is None else next_mode(meta["mode"], key["level"], result["score"])
    topic = meta["topic"] if len(meta["topic"]) <= 60 else meta["worksheet"]["title"]
    topic = " ".join(topic.split()).replace('"', "'")
    return f'python redpen.py new "{topic}" --level {mode}'


def graded_results() -> list[dict]:
    results = []
    for path in sorted(sessions_dir().glob("*/result.json")):
        try:
            results.append(read_json(path))
        except (OSError, json.JSONDecodeError):
            continue
    return results


def category_tally(results: list[dict]) -> dict[str, tuple[int, int]]:
    """category -> (missed, seen)"""
    tally: dict[str, tuple[int, int]] = {}
    for result in results:
        for item in result.get("categories", []):
            missed, seen = tally.get(item["category"], (0, 0))
            tally[item["category"]] = (missed + (not item["found"]), seen + 1)
    return tally


def miss_rate(missed: int, seen: int) -> float:
    return (missed + 1) / (seen + 2)  # smoothed so a single round doesn't dominate


def weak_categories(limit: int = 2) -> list[str]:
    """Categories missed at least half the time, worst first."""
    tally = category_tally(graded_results())
    ranked = sorted(tally.items(), key=lambda kv: miss_rate(*kv[1]), reverse=True)
    return [cat for cat, (missed, seen) in ranked if 2 * missed >= seen][:limit]


def finish(path: Path, meta: dict, key: dict, grade: dict, *, prefix: str = "", revealed: bool = False) -> None:
    """Score a graded round, save the result and report, print the report."""
    hints = 0 if prefix else meta["hints_used"]
    result = {
        "graded": datetime.now().isoformat(timespec="seconds"),
        "mode": meta["mode"],
        "level": key["level"],
        **score_round(len(key["errors"]), grade, hints),
    }
    if revealed:
        result.update(score=None, revealed=True)
    result["categories"] = [{"category": e["category"], "found": r["found"]}
                            for e, r in zip(key["errors"], grade["errors"])]
    result["grade"] = grade
    if not prefix:
        result["next"] = next_command(meta, key, result)
    write_json(path / f"{prefix}result.json", result)
    report = render_report(meta, key, result, who="AI hunter" if prefix else "You")
    (path / f"{prefix}report.md").write_text(report + "\n", encoding="utf-8")
    print(report)
    print(f"\nFull report: {path / f'{prefix}report.md'}")


def read_findings(source: str | Path) -> str:
    """Findings without comment lines; empty if only the template labels remain."""
    try:
        text = sys.stdin.read() if str(source) == "-" else Path(source).read_text(encoding="utf-8")
    except OSError as err:
        fail(f"cannot read {source}: {err.strerror}")
    kept = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#")).strip()
    leftover = re.sub(r"(?im)^\s*(step|what's wrong|fix)\s*:?\s*$", "", kept)
    return kept if leftover.strip() else ""


def load_agent_json(path: Path, validate: Callable[[dict], None]) -> dict:
    try:
        data = extract_json(path.read_text(encoding="utf-8"))
        validate(data)
        return data
    except OSError as err:
        fail(f"cannot read {path}: {err.strerror}")
    except ValueError as err:
        fail(f"{path.name}: {err}")


def hint_ladder(meta: dict, key: dict) -> list[str]:
    """Error count first (when it isn't already known), then per error: location, then concept."""
    n_steps = len(meta["worksheet"]["steps"])
    hints = []
    if meta["mode"] == "blind" or key["level"] >= 2:
        hints.append(f"This worksheet contains {len(key['errors'])} planted error(s).")
    for i, error in enumerate(key["errors"], 1):
        low, high = max(1, error["step"] - 1), min(n_steps, error["step"] + 1)
        hints.append(f"Error {i}: look closely at steps {low}-{high}.")
        hints.append(f"Error {i}: {error['hint']}")
    return hints


def ensure_ungraded(path: Path) -> None:
    if (path / "result.json").exists():
        fail(f"this round is already graded; see {path / 'report.md'}")


# ── Commands ────────────────────────────────────────────────────────────────

def cmd_new(args: argparse.Namespace) -> None:
    if not os.environ.get("REDPEN_MODEL"):
        fail("set REDPEN_MODEL in .env (see .env.example), or use RedPen through an AI agent (see README)")
    try:
        topic = Path(args.file).read_text(encoding="utf-8").strip() if args.file else " ".join(args.topic).strip()
    except OSError as err:
        fail(f"cannot read {args.file}: {err.strerror}")
    if not topic:
        fail('give a topic or a problem, e.g.  python redpen.py new "chain rule" --level 2')
    mode = args.level
    level = random.choices(list(BLIND_WEIGHTS), list(BLIND_WEIGHTS.values()))[0] if mode == "blind" else int(mode)
    if args.focus == "auto":
        focus = weak_categories()
    elif args.focus == "none":
        focus = []
    else:
        focus = [c.strip() for c in args.focus.split(",") if c.strip()]
    if focus:
        print(f"Targeting: {', '.join(focus)}", file=sys.stderr)

    def validate(draft: dict) -> None:
        validate_draft(draft)
        if draft["key"]["level"] != level:
            raise ValueError(f"'key.level' must be {level}")
        verify_checks(draft)

    print("Writing your worksheet and sealing the answer key (this can take a minute)...", file=sys.stderr)
    draft = ask_json(setter_task(topic, level, args.difficulty, focus, args.answer), validate)
    path = create_session(draft, topic=topic, mode=mode, difficulty=args.difficulty, focus=focus,
                          model=os.environ.get("REDPEN_MODEL", ""))
    announce(path, open_browser=not args.no_open)


def cmd_hint(args: argparse.Namespace) -> None:
    path, meta, key = load_session(args.session)
    ensure_ungraded(path)
    hints, used = hint_ladder(meta, key), meta["hints_used"]
    if not hints:
        print("This round has no hints.")
    elif used >= len(hints):
        print("No hints left. Run  python redpen.py submit  or  python redpen.py reveal")
    else:
        meta["hints_used"] = used + 1
        write_json(path / "meta.json", meta)
        print(f"Hint {used + 1}/{len(hints)} (costs {number(HINT_COST)} points): {hints[used]}")


def cmd_submit(args: argparse.Namespace) -> None:
    path, meta, key = load_session(args.session)
    if args.ai:
        print("An AI hunter is checking the worksheet...", file=sys.stderr)
        findings = strip_thinking(llm(hunter_task(meta), "REDPEN_HUNTER_MODEL"))
        (path / "ai_findings.md").write_text(findings + "\n", encoding="utf-8")
        prefix = "ai_"
    else:
        ensure_ungraded(path)
        findings = read_findings(args.file or path / "answers.md")
        if not findings and not confirm("No findings. Submit anyway, claiming the solution is fully correct?"):
            return
        prefix = ""
    print("Grading...", file=sys.stderr)
    grade = ask_json(grader_task(meta, key, findings), lambda g: validate_grade(g, len(key["errors"])))
    finish(path, meta, key, grade, prefix=prefix)


def cmd_reveal(args: argparse.Namespace) -> None:
    path, meta, key = load_session(args.session)
    ensure_ungraded(path)
    if not args.yes and not confirm("Reveal the answer key? Every planted error counts as missed."):
        return
    blank = {"found": False, "diagnosis": 0, "fix": 0, "comment": ""}
    grade = {"errors": [dict(blank) for _ in key["errors"]], "false_alarms": [], "bounties": [], "feedback": ""}
    finish(path, meta, key, grade, revealed=True)


def cmd_stats(args: argparse.Namespace) -> None:
    results = graded_results()
    if not results:
        print('No graded rounds yet. Start one with: python redpen.py new "your topic"')
        return
    scored = [r for r in results if r.get("score") is not None]
    print(f"Rounds: {len(scored)} graded, {len(results) - len(scored)} revealed")
    if scored:
        by_mode: dict[str, list[int]] = {}
        for r in scored:
            by_mode.setdefault(mode_label(r["mode"]), []).append(r["score"])
        print("Average score: " + " · ".join(f"{m} {round(sum(v) / len(v))} ({len(v)})"
                                             for m, v in sorted(by_mode.items())))
        print("Last scores:   " + " ".join(str(r["score"]) for r in scored[-10:]) + "  (oldest to newest)")
        print(f"False alarms per round: {sum(r['false_alarms'] for r in scored) / len(scored):.1f}")
    tally = category_tally(results)
    if tally:
        print("\nError types, most missed first (missed/seen):")
        for cat, (missed, seen) in sorted(tally.items(), key=lambda kv: (-miss_rate(*kv[1]), kv[0])):
            print(f"  {cat:<18} {missed}/{seen}  {'#' * round(10 * missed / seen)}")
    weak = weak_categories()
    if weak:
        print(f"\nWeak spots: {', '.join(weak)}. New rounds target them automatically (--focus none to turn off).")
    if results[-1].get("next"):
        print(f"Suggested next round: {results[-1]['next']}")


def cmd_verify(args: argparse.Namespace) -> None:
    path, meta, key = load_session(args.session)
    if commitment(key) != meta["commitment"]:
        fail("key.json does NOT match the published commitment: it was changed after the worksheet was issued")
    print(f"OK: key.json matches the commitment {meta['commitment'][:12]} published with the worksheet.")


def cmd_seal(args: argparse.Namespace) -> None:
    draft_path = Path(args.draft) if args.draft else sessions_dir() / "draft.json"

    def validate(draft: dict) -> None:
        validate_draft(draft)
        info = draft.setdefault("meta", {})
        if not isinstance(info, dict):
            raise ValueError("'meta' must be an object")
        mode = str(info.get("mode", draft["key"]["level"]))
        if mode not in ("blind", str(draft["key"]["level"])):
            raise ValueError(f"'meta.mode' is {mode!r} but 'key.level' is {draft['key']['level']}")
        info["mode"] = mode
        verify_checks(draft)

    draft = load_agent_json(draft_path, validate)
    info = draft["meta"]
    path = create_session(
        draft,
        topic=str(info.get("topic") or draft["title"]),
        mode=info["mode"],
        difficulty=str(info.get("difficulty") or "standard"),
        focus=[str(c) for c in info.get("focus") or []],
        model="agent",
    )
    draft_path.unlink()
    announce(path, open_browser=not args.no_open)


def cmd_score(args: argparse.Namespace) -> None:
    path, meta, key = load_session(args.session)
    ensure_ungraded(path)
    grade = load_agent_json(path / "grade.json", lambda g: validate_grade(g, len(key["errors"])))
    finish(path, meta, key, grade)


def cmd_demo(args: argparse.Namespace) -> None:
    from demo.server import DemoError, export_site, serve

    try:
        if args.export:
            path = export_site(Path(args.export))
            print(f"Static demo written to {path}")
            return
        serve(args.host, args.port, open_browser=not args.no_open)
    except (DemoError, ValueError) as err:
        fail(str(err))


def cmd_check(args: argparse.Namespace) -> None:
    results = run_checks(args.checks)
    for r in results:
        print(f"{r['status'].upper():<11} {r['check']}  ({r['detail']})")
    if any(r["status"] in ("fail", "error") for r in results):
        sys.exit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="redpen", description="Learn math by catching an AI's planted mistakes.")
    sub = parser.add_subparsers(dest="command", required=True, metavar="command")

    def command(name: str, run: Callable, help_text: str, session: bool = True) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_text, description=help_text)
        if session:
            p.add_argument("-s", "--session", help="session id (default: the latest)")
        p.set_defaults(run=run)
        return p

    p = command("new", cmd_new, "start a round: the AI writes a solution with planted errors", session=False)
    p.add_argument("topic", nargs="*", help='a topic ("chain rule") or a full problem statement')
    p.add_argument("-l", "--level", default="2", choices=[*map(str, LEVELS), "blind"],
                   help="0 clean, 1 subtle, 2 minor (default), 3 mixed, 4 nonsense, blind = hidden random 0-2")
    p.add_argument("-d", "--difficulty", default="standard", choices=DIFFICULTIES)
    p.add_argument("-f", "--focus", default="auto",
                   help="error categories to target, comma-separated; 'auto' = your weak spots (default); 'none'")
    p.add_argument("--file", help="read the problem from a text file")
    p.add_argument("--answer", help="known correct final answer (e.g. from your textbook), used as ground truth")
    p.add_argument("--no-open", action="store_true", help="don't open the worksheet in a browser")

    command("hint", cmd_hint, "next hint: error count, then location, then concept (each costs 0.5 points)")

    p = command("submit", cmd_submit, "grade your findings (default: the session's answers.md)")
    p.add_argument("file", nargs="?", help="findings file, or - to read from stdin")
    p.add_argument("--ai", action="store_true", help="let an AI hunt the same worksheet, for comparison")

    p = command("reveal", cmd_reveal, "give up and show the answer key (all errors count as missed)")
    p.add_argument("-y", "--yes", action="store_true", help="don't ask for confirmation")

    command("stats", cmd_stats, "scores by level, error types you miss most, suggested next round", session=False)
    command("verify", cmd_verify, "confirm the answer key wasn't changed after the worksheet was issued")

    p = command("seal", cmd_seal, "agent mode: turn sessions/draft.json into a sealed session", session=False)
    p.add_argument("draft", nargs="?", help="draft file (default: sessions/draft.json)")
    p.add_argument("--no-open", action="store_true", help="don't open the worksheet in a browser")

    command("score", cmd_score, "agent mode: score the session's grade.json and write the report")

    p = command("check", cmd_check, "run SymPy checks such as 'diff(x**3, x) == 3*x**2'", session=False)
    p.add_argument("checks", nargs="+")

    p = command("demo", cmd_demo, "open a browser demo of canned rounds (no API key required)", session=False)
    p.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    p.add_argument("--port", type=int, default=8000, help="port (default: 8000)")
    p.add_argument("--no-open", action="store_true", help="don't open a browser")
    p.add_argument("--export", metavar="DIR", help="write a static site to DIR and exit")
    return parser


def main(argv: list[str] | None = None) -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")  # emoji-safe on legacy Windows consoles
    load_env()
    args = build_parser().parse_args(argv)
    args.run(args)


if __name__ == "__main__":
    main()
