"""Pack registry, unified v2 puzzle schema validation, and legacy math bank adapter.

The frontend engine only renders segments, tap-to-flag choices, and debriefs.
All domain content and answer keys live in pack JSON files (or legacy demo/bank/).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import redpen

DEMO_DIR = Path(__file__).resolve().parent
PACKS_DIR = DEMO_DIR / "packs"
REGISTRY_PATH = PACKS_DIR / "index.json"

VALID_DOMAINS = ("logic", "code", "math")
VALID_RENDERERS = ("prose", "code", "math", "markdown")

def _det_shuffle(items: list[Any], seed: str) -> list[Any]:
    """Deterministic, order-hiding shuffle keyed by SHA-256."""
    keyed = []
    for idx, item in enumerate(items):
        tag = item["id"] if isinstance(item, dict) and "id" in item else str(idx)
        digest = hashlib.sha256(f"{seed}:{tag}:{idx}".encode("utf-8")).hexdigest()
        keyed.append((digest, item))
    keyed.sort(key=lambda pair: pair[0])
    return [pair[1] for pair in keyed]


def build_light_choices(
    puzzle_id: str,
    n_segments: int,
    flaw_choices_by_step: dict[int, dict[str, Any]],
    segment_distractors: dict[str, dict[str, list[str]]] | None = None,
) -> dict[str, dict[str, list[dict[str, str]]]]:
    """Expose only explicitly authored choices."""
    custom = segment_distractors or {}
    out: dict[str, dict[str, list[dict[str, str]]]] = {}

    for step in range(1, n_segments + 1):
        step_str = str(step)
        if step in flaw_choices_by_step:
            raw = flaw_choices_by_step[step]
            diag = [{"id": str(c["id"]), "label": str(c["label"])} for c in raw["diagnosis_choices"]]
            fix = [{"id": str(c["id"]), "label": str(c["label"])} for c in raw["fix_choices"]]
            out[step_str] = {
                "diagnosis": _det_shuffle(diag, f"{puzzle_id}:{step}:diag"),
                "fix": _det_shuffle(fix, f"{puzzle_id}:{step}:fix"),
            }
        elif step_str in custom and custom[step_str].get("diagnosis") and custom[step_str].get("fix"):
            c_diag = [{"id": f"d{i}", "label": str(t)} for i, t in enumerate(custom[step_str]["diagnosis"], 1)]
            c_fix = [{"id": f"f{i}", "label": str(t)} for i, t in enumerate(custom[step_str]["fix"], 1)]
            out[step_str] = {
                "diagnosis": _det_shuffle(c_diag, f"{puzzle_id}:{step}:diag"),
                "fix": _det_shuffle(c_fix, f"{puzzle_id}:{step}:fix"),
            }
    return out


def load_registry() -> dict:
    if not REGISTRY_PATH.is_file():
        return {"version": 1, "packs": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _validate_choices(choices: Any, answer_id: Any, label: str) -> None:
    if not isinstance(choices, list) or not 3 <= len(choices) <= 4:
        raise ValueError(f"{label} must have 3-4 choices")
    ids = set()
    for choice in choices:
        if not isinstance(choice, dict):
            raise ValueError(f"{label} entries must be objects")
        cid = choice.get("id")
        text = choice.get("label")
        if not isinstance(cid, str) or not cid.strip() or cid in ids:
            raise ValueError(f"{label} has missing or duplicate choice id")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{label} choice '{cid}' needs non-empty label")
        ids.add(cid)
    if not isinstance(answer_id, str) or answer_id not in ids:
        raise ValueError(f"{label} answer '{answer_id}' is not in choice ids")


def worksheet_kind(raw: dict, level: int) -> str:
    """Accept older packs that predate the explicit kind field."""
    kind = raw.get("kind", "clean" if level == 0 else "planted")
    if kind not in ("planted", "clean", "trick_clean"):
        raise ValueError("'kind' must be planted, clean, or trick_clean")
    if (kind == "planted") != (level != 0):
        raise ValueError("'kind' must agree with the worksheet level")
    explanation = raw.get("explanation")
    if kind == "trick_clean" and (
        not isinstance(explanation, str) or not explanation.strip()
        or len(explanation.strip().splitlines()) != 1
    ):
        raise ValueError("trick_clean needs a one-line 'explanation'")
    return kind


def validate_segment_distractors(custom: Any, n_segments: int) -> None:
    if not isinstance(custom, dict):
        raise ValueError("'segment_distractors' must be an object")
    steps = {str(i) for i in range(1, n_segments + 1)}
    for step, choices in custom.items():
        if step not in steps or not isinstance(choices, dict):
            raise ValueError(f"invalid segment_distractors entry for {step}")
        for group in ("diagnosis", "fix"):
            labels = choices.get(group)
            if (not isinstance(labels, list) or not 3 <= len(labels) <= 4
                    or not all(isinstance(label, str) and label.strip() for label in labels)
                    or len({label.strip() for label in labels}) != len(labels)):
                raise ValueError(f"segment {step} needs 3-4 distinct {group} labels")


def validate_pack_puzzle(raw: dict) -> None:
    """Validate a v2 puzzle.

    Flaws carry their own choices. Other segments are playable when their
    string ID has authored diagnosis and fix labels in segment_distractors.
    """
    for field in ("id", "domain", "renderer", "lang", "title", "prompt", "conclusion", "clean_conclusion"):
        value = raw.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"'{field}' is missing or empty")
    if raw["domain"] not in VALID_DOMAINS:
        raise ValueError(f"unsupported domain '{raw['domain']}'")
    if raw["renderer"] not in VALID_RENDERERS:
        raise ValueError(f"unsupported renderer '{raw['renderer']}'")
    level = raw.get("level")
    if isinstance(level, bool) or not isinstance(level, int) or level not in redpen.LEVELS:
        raise ValueError("'level' must be an integer 0-4")
    worksheet_kind(raw, level)
    est = raw.get("estimated_seconds")
    if isinstance(est, bool) or not isinstance(est, int) or not 15 <= est <= 600:
        raise ValueError("'estimated_seconds' must be an integer 15-600")
    if "opener" in raw and not isinstance(raw["opener"], bool):
        raise ValueError("'opener' must be a boolean if present")
    segments = raw.get("segments")
    if not isinstance(segments, list) or not 3 <= len(segments) <= 30:
        raise ValueError("'segments' must be a list of 3-30 objects")
    for idx, seg in enumerate(segments, 1):
        if not isinstance(seg, dict):
            raise ValueError("each segment must be an object")
        if seg.get("id") != idx:
            raise ValueError(f"segment {idx} must have id={idx}")
        if not isinstance(seg.get("label"), str) or not seg["label"].strip():
            raise ValueError(f"segment {idx} needs a non-empty label")
        if not isinstance(seg.get("text"), str) or not seg["text"].strip():
            raise ValueError(f"segment {idx} needs non-empty text")
    validate_segment_distractors(raw.get("segment_distractors", {}), len(segments))
    clean_segments = raw.get("clean_segments")
    if not isinstance(clean_segments, list) or not clean_segments or not all(isinstance(s, str) and s.strip() for s in clean_segments):
        raise ValueError("'clean_segments' must be a non-empty list of strings")

    flaws = raw.get("flaws")
    if not isinstance(flaws, list):
        raise ValueError("'flaws' must be a list")
    low, high = redpen.error_bounds(level, len(segments))
    if not low <= len(flaws) <= high:
        raise ValueError(f"level {level} with {len(segments)} segments needs {low}-{high} flaws, got {len(flaws)}")
    seen = set()
    for flaw in flaws:
        if not isinstance(flaw, dict):
            raise ValueError("each flaw must be an object")
        seg_id = flaw.get("segment_id")
        if isinstance(seg_id, bool) or not isinstance(seg_id, int) or not 1 <= seg_id <= len(segments) or seg_id in seen:
            raise ValueError(f"flaw segment_id {seg_id} is out of range or duplicated")
        seen.add(seg_id)
        for name in ("error_type", "original", "corrupted", "explanation", "why_tempting", "catch_rule", "hint"):
            if not isinstance(flaw.get(name), str) or not flaw[name].strip():
                raise ValueError(f"flaw at segment {seg_id} missing '{name}'")
        if flaw["corrupted"].strip() != segments[seg_id - 1]["text"].strip():
            raise ValueError(f"flaw at segment {seg_id}: 'corrupted' does not match segment text")
        if flaw["original"].strip() == flaw["corrupted"].strip():
            raise ValueError(f"flaw at segment {seg_id}: 'original' and 'corrupted' are identical")
        practice = flaw.get("practice")
        if not isinstance(practice, dict) or not isinstance(practice.get("problem"), str) or not isinstance(practice.get("answer"), str):
            raise ValueError(f"flaw at segment {seg_id} needs practice.problem and practice.answer")
        _validate_choices(flaw.get("diagnosis_choices"), flaw.get("diagnosis_answer"), f"flaw {seg_id} diagnosis")
        _validate_choices(flaw.get("fix_choices"), flaw.get("fix_answer"), f"flaw {seg_id} fix")


def normalize_v2_puzzle(raw: dict, pack_id: str) -> dict:
    """Convert a validated v2 puzzle into the unified server/export entry shape."""
    validate_pack_puzzle(raw)
    lang = "zh" if raw["lang"] == "zh" else "en"
    segments = [
        {"id": seg["id"], "label": seg["label"], "text": seg["text"]}
        for seg in raw["segments"]
    ]
    steps = [seg["text"] for seg in segments]
    flaws_sorted = sorted(raw["flaws"], key=lambda item: item["segment_id"])

    errors = []
    flaw_choices_by_step: dict[int, dict[str, Any]] = {}
    for flaw in flaws_sorted:
        step = flaw["segment_id"]
        diag_label = next(c["label"] for c in flaw["diagnosis_choices"] if c["id"] == flaw["diagnosis_answer"])
        fix_label = next(c["label"] for c in flaw["fix_choices"] if c["id"] == flaw["fix_answer"])
        errors.append({
            "step": step,
            "category": flaw["error_type"],
            "original": flaw["original"],
            "corrupted": flaw["corrupted"],
            "why_wrong": flaw["explanation"],
            "why_tempting": flaw["why_tempting"],
            "catch_rule": flaw["catch_rule"],
            "hint": flaw["hint"],
            "practice": {
                "problem": flaw["practice"]["problem"],
                "answer": flaw["practice"]["answer"],
            },
            "diagnosis_answer": flaw["diagnosis_answer"],
            "fix_answer": flaw["fix_answer"],
            "diagnosis_label": diag_label,
            "fix_label": fix_label,
        })
        flaw_choices_by_step[step] = {
            "diagnosis_choices": flaw["diagnosis_choices"],
            "fix_choices": flaw["fix_choices"],
        }

    key = {
        "level": raw["level"],
        "clean_steps": list(raw["clean_segments"]),
        "clean_final_answer": raw["clean_conclusion"],
        "errors": errors,
        "checks": list(raw.get("checks") or []),
        "reference_check": raw.get("reference_check") or "none",
    }
    if raw.get("explanation"):
        key["explanation"] = raw["explanation"]
    light_choices = build_light_choices(
        raw["id"],
        len(segments),
        flaw_choices_by_step,
        raw.get("segment_distractors"),
    )
    verified = "人工审校题包" if lang == "zh" else "Curated pack"
    return {
        "id": raw["id"],
        "pack_id": pack_id,
        "domain": raw["domain"],
        "renderer": raw["renderer"],
        "code_language": raw.get("code_language") or "",
        "estimated_seconds": raw["estimated_seconds"],
        "title": raw["title"],
        "problem": raw["prompt"],
        "segments": segments,
        "steps": steps,
        "final_answer": raw["conclusion"],
        "key": key,
        "light_choices": light_choices,
        "topic": str(raw.get("topic") or raw["title"]),
        "mode": str(raw["level"]),
        "difficulty": str(raw.get("difficulty") or "standard"),
        "blurb": str(raw.get("blurb") or ""),
        "opener": bool(raw.get("opener")),
        "level": raw["level"],
        "kind": worksheet_kind(raw, raw["level"]),
        "commitment": redpen.commitment(key),
        "verified": verified,
        "live": False,
        "lang": lang,
    }


def load_math_light_data(lang: str) -> dict:
    filename = "light_zh.json" if lang == "zh" else "light_en.json"
    path = PACKS_DIR / "math" / filename
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def attach_math_light(entry: dict, lang: str, light_map: dict | None = None) -> dict:
    """Adapt a legacy math worksheet entry to the unified segment + light-mode format."""
    lang = "zh" if lang == "zh" else "en"
    prefix = "步骤" if lang == "zh" else "Step"
    steps = entry["steps"]
    segments = [
        {"id": idx, "label": f"{prefix} {idx}", "text": step}
        for idx, step in enumerate(steps, 1)
    ]
    light_map = load_math_light_data(lang) if light_map is None else light_map
    spec = light_map.get(entry["id"]) or {}
    validate_segment_distractors(spec.get("segment_distractors", {}), len(segments))
    flaws_spec = spec.get("flaws") or {}

    flaw_choices_by_step: dict[int, dict[str, Any]] = {}
    for error in entry["key"]["errors"]:
        step = error["step"]
        flaw_data = flaws_spec.get(str(step))
        if flaw_data:
            _validate_choices(flaw_data["diagnosis_choices"], flaw_data["diagnosis_answer"], f"{entry['id']} step {step} diagnosis")
            _validate_choices(flaw_data["fix_choices"], flaw_data["fix_answer"], f"{entry['id']} step {step} fix")
            diag_label = next(c["label"] for c in flaw_data["diagnosis_choices"] if c["id"] == flaw_data["diagnosis_answer"])
            fix_label = next(c["label"] for c in flaw_data["fix_choices"] if c["id"] == flaw_data["fix_answer"])
            error["diagnosis_answer"] = flaw_data["diagnosis_answer"]
            error["fix_answer"] = flaw_data["fix_answer"]
            error["diagnosis_label"] = diag_label
            error["fix_label"] = fix_label
            flaw_choices_by_step[step] = {
                "diagnosis_choices": flaw_data["diagnosis_choices"],
                "fix_choices": flaw_data["fix_choices"],
            }

    if spec and len(flaw_choices_by_step) != len(entry["key"]["errors"]):
        raise ValueError(f"{entry['id']} needs light choices for every flaw")
    light_choices = build_light_choices(
        entry["id"],
        len(segments),
        flaw_choices_by_step,
        spec.get("segment_distractors"),
    )
    entry["pack_id"] = "math"
    entry["domain"] = "math"
    entry["renderer"] = "math"
    entry["code_language"] = ""
    entry["estimated_seconds"] = int(spec.get("estimated_seconds") or max(45, len(steps) * 10))
    entry["segments"] = segments
    if spec or not entry["key"]["errors"]:
        entry["light_choices"] = light_choices
    entry["commitment"] = redpen.commitment(entry["key"])
    return entry


def load_v2_pack_dir(directory: Path, pack_id: str) -> list[dict]:
    paths = sorted(directory.glob("*.json"))
    entries = []
    for path in paths:
        raw = json.loads(path.read_text(encoding="utf-8"))
        entries.append(normalize_v2_puzzle(raw, pack_id))
    entries.sort(key=lambda item: (item["level"], item["id"]))
    return entries
