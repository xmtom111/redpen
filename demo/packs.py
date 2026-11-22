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

# Domain-appropriate distractors for non-flaw segments so every clickable segment
# presents 4 plausible choices without leaking which segments contain planted flaws.
DOMAIN_DISTRACTORS: dict[str, dict[str, dict[str, list[str]]]] = {
    "code": {
        "en": {
            "diagnosis": [
                "Off-by-one boundary error skips the first or last element.",
                "Implicit type coercion turns a number into a string on this line.",
                "Variable is read before initialization in this scope.",
                "Null or empty input causes an unhandled runtime exception here.",
                "Operator precedence evaluates the condition in the wrong order.",
                "Mutating shared state here leaks values into later calls.",
                "Return value is ignored, leaving the caller with `None`/`undefined`.",
                "Early exit bypasses cleanup or validation on the following line.",
            ],
            "fix": [
                "Guard against empty or null inputs before executing this line.",
                "Clone the input structure before reading or updating it here.",
                "Add explicit parentheses to enforce the intended precedence.",
                "Rewrite the boundary comparison from `<` to `<=` (or vice versa).",
                "Convert the value explicitly with `int()` / `Number()` before using it.",
                "Move this statement inside an atomic helper or transaction.",
                "Return a fresh copy instead of referencing the local variable.",
                "Replace the inline expression with a parameterized or explicit check.",
            ],
        },
        "zh": {
            "diagnosis": [
                "边界差一错误，会漏掉首项或末项元素。",
                "存在隐式类型转换，导致数字与字符串混用出错。",
                "变量在当前作用域内尚未初始化就被读取。",
                "输入为空或 `None`/`null` 时，这一行会抛出未捕获异常。",
                "运算符优先级导致条件判断顺序与预期不符。",
                "这里原地修改了共享状态，会污染后续调用。",
                "忽略了返回值，导致调用方拿到空值。",
                "提前返回跳过了必要的校验或状态更新。",
            ],
            "fix": [
                "在执行这一行之前补上空值与边界校验。",
                "先对输入数据做深拷贝再读取或修改。",
                "加上显式括号以固定运算符优先级。",
                "把边界比较符号从 `<` 改为 `<=`（或反向调整）。",
                "先显式转换类型后再参与运算或比较。",
                "把这一步放进原子操作或事务块中执行。",
                "返回一个全新的副本而不是直接引用局部变量。",
                "改用参数化或显式分支写法替代当前行。",
            ],
        },
    },
    "logic": {
        "en": {
            "diagnosis": [
                "Confuses correlation with direct causation without ruling out confounders.",
                "Cherry-picks a biased sample and generalizes to the entire population.",
                "Switches the percentage base between two consecutive comparisons.",
                "Draws a sweeping conclusion from a sample size that is far too small.",
                "Ignores the underlying base rate when interpreting a conditional rate.",
                "Uses a misleading baseline or axis scale to exaggerate a tiny gap.",
                "Assumes the converse of a statement is automatically true.",
                "Compares mismatched time windows without controlling for seasonal trends.",
            ],
            "fix": [
                "Narrow the conclusion to the group that was actually measured.",
                "Compare against a matched control group over the same time window.",
                "Convert the percentages into concrete counts out of 1,000 before concluding.",
                "Report both the absolute difference and the underlying sample size.",
                "State only an association and note plausible confounding variables.",
                "Re-plot or re-state the gap relative to a zero baseline.",
                "Collect a larger randomized sample before making a product decision.",
                "Break the pooled average down by subgroup weights before comparing.",
            ],
        },
        "zh": {
            "diagnosis": [
                "把相关性直接当成因果关系，未排除第三方混杂因素。",
                "样本存在选择偏差，却直接推广到了全体人群。",
                "在连续百分比比较中悄悄更换了计算基数。",
                "样本量过小，把随机波动当成了确定规律。",
                "解读条件概率时忽略了事件本身的基础发生率。",
                "利用截断坐标轴或夸大比例尺放大了微小差异。",
                "把充分条件当成必要条件，默认逆命题也成立。",
                "对比了不同时间窗口，没有控制季节性或大盘趋势。",
            ],
            "fix": [
                "把结论严格限定在真正被观测到的那部分人群内。",
                "引入同一时间段、特征相似的对照组后再做比较。",
                "把百分比换算成每 1,000 例里的具体数量后再下判断。",
                "同时给出绝对差值与背后的原始样本量。",
                "仅表述为相关关系，并列出可能的混杂因素。",
                "以 0 为基准重新核对真实差距，避免视觉夸大。",
                "先扩大随机样本量再做决策，不要凭极小样本拍板。",
                "按子分组权重拆开比较，而不是只看合并后的总均值。",
            ],
        },
    },
    "math": {
        "en": {
            "diagnosis": [
                "Sign slip reverses a plus or minus sign in this step.",
                "Drops a constant factor when differentiating or substituting.",
                "Applies an algebraic identity to addition when it only holds for products.",
                "Divides or cancels an expression without checking whether it can be zero.",
                "Ignores a domain restriction required by a root, denominator, or logarithm.",
                "Drops a cross term when expanding a squared expression.",
                "Fails to update bounds or limits after changing variables.",
                "Reverses the upper and lower evaluation endpoints.",
            ],
            "fix": [
                "Keep every factor and re-check the sign by differentiating or substituting back.",
                "Factor the expression instead of cancelling a variable across both sides.",
                "State the domain inequalities first and test every candidate against them.",
                "Expand all terms explicitly, including the middle cross term.",
                "Update both the differential factor and the integration limits together.",
                "Apply the exact identity for products rather than sums.",
                "Verify every arithmetic evaluation at both endpoints.",
                "Keep all real roots from both branches of the square root.",
            ],
        },
        "zh": {
            "diagnosis": [
                "符号出错，这一步漏掉或反转了正负号。",
                "求导或换元时漏乘了必要的系数或内层导数。",
                "误把乘积公式套用在了加法运算上。",
                "两边约去或除以含未知数的式子时，未检验它是否可能为零。",
                "忽略了对数、根式或分母所要求的定义域限制。",
                "展开平方或括号时漏掉了中间交叉项。",
                "换元后忘记同步调整系数或上下限。",
                "代入上下限求差时把顺序写反了。",
            ],
            "fix": [
                "保留全部系数，并用求导或代回原式验算正负号。",
                "改用移项因式分解，避免直接约去可能为零的因式。",
                "先写出完整定义域不等式，再逐一筛选候选解。",
                "把完全平方或括号完整展开，补齐交叉项。",
                "换元时同步改写微分因子与积分限。",
                "改用正确的乘积对数或代数恒等式。",
                "分别重新代入上下限并核对每一步算术。",
                "完整保留开平方或分解得到的全部实数根。",
            ],
        },
    },
}


def _det_shuffle(items: list[Any], seed: str) -> list[Any]:
    """Deterministic, order-hiding shuffle keyed by SHA-256."""
    keyed = []
    for idx, item in enumerate(items):
        tag = item["id"] if isinstance(item, dict) and "id" in item else str(idx)
        digest = hashlib.sha256(f"{seed}:{tag}:{idx}".encode("utf-8")).hexdigest()
        keyed.append((digest, item))
    keyed.sort(key=lambda pair: pair[0])
    return [pair[1] for pair in keyed]


def _pick_distractors(pool: list[str], seed: str, count: int = 4, prefix: str = "d") -> list[dict[str, str]]:
    shuffled = _det_shuffle(list(pool), seed)
    chosen = shuffled[:count]
    return [{"id": f"{prefix}{i}", "label": label} for i, label in enumerate(chosen, 1)]


def build_light_choices(
    puzzle_id: str,
    n_segments: int,
    flaw_choices_by_step: dict[int, dict[str, Any]],
    domain: str,
    lang: str,
    segment_distractors: dict[str, dict[str, list[str]]] | None = None,
) -> dict[str, dict[str, list[dict[str, str]]]]:
    """Build spoiler-free public choices for EVERY segment 1..n_segments."""
    lang_key = "zh" if lang == "zh" else "en"
    domain_pool = DOMAIN_DISTRACTORS.get(domain, DOMAIN_DISTRACTORS["logic"])[lang_key]
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
        else:
            out[step_str] = {
                "diagnosis": _pick_distractors(domain_pool["diagnosis"], f"{puzzle_id}:{step}:diag", 4, "d"),
                "fix": _pick_distractors(domain_pool["fix"], f"{puzzle_id}:{step}:fix", 4, "f"),
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


def validate_pack_puzzle(raw: dict) -> None:
    """Validate a v2 domain pack puzzle file."""
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
    light_choices = build_light_choices(
        raw["id"],
        len(segments),
        flaw_choices_by_step,
        raw["domain"],
        lang,
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

    light_choices = build_light_choices(
        entry["id"],
        len(segments),
        flaw_choices_by_step,
        "math",
        lang,
        spec.get("segment_distractors"),
    )
    entry["pack_id"] = "math"
    entry["domain"] = "math"
    entry["renderer"] = "math"
    entry["code_language"] = ""
    entry["estimated_seconds"] = int(spec.get("estimated_seconds") or max(45, len(steps) * 10))
    entry["segments"] = segments
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
