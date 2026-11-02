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
from demo.grade import blank_grade, grade_findings

ROOT = Path(__file__).resolve().parents[1]
BANK = Path(__file__).resolve().parent / "bank"
STATIC = Path(__file__).resolve().parent / "static"
ID_RE = re.compile(r"^[0-9a-f]{16}$")
LEVEL_CHOICES = (*map(str, redpen.LEVELS), "blind")
ZH_LEVELS = {0: "无错", 1: "隐蔽", 2: "轻微", 3: "混杂", 4: "胡来"}
ZH_BANNER = "RedPen 习题：这份解答可能含有故意埋入的错误。不要把它当作参考答案。"
NO_HINTS = {"en": "This round has no hints.", "zh": "这一轮没有提示。"}
HINTS_DONE = {"en": "No hints left.", "zh": "没有更多提示了。"}
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


def load_banks() -> dict[str, list[dict]]:
    banks = {"en": load_bank()}
    zh_dir = BANK / "zh"
    if any(zh_dir.glob("*.json")):
        banks["zh"] = load_bank(zh_dir, "zh")
    return banks


def load_bank(directory: Path | None = None, lang: str = "en") -> list[dict]:
    """Validate every canned worksheet and seal its key."""
    directory = BANK if directory is None else Path(directory)
    entries = []
    paths = sorted(directory.glob("*.json"))
    if not paths:
        raise DemoError(f"no worksheets in {directory}", 500)
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
        entries.append({
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
        })
    entries.sort(key=lambda entry: (entry["level"], entry["title"]))
    return entries


def card(entry: dict) -> dict:
    """Worksheet fields a hunter may see before the debrief."""
    lang = sheet_lang(entry)
    return {
        "id": entry["id"],
        "title": entry["title"],
        "topic": entry["topic"],
        "blurb": entry["blurb"],
        "level": entry["level"],
        "level_name": level_names(lang)[entry["level"]],
        "difficulty": entry["difficulty"],
        "problem": entry["problem"],
        "steps": entry["steps"],
        "final_answer": entry["final_answer"],
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
    payload = {
        "id": rnd["id"],
        "worksheet_id": entry["id"],
        "title": entry["title"],
        "topic": entry["topic"],
        "problem": entry["problem"],
        "steps": entry["steps"],
        "final_answer": entry["final_answer"],
        "mode": mode,
        "level": None if blind else entry["level"],
        "level_name": None if blind else level_names(sheet_lang(entry))[entry["level"]],
        "difficulty": entry["difficulty"],
        "commitment": entry["commitment"],
        "commitment_short": entry["commitment"][:12],
        "verified": entry["verified"],
        "hints_used": rnd["hints_used"],
        "graded": rnd["graded"],
        "live": bool(entry.get("live")),
        "banner": banner_for(sheet_lang(entry)),
        "lang": sheet_lang(entry),
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


def generate_live(topic: str, mode: str, difficulty: str, lang: str = "en") -> dict:
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
    level = random.choices(list(redpen.BLIND_WEIGHTS), list(redpen.BLIND_WEIGHTS.values()))[0] if mode == "blind" else int(mode)

    def validate(draft: dict) -> None:
        redpen.validate_draft(draft)
        if draft["key"]["level"] != level:
            raise ValueError(f"'key.level' must be {level}")
        draft["_verified"] = check_key(draft["key"])

    task = redpen.setter_task(topic, level, difficulty, [], None)
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
            entries = self._entries(lang)
            self._json({
                "worksheets": [card(entry) for entry in entries],
                "live": live_enabled(),
                "static": False,
                "banner": banner_for(lang if lang in self.server.banks else "en"),
                "lang": lang if lang in self.server.banks else "en",
            })
            return
        parts = [unquote(part) for part in path.split("/") if part]
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
            )
            with self.server.lock:
                self.server.rounds[rnd["id"]] = rnd
            self._json(public_round(rnd))
            return
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "rounds":
            rnd = self._round(parts[2])
            action = parts[3]
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
            candidate = (candidate / "index.html").resolve()
            if candidate != root and root not in candidate.parents:
                raise DemoError("Not found.", 404)
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
        self.rounds = {}
        self.lock = threading.Lock()


def copy_static(dest: Path) -> None:
    for path in STATIC.rglob("*"):
        if not path.is_file() or path.name.startswith("."):
            continue
        rel = path.relative_to(STATIC)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def write_catalog(dest: Path, entries: list[dict], lang: str) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    catalog = {
        "worksheets": [card(entry) for entry in entries],
        "live": False,
        "static": True,
        "banner": banner_for(lang),
        "lang": lang,
    }
    (dest / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
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
    english = bank if bank is not None else load_bank()
    copy_static(dest)
    write_catalog(dest, english, sheet_lang(english[0]) if english else "en")
    zh_dir = BANK / "zh"
    if any(zh_dir.glob("*.json")):
        write_catalog(dest / "zh", load_bank(zh_dir, "zh"), "zh")
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
