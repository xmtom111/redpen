"""Local demo server and static-site export.

Canned answer keys stay in this process. The browser receives a worksheet and a
commitment hash; the key is sent only inside the debrief after submit or reveal.
"""
from __future__ import annotations

import json
import os
import random
import re
import shutil
import sys
import threading
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import redpen
from demo.grade import blank_grade, grade_findings, grade_selections
from demo.packs import (
    PACKS_DIR,
    attach_math_light,
    load_math_light_data,
    load_registry,
    load_v2_pack_dir,
)

ROOT = Path(__file__).resolve().parents[1]
BANK = Path(__file__).resolve().parent / "bank"
STATIC = Path(__file__).resolve().parent / "static"
ID_RE = re.compile(r"^[0-9a-f]{16}$")
LEVEL_CHOICES = (*map(str, redpen.LEVELS), "blind")
ZH_LEVELS = {0: "无错", 1: "隐蔽", 2: "轻微", 3: "混杂", 4: "胡来"}
ZH_BANNER = "RedPen 习题：这份解答可能含有故意埋入的错误。不要把它当作参考答案。"
NO_HINTS = {"en": "This round has no hints.", "zh": "这一轮没有提示。"}
HINTS_DONE = {"en": "No hints left.", "zh": "没有更多提示了。"}
# Files the Chinese page loads from /zh/ that live next to the English page.
ZH_SHARED_ASSETS = ("app.js", "browser-ai.js", "daily.js", "protocol.txt", "grade.js", "style.css", "grade_lexicon.json", "favicon.svg")
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
    ".ico": "image/x-icon",
}


class DemoError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def check_key(key: dict) -> str:
    """Run the key's SymPy checks without writing results back into the key."""
    results = redpen.run_checks(list(key.get("checks") or []))
    bad = [item for item in results if item["status"] in ("fail", "error")]
    if bad:
        detail = "; ".join(f"{item['check']} ({item['detail']})" for item in bad)
        raise ValueError(f"checks of the clean solution failed: {detail}")
    key.pop("check_results", None)
    return redpen.check_summary(results)


def sheet_lang(entry: dict) -> str:
    return "zh" if entry.get("lang") == "zh" else "en"


def level_names(lang: str) -> dict:
    return ZH_LEVELS if lang == "zh" else redpen.LEVELS


def banner_for(lang: str) -> str:
    return ZH_BANNER if lang == "zh" else redpen.BANNER


def localize_verified(summary: str, lang: str) -> str:
    if lang != "zh":
        return summary
    match = re.fullmatch(r"(\d+)/(\d+) SymPy checks passed", summary)
    if match:
        return f"SymPy 检验已通过 {match.group(1)}/{match.group(2)} 项"
    if summary == "no machine checks":
        return "没有机器检验"
    if summary == "not machine-checked (pip install sympy)":
        return "未经机器检验（pip install sympy）"
    return summary


def load_pack_catalog(lang: str = "en") -> dict:
    """Load all registered packs (logic, code, math) for one language."""
    lang = "zh" if lang == "zh" else "en"
    registry = load_registry()
    pack_defs = sorted(registry.get("packs") or [], key=lambda item: item.get("order", 99))
    packs_meta = []
    all_entries: list[dict] = []
    seen_ids: set[str] = set()

    for pack_def in pack_defs:
        pack_id = str(pack_def["id"])
        if "legacy_bank" in pack_def:
            rel = pack_def["legacy_bank"].get(lang)
            if not rel:
                continue
            directory = (PACKS_DIR / rel).resolve()
            if not any(directory.glob("*.json")):
                continue
            entries = load_bank(directory, lang)
        else:
            rel = (pack_def.get("files") or {}).get(lang)
            if not rel:
                continue
            directory = (PACKS_DIR / rel).resolve()
            if not directory.is_dir() or not any(directory.glob("*.json")):
                continue
            entries = load_v2_pack_dir(directory, pack_id)

        for entry in entries:
            if entry["id"] in seen_ids:
                raise DemoError(f"duplicate worksheet id '{entry['id']}' in pack '{pack_id}'", 500)
            seen_ids.add(entry["id"])
        all_entries.extend(entries)
        packs_meta.append({
            "id": pack_id,
            "domain": str(pack_def.get("domain") or pack_id),
            "renderer": str(pack_def.get("renderer") or "prose"),
            "order": int(pack_def.get("order") or 99),
            "title": str((pack_def.get("title") or {}).get(lang) or pack_id),
            "tagline": str((pack_def.get("tagline") or {}).get(lang) or ""),
            "count": len(entries),
            "worksheet_ids": [entry["id"] for entry in entries],
            "file": f"packs/{pack_id}.json",
        })

    if not all_entries:
        # Fallback if registry is empty.
        entries = load_bank(BANK / "zh" if lang == "zh" else BANK, lang)
        all_entries.extend(entries)
        packs_meta = synthesize_packs_meta(entries, lang)
    return {"version": int(registry.get("version") or 1), "lang": lang, "packs": packs_meta, "entries": all_entries}


def synthesize_packs_meta(entries: list[dict], lang: str = "en") -> list[dict]:
    titles = {
        "en": {"logic": "Logic & Stats", "code": "Code Review", "math": "Math"},
        "zh": {"logic": "逻辑与统计", "code": "代码找茬", "math": "数学推理"},
    }
    lang_key = "zh" if lang == "zh" else "en"
    grouped: dict[str, list[dict]] = {}
    for entry in entries:
        pid = entry.get("pack_id") or entry.get("domain") or "math"
        grouped.setdefault(pid, []).append(entry)
    order_map = {"logic": 1, "code": 2, "math": 3}
    packs = []
    for pid, items in sorted(grouped.items(), key=lambda pair: order_map.get(pair[0], 99)):
        packs.append({
            "id": pid,
            "domain": items[0].get("domain") or pid,
            "renderer": items[0].get("renderer") or "math",
            "order": order_map.get(pid, 99),
            "title": titles[lang_key].get(pid, pid),
            "tagline": "",
            "count": len(items),
            "worksheet_ids": [item["id"] for item in items],
            "file": f"packs/{pid}.json",
        })
    return packs


def load_banks() -> dict[str, list[dict]]:
    banks = {"en": load_pack_catalog("en")["entries"]}
    zh_dir = BANK / "zh"
    if any(zh_dir.glob("*.json")):
        banks["zh"] = load_pack_catalog("zh")["entries"]
    return banks


def load_bank(directory: Path | None = None, lang: str = "en") -> list[dict]:
    """Validate every canned math worksheet and seal its key."""
    directory = BANK if directory is None else Path(directory)
    entries = []
    paths = sorted(directory.glob("*.json"))
    if not paths:
        raise DemoError(f"no worksheets in {directory}", 500)
    light_map = load_math_light_data(lang)
    for path in paths:
        draft = json.loads(path.read_text(encoding="utf-8"))
        redpen.validate_draft(draft)
        info = draft.get("meta") or {}
        if not isinstance(info, dict):
            raise DemoError(f"{path.name}: meta must be an object", 500)
        mode = str(info.get("mode", draft["key"]["level"]))
        if mode != str(draft["key"]["level"]):
            raise DemoError(f"{path.name}: meta.mode must match key.level for a canned worksheet", 500)
        verified = localize_verified(check_key(draft["key"]), lang)
        steps = [redpen.STEP_PREFIX.sub("", step).strip() for step in draft["steps"]]
        entry = {
            "id": path.stem,
            "title": draft["title"],
            "problem": draft["problem"],
            "steps": steps,
            "final_answer": draft["final_answer"],
            "key": draft["key"],
            "topic": str(info.get("topic") or draft["title"]),
            "mode": mode,
            "difficulty": str(info.get("difficulty") or "standard"),
            "blurb": str(info.get("blurb") or ""),
            "level": draft["key"]["level"],
            "commitment": redpen.commitment(draft["key"]),
            "verified": verified,
            "live": False,
            "lang": lang,
        }
        attach_math_light(entry, lang, light_map)
        entries.append(entry)
    entries.sort(key=lambda entry: (entry["level"], entry["title"]))
    return entries


def card(entry: dict) -> dict:
    """Worksheet fields a hunter may see before the debrief."""
    lang = sheet_lang(entry)
    return {
        "id": entry["id"],
        "pack_id": entry.get("pack_id") or entry.get("domain") or "math",
        "domain": entry.get("domain") or "math",
        "renderer": entry.get("renderer") or "math",
        "code_language": entry.get("code_language") or "",
        "estimated_seconds": int(entry.get("estimated_seconds") or 60),
        "title": entry["title"],
        "topic": entry["topic"],
        "blurb": entry["blurb"],
        "level": entry["level"],
        "level_name": level_names(lang)[entry["level"]],
        "difficulty": entry["difficulty"],
        "opener": bool(entry.get("opener")),
        "problem": entry["problem"],
        "segments": entry.get("segments") or [
            {"id": idx, "label": f"{'步骤' if lang == 'zh' else 'Step'} {idx}", "text": step}
            for idx, step in enumerate(entry["steps"], 1)
        ],
        "steps": entry["steps"],
        "final_answer": entry["final_answer"],
        "light_choices": entry.get("light_choices") or {},
        "commitment": entry["commitment"],
        "commitment_short": entry["commitment"][:12],
        "verified": entry["verified"],
        "n_steps": len(entry["steps"]),
        "lang": lang,
    }


def hint_list(entry: dict, mode: str) -> list[str]:
    if sheet_lang(entry) == "zh":
        key = entry["key"]
        n_steps = len(entry["steps"])
        hints = []
        if mode == "blind" or key["level"] >= 2:
            hints.append(f"这份解答里有 {len(key['errors'])} 处故意埋入的错误。")
        for index, error in enumerate(key["errors"], 1):
            low, high = max(1, error["step"] - 1), min(n_steps, error["step"] + 1)
            hints.append(f"第 {index} 处错误：仔细看步骤 {low}-{high}。")
            hints.append(f"第 {index} 处错误：{error['hint']}")
        return hints
    meta = {"mode": mode, "worksheet": {"steps": entry["steps"]}}
    return redpen.hint_ladder(meta, entry["key"])


def public_round(rnd: dict) -> dict:
    entry, mode = rnd["entry"], rnd["mode"]
    blind = mode == "blind"
    lang = sheet_lang(entry)
    payload = {
        "id": rnd["id"],
        "worksheet_id": entry["id"],
        "pack_id": entry.get("pack_id") or entry.get("domain") or "math",
        "domain": entry.get("domain") or "math",
        "renderer": entry.get("renderer") or "math",
        "code_language": entry.get("code_language") or "",
        "estimated_seconds": int(entry.get("estimated_seconds") or 60),
        "title": entry["title"],
        "topic": entry["topic"],
        "problem": entry["problem"],
        "segments": entry.get("segments") or [
            {"id": idx, "label": f"{'步骤' if lang == 'zh' else 'Step'} {idx}", "text": step}
            for idx, step in enumerate(entry["steps"], 1)
        ],
        "steps": entry["steps"],
        "final_answer": entry["final_answer"],
        "light_choices": entry.get("light_choices") or {},
        "mode": mode,
        "level": None if blind else entry["level"],
        "level_name": None if blind else level_names(lang)[entry["level"]],
        "difficulty": entry["difficulty"],
        "opener": bool(entry.get("opener")),
        "commitment": entry["commitment"],
        "commitment_short": entry["commitment"][:12],
        "verified": entry["verified"],
        "hints_used": rnd["hints_used"],
        "graded": rnd["graded"],
        "live": bool(entry.get("live")),
        "banner": banner_for(lang),
        "lang": lang,
    }
    if rnd.get("debrief"):
        payload["debrief"] = rnd["debrief"]
    return payload


def build_debrief(entry: dict, mode: str, hints_used: int, grade: dict, *, revealed: bool = False,
                  grader: str = "auto") -> dict:
    """Structured debrief. The raw key's check expressions are not included."""
    meta = {
        "id": entry["id"],
        "mode": mode,
        "topic": entry["topic"],
        "commitment": entry["commitment"],
        "verified": entry["verified"],
        "hints_used": hints_used,
        "worksheet": {
            "title": entry["title"],
            "problem": entry["problem"],
            "steps": entry["steps"],
            "final_answer": entry["final_answer"],
        },
    }
    key = entry["key"]
    redpen.validate_grade(grade, len(key["errors"]))
    scored = redpen.score_round(len(key["errors"]), grade, hints_used)
    result = dict(scored)
    result["grade"] = grade
    if revealed:
        result["score"] = None
        result["revealed"] = True
    result["next"] = redpen.next_command(meta, key, result)
    errors = []
    for index, (error, row) in enumerate(zip(key["errors"], grade["errors"]), 1):
        errors.append({
            "index": index,
            "step": error["step"],
            "category": error["category"],
            "found": row["found"],
            "diagnosis": row["diagnosis"],
            "fix": row["fix"],
            "shown": error["corrupted"],
            "correct": error["original"],
            "why_wrong": error["why_wrong"],
            "why_tempting": error["why_tempting"],
            "catch_rule": error["catch_rule"],
            "comment": row.get("comment") or "",
            "practice_problem": error["practice"]["problem"],
            "practice_answer": error["practice"]["answer"],
        })
    payload = {
        "title": entry["title"],
        "grader": grader,
        "score": result["score"],
        "revealed": revealed,
        "found": result["found"],
        "planted": result["planted"],
        "false_alarms": result["false_alarms"],
        "bounties": result["bounties"],
        "hints_used": result["hints_used"],
        "level": entry["level"],
        "level_name": level_names(sheet_lang(entry))[entry["level"]],
        "mode": mode,
        "commitment": entry["commitment"],
        "commitment_short": entry["commitment"][:12],
        "commitment_ok": redpen.commitment(key) == entry["commitment"],
        "verified": entry["verified"],
        "feedback": grade.get("feedback") or "",
        "next": result["next"],
        "clean_steps": list(key["clean_steps"]),
        "clean_final_answer": key["clean_final_answer"],
        "errors": errors,
        "false_alarm_details": list(grade.get("false_alarms") or []),
        "bounty_details": list(grade.get("bounties") or []),
        "reference_check": key.get("reference_check", "none"),
    }
    payload["report_md"] = redpen.render_report(meta, key, result, who="You")
    return payload


def new_id() -> str:
    return os.urandom(8).hex()


def make_round(entry: dict, mode: str) -> dict:
    return {
        "id": new_id(),
        "entry": entry,
        "mode": mode,
        "hints_used": 0,
        "graded": False,
        "debrief": None,
    }


def live_enabled() -> bool:
    return bool(os.environ.get("REDPEN_MODEL"))


def generate_live(topic: str, mode: str, difficulty: str, lang: str = "en", focus: list[str] | None = None, answer: str | None = None) -> dict:
    if not live_enabled():
        raise DemoError("Live rounds need REDPEN_MODEL in the environment. Canned rounds work with no key.")
    topic = " ".join(topic.split())
    if not topic:
        raise DemoError("Give a topic or a problem statement.")
    if len(topic) > 4000:
        raise DemoError("Topic is too long.")
    if mode not in LEVEL_CHOICES:
        raise DemoError("Level must be 0, 1, 2, 3, 4, or blind.")
    if difficulty not in redpen.DIFFICULTIES:
        raise DemoError("Difficulty must be intro, standard, advanced, or competition.")
    if focus is not None and (not isinstance(focus, list) or len(focus) > 30 or not all(isinstance(item, str) and len(item) <= 80 for item in focus)):
        raise DemoError("Focus must be a list of category names.")
    if answer is not None and (not isinstance(answer, str) or len(answer) > 4000):
        raise DemoError("Reference answer must be text up to 4000 characters.")
    level = random.choices(list(redpen.BLIND_WEIGHTS), list(redpen.BLIND_WEIGHTS.values()))[0] if mode == "blind" else int(mode)

    def validate(draft: dict) -> None:
        redpen.validate_draft(draft)
        if draft["key"]["level"] != level:
            raise ValueError(f"'key.level' must be {level}")
        draft["_verified"] = check_key(draft["key"])

    task = redpen.setter_task(topic, level, difficulty, focus or [], answer)
    if lang == "zh":
        task += "\nLanguage for all text: zh-Hans. Category ids stay in English."
    try:
        draft = redpen.ask_json(task, validate)
    except SystemExit as err:
        message = str(err) or "the model request failed"
        raise DemoError(message[:300]) from None
    verified = str(draft.pop("_verified", ""))
    draft["key"].pop("check_results", None)
    entry = {
        "id": "live",
        "title": draft["title"],
        "problem": draft["problem"],
        "steps": [redpen.STEP_PREFIX.sub("", step).strip() for step in draft["steps"]],
        "final_answer": draft["final_answer"],
        "key": draft["key"],
        "topic": topic,
        "mode": str(level),
        "difficulty": difficulty,
        "blurb": "",
        "level": level,
        "commitment": redpen.commitment(draft["key"]),
        "verified": localize_verified(verified, lang),
        "live": True,
        "lang": "zh" if lang == "zh" else "en",
    }
    return make_round(entry, mode)


def grade_round(rnd: dict, findings: str) -> dict:
    entry = rnd["entry"]
    if entry.get("live"):
        meta = {
            "worksheet": {
                "title": entry["title"],
                "problem": entry["problem"],
                "steps": entry["steps"],
                "final_answer": entry["final_answer"],
            }
        }
        task = redpen.grader_task(meta, entry["key"], findings)
        if sheet_lang(entry) == "zh":
            task += "\nWrite comment and feedback in Simplified Chinese."
        try:
            grade = redpen.ask_json(
                task,
                lambda candidate: redpen.validate_grade(candidate, len(entry["key"]["errors"])),
            )
            return build_debrief(entry, rnd["mode"], rnd["hints_used"], grade, grader="model")
        except SystemExit:
            grade = grade_findings(entry, findings)
            grade["feedback"] = (
                "The model grader did not return a usable score, so this round was scored by the automatic demo grader. "
                + grade["feedback"]
            )
            return build_debrief(entry, rnd["mode"], rnd["hints_used"], grade, grader="auto")
    grade = grade_findings(entry, findings)
    return build_debrief(entry, rnd["mode"], rnd["hints_used"], grade, grader="auto")


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "RedPenDemo/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("redpen demo: " + (fmt % args) + "\n")

    def do_GET(self) -> None:  # noqa: N802
        try:
            self._get()
        except DemoError as err:
            self._json({"error": str(err)}, err.status)
        except Exception:
            traceback.print_exc()
            self._json({"error": "internal error"}, 500)

    def do_POST(self) -> None:  # noqa: N802
        try:
            self._post()
        except DemoError as err:
            self._json({"error": str(err)}, err.status)
        except Exception:
            traceback.print_exc()
            self._json({"error": "internal error"}, 500)

    def _get(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            bank = self.server.bank
            self._json({"ok": True, "live": live_enabled(), "static": False, "worksheets": len(bank)})
            return
        if path == "/api/catalog":
            lang = self._requested_lang(urlparse(self.path).query)
            actual_lang = lang if lang in self.server.banks else "en"
            entries = self._entries(actual_lang)
            self._json({
                "worksheets": [card(entry) for entry in entries],
                "packs": self.server.packs_for(actual_lang),
                "live": live_enabled(),
                "static": False,
                "banner": banner_for(actual_lang),
                "lang": actual_lang,
            })
            return
        if path == "/api/packs":
            lang = self._requested_lang(urlparse(self.path).query)
            actual_lang = lang if lang in self.server.banks else "en"
            self._json({
                "version": 1,
                "lang": actual_lang,
                "live": live_enabled(),
                "static": False,
                "banner": banner_for(actual_lang),
                "packs": self.server.packs_for(actual_lang),
            })
            return
        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "packs":
            lang = self._requested_lang(urlparse(self.path).query)
            actual_lang = lang if lang in self.server.banks else "en"
            pack_id = parts[2]
            pack_meta = next((p for p in self.server.packs_for(actual_lang) if p["id"] == pack_id), None)
            if pack_meta is None:
                raise DemoError("Unknown pack.", 404)
            entries = [e for e in self._entries(actual_lang) if (e.get("pack_id") or e.get("domain") or "math") == pack_id]
            self._json({
                "pack": pack_meta,
                "worksheets": [card(entry) for entry in entries],
                "lang": actual_lang,
                "static": False,
            })
            return
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "rounds":
            self._json(public_round(self._round(parts[2])))
            return
        if parts and parts[0] == "api":
            raise DemoError("Unknown endpoint.", 404)
        self._static(path)

    def _post(self) -> None:
        path = urlparse(self.path).path.rstrip("/")
        body = self._body()
        parts = [unquote(part) for part in path.split("/") if part]
        if parts == ["api", "rounds"]:
            self._json(public_round(self._start(body)))
            return
        if parts == ["api", "live"]:
            rnd = generate_live(
                str(body.get("topic") or ""),
                str(body.get("level") or "2"),
                str(body.get("difficulty") or "standard"),
                self._body_lang(body),
                body.get("focus") or [],
                body.get("answer") or None,
            )
            with self.server.lock:
                self.server.rounds[rnd["id"]] = rnd
            self._json(public_round(rnd))
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "rounds":
            rnd = self._round(parts[2])
            action = parts[3]
            if action == "verify":
                self._json({"commitment_ok": redpen.commitment(rnd["entry"]["key"]) == rnd["entry"]["commitment"],
                            "checks": check_key(dict(rnd["entry"]["key"]))})
                return
            if action == "ai":
                if not rnd["graded"]:
                    raise DemoError("Submit your findings before comparing with AI.", 409)
                if not (os.environ.get("REDPEN_HUNTER_MODEL") or live_enabled()):
                    raise DemoError("Set up an AI model in the browser or configure the server model first.")
                task = redpen.hunter_task({"worksheet": {k: rnd["entry"][k] for k in ("title", "problem", "steps", "final_answer")}})
                try:
                    findings = redpen.strip_thinking(redpen.llm(task, "REDPEN_HUNTER_MODEL"))
                except SystemExit as err:
                    raise DemoError(str(err)[:300]) from None
                self._json({"findings": findings, "debrief": grade_round(rnd, findings)})
                return
            if action == "hint":
                self._json(self._hint(rnd))
                return
            if action == "submit":
                self._json(self._submit(rnd, body))
                return
            if action == "reveal":
                self._json(self._reveal(rnd))
                return
        raise DemoError("Unknown endpoint.", 404)

    def _requested_lang(self, query: str) -> str:
        raw = (parse_qs(query).get("lang") or ["en"])[0]
        return raw if raw in self.server.banks else "en"

    def _body_lang(self, body: dict) -> str:
        raw = body.get("lang")
        if isinstance(raw, str) and raw in self.server.banks:
            return raw
        return "en"

    def _entries(self, lang: str) -> list[dict]:
        return self.server.banks.get(lang) or self.server.bank

    def _start(self, body: dict) -> dict:
        lang = self._body_lang(body)
        bank = self._entries(lang)
        blind = bool(body.get("blind")) or body.get("worksheet_id") == "blind"
        if blind:
            pool = [entry for entry in bank if entry["level"] <= 2]
            entry = random.choice(pool)
            mode = "blind"
        else:
            wanted = str(body.get("worksheet_id") or "")
            entry = next((item for item in bank if item["id"] == wanted), None)
            if entry is None:
                raise DemoError("Unknown worksheet.", 404)
            mode = entry["mode"]
        rnd = make_round(entry, mode)
        with self.server.lock:
            self.server.rounds[rnd["id"]] = rnd
        return rnd

    def _round(self, round_id: str) -> dict:
        if not ID_RE.fullmatch(round_id or ""):
            raise DemoError("Unknown round.", 404)
        with self.server.lock:
            rnd = self.server.rounds.get(round_id)
        if rnd is None:
            raise DemoError("Unknown round.", 404)
        return rnd

    def _hint(self, rnd: dict) -> dict:
        if rnd["graded"]:
            raise DemoError("This round is already graded.", 409)
        hints = hint_list(rnd["entry"], rnd["mode"])
        lang = sheet_lang(rnd["entry"])
        if not hints:
            return {"hint": NO_HINTS[lang], "hints_used": rnd["hints_used"], "done": True}
        if rnd["hints_used"] >= len(hints):
            return {"hint": HINTS_DONE[lang], "hints_used": rnd["hints_used"], "done": True}
        text = hints[rnd["hints_used"]]
        rnd["hints_used"] += 1
        return {
            "hint": text,
            "hints_used": rnd["hints_used"],
            "cost": redpen.HINT_COST,
            "done": rnd["hints_used"] >= len(hints),
        }

    def _submit(self, rnd: dict, body: dict) -> dict:
        if rnd["graded"]:
            raise DemoError("This round is already graded.", 409)
        if "selections" in body or body.get("mode") == "light":
            selections = body.get("selections")
            if selections is None:
                selections = []
            if not isinstance(selections, list) or len(selections) > 60:
                raise DemoError("Send selections as a list.")
            clean_claim = bool(body.get("clean_claim"))
            grade = grade_selections(rnd["entry"], selections, clean_claim=clean_claim)
            debrief = build_debrief(rnd["entry"], rnd["mode"], rnd["hints_used"], grade, grader="auto")
            rnd["graded"] = True
            rnd["debrief"] = debrief
            return debrief
        findings = body.get("findings")
        if not isinstance(findings, str):
            raise DemoError("Send findings as a string.")
        if len(findings) > 20000:
            raise DemoError("Findings are too long.")
        debrief = grade_round(rnd, findings)
        rnd["graded"] = True
        rnd["debrief"] = debrief
        return debrief

    def _reveal(self, rnd: dict) -> dict:
        if rnd["graded"]:
            raise DemoError("This round is already graded.", 409)
        grade = blank_grade(len(rnd["entry"]["key"]["errors"]), sheet_lang(rnd["entry"]))
        debrief = build_debrief(
            rnd["entry"], rnd["mode"], rnd["hints_used"], grade, revealed=True, grader="reveal"
        )
        rnd["graded"] = True
        rnd["debrief"] = debrief
        return debrief

    def _body(self) -> dict:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError:
            raise DemoError("Content-Length must be an integer.") from None
        if length < 0 or length > 100_000:
            raise DemoError("Request body is too large.")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise DemoError("Send a JSON object.") from None
        if not isinstance(data, dict):
            raise DemoError("Send a JSON object.")
        return data

    def _json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, url_path: str) -> None:
        rel = unquote(url_path).lstrip("/")
        if rel in ("", "."):
            rel = "index.html"
        if "\\" in rel or rel.startswith("/") or ".." in Path(rel).parts:
            raise DemoError("Not found.", 404)
        candidate = (STATIC / rel).resolve()
        root = STATIC.resolve()
        if candidate != root and root not in candidate.parents:
            raise DemoError("Not found.", 404)
        if candidate.is_dir():
            if not url_path.endswith("/"):
                location = url_path if url_path.startswith("/") else "/" + url_path
                if not location.endswith("/"):
                    location += "/"
                query = urlparse(self.path).query
                if query:
                    location += "?" + query
                self.send_response(301)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            candidate = (candidate / "index.html").resolve()
            if candidate != root and root not in candidate.parents:
                raise DemoError("Not found.", 404)
        if not candidate.is_file():
            parts = Path(rel).parts
            if len(parts) == 2 and parts[0] == "zh" and parts[1] in ZH_SHARED_ASSETS:
                fallback = (STATIC / parts[1]).resolve()
                if fallback.is_file() and (fallback == root or root in fallback.parents):
                    candidate = fallback
        if not candidate.is_file():
            raise DemoError("Not found.", 404)
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(candidate.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


class DemoServer(ThreadingHTTPServer):
    def __init__(self, address, bank):
        super().__init__(address, DemoHandler)
        if isinstance(bank, dict):
            self.banks = bank
            self.bank = bank.get("en") or next(iter(bank.values()))
        else:
            self.banks = {"en": bank}
            self.bank = bank
        self.packs_by_lang: dict[str, list[dict]] = {}
        for lang, entries in self.banks.items():
            try:
                catalog = load_pack_catalog(lang)
                reg_by_id = {p["id"]: p for p in catalog["packs"]}
            except Exception:
                reg_by_id = {}
            synth = synthesize_packs_meta(entries, lang)
            merged = []
            for item in synth:
                meta = dict(item)
                if item["id"] in reg_by_id:
                    meta["title"] = reg_by_id[item["id"]]["title"]
                    meta["tagline"] = reg_by_id[item["id"]]["tagline"]
                    meta["order"] = reg_by_id[item["id"]]["order"]
                merged.append(meta)
            merged.sort(key=lambda p: p.get("order", 99))
            self.packs_by_lang[lang] = merged
        self.rounds = {}
        self.lock = threading.Lock()

    def packs_for(self, lang: str) -> list[dict]:
        return self.packs_by_lang.get(lang) or self.packs_by_lang.get("en") or []


def copy_static(dest: Path) -> None:
    for path in STATIC.rglob("*"):
        if not path.is_file() or path.name.startswith("."):
            continue
        rel = path.relative_to(STATIC)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    zh_root = dest / "zh"
    zh_root.mkdir(parents=True, exist_ok=True)
    for name in ZH_SHARED_ASSETS:
        shutil.copy2(STATIC / name, zh_root / name)


def write_catalog(dest: Path, entries: list[dict], lang: str, packs_meta: list[dict] | None = None) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    packs_meta = synthesize_packs_meta(entries, lang) if packs_meta is None else packs_meta
    cards = [card(entry) for entry in entries]
    catalog = {
        "worksheets": cards,
        "packs": packs_meta,
        "live": False,
        "static": True,
        "banner": banner_for(lang),
        "lang": lang,
    }
    (dest / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    packs_dir = dest / "packs"
    packs_dir.mkdir(exist_ok=True)
    keep_packs = {"index.json"} | {f"{p['id']}.json" for p in packs_meta}
    for stale in packs_dir.glob("*.json"):
        if stale.name not in keep_packs:
            stale.unlink()
    pack_index = {
        "version": 1,
        "lang": lang,
        "live": False,
        "static": True,
        "banner": banner_for(lang),
        "packs": packs_meta,
    }
    (packs_dir / "index.json").write_text(
        json.dumps(pack_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for pack_meta in packs_meta:
        pid = pack_meta["id"]
        pack_cards = [c for c in cards if (c.get("pack_id") or c.get("domain") or "math") == pid]
        pack_payload = {
            "pack": pack_meta,
            "worksheets": pack_cards,
            "lang": lang,
            "static": True,
        }
        (packs_dir / f"{pid}.json").write_text(
            json.dumps(pack_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    secret_dir = dest / "secrets"
    secret_dir.mkdir(exist_ok=True)
    keep = {f"{entry['id']}.json" for entry in entries}
    for stale in secret_dir.glob("*.json"):
        if stale.name not in keep:
            stale.unlink()
    for entry in entries:
        secret = {"id": entry["id"], "key": entry["key"]}
        (secret_dir / f"{entry['id']}.json").write_text(
            json.dumps(secret, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )


def export_site(dest: Path, bank: list[dict] | None = None) -> Path:
    """Write a static site that grades in the browser, in English and zh-Hans."""
    dest = dest.resolve()
    if dest.exists() and any(dest.iterdir()) and not (dest / "catalog.json").exists():
        raise DemoError(f"{dest} is not empty and is not a previous export")
    dest.mkdir(parents=True, exist_ok=True)
    copy_static(dest)
    if bank is not None:
        lang = sheet_lang(bank[0]) if bank else "en"
        write_catalog(dest, bank, lang)
    else:
        en_cat = load_pack_catalog("en")
        write_catalog(dest, en_cat["entries"], "en", en_cat["packs"])
    zh_dir = BANK / "zh"
    if any(zh_dir.glob("*.json")):
        zh_cat = load_pack_catalog("zh")
        write_catalog(dest / "zh", zh_cat["entries"], "zh", zh_cat["packs"])
    (dest / ".nojekyll").write_text("", encoding="utf-8")
    return dest


def serve(host: str, port: int, *, open_browser: bool = True, bank: list[dict] | None = None) -> None:
    loaded = bank if bank is not None else load_banks()
    try:
        httpd = DemoServer((host, port), loaded)
    except OSError as err:
        redpen.fail(f"cannot listen on {host}:{port} ({err.strerror})")
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    url = f"http://{shown}:{httpd.server_address[1]}/"
    print(f"RedPen demo: {url}")
    if "zh" in httpd.banks:
        print(f"Chinese demo: {url}zh/")
        rounds = f"{len(httpd.bank)} English, {len(httpd.banks['zh'])} Chinese"
    else:
        rounds = str(len(httpd.bank))
    print(f"Canned rounds: {rounds}. No API key required. Stop with Ctrl-C.")
    if live_enabled():
        print("Live rounds are on: a model will write and grade those worksheets. The key stays in this process.")
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
