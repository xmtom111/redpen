"""Tests for Web-first pack loading, static export, light-mode grading parity, and Daily RedPen."""
import json
import shutil
import subprocess
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

import redpen
from demo.grade import grade_selections
from demo.packs import normalize_v2_puzzle, validate_pack_puzzle
from demo.server import DemoServer, build_debrief, card, export_site, load_banks, load_pack_catalog

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
SECRET_MARKERS = ("why_wrong", "why_tempting", "catch_rule", "clean_final_answer", "clean_steps", "diagnosis_answer", "fix_answer")


def clean_pack_fixture():
    fixture = ROOT / "demo" / "packs" / "code" / "en" / "code-clean-binary-search.json"
    return json.loads(fixture.read_text(encoding="utf-8"))


class PackAndExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.en = load_pack_catalog("en")
        cls.zh = load_pack_catalog("zh")

    def test_bilingual_packs_are_aligned_and_complete(self):
        self.assertEqual([p["id"] for p in self.en["packs"]], ["logic", "code", "math"])
        self.assertEqual([p["id"] for p in self.zh["packs"]], ["logic", "code", "math"])
        counts_en = {p["id"]: p["count"] for p in self.en["packs"]}
        counts_zh = {p["id"]: p["count"] for p in self.zh["packs"]}
        self.assertEqual(counts_en, counts_zh)
        self.assertGreaterEqual(counts_en["logic"], 6)
        self.assertGreaterEqual(counts_en["code"], 6)
        self.assertGreaterEqual(counts_en["math"], 5)

        en_ids = sorted(e["id"] for e in self.en["entries"])
        zh_ids = sorted(e["id"] for e in self.zh["entries"])
        self.assertEqual(en_ids, zh_ids)

        for lang_cat in (self.en, self.zh):
            for entry in lang_cat["entries"]:
                public = card(entry)
                self.assertNotIn("kind", public)
                self.assertNotIn("explanation", public)
                encoded = json.dumps(public, ensure_ascii=False)
                for marker in SECRET_MARKERS:
                    self.assertNotIn(marker, encoded, f"secret marker {marker} leaked in {entry['id']}")
                self.assertEqual(redpen.commitment(entry["key"]), entry["commitment"])
                self.assertIn(public["domain"], ("logic", "code", "math"))
                self.assertEqual(len(public["segments"]), len(public["steps"]))
                # Every clickable segment has 3-4 diagnosis and 3-4 fix choices (no visual tells).
                self.assertTrue(public["light_play"])
                self.assertLessEqual(
                    set(public["light_choices"]), {str(seg["id"]) for seg in public["segments"]}
                )
                for step, choices in public["light_choices"].items():
                    self.assertTrue(3 <= len(choices["diagnosis"]) <= 4, f"{entry['id']} seg {step}")
                    self.assertTrue(3 <= len(choices["fix"]) <= 4, f"{entry['id']} seg {step}")
                # Every planted error's answer id is present in the public choices for its segment.
                for err in entry["key"]["errors"]:
                    choices = public["light_choices"][str(err["step"])]
                    self.assertIn(err["diagnosis_answer"], [c["id"] for c in choices["diagnosis"]])
                    self.assertIn(err["fix_answer"], [c["id"] for c in choices["fix"]])

    def test_authored_choices_are_segment_specific(self):
        for catalog in (self.en, self.zh):
            entries = {entry["id"]: entry for entry in catalog["entries"]}
            cabin = entries["logic-chat-cabin-split"]["light_choices"]
            laundry = entries["logic-chat-laundry-queue"]["light_choices"]
            self.assertTrue({"1", "2", "3", "4"} <= set(cabin))
            self.assertTrue({"1", "2", "3"} <= set(laundry))
            for group in ("diagnosis", "fix"):
                labels = lambda choices: {choice["label"] for choice in choices[group]}
                self.assertFalse(labels(cabin["1"]) & labels(laundry["1"]))
                self.assertFalse(labels(cabin["1"]) & labels(cabin["2"]))
            empty = clean_pack_fixture()
            empty.pop("segment_distractors")
            entry = normalize_v2_puzzle(empty, "code")
            self.assertTrue(card(entry)["light_play"])
            self.assertEqual(card(entry)["light_choices"], {})

    def test_kind_and_segment_distractors_validation(self):
        for changes, message in (
            ({"kind": "unknown"}, "kind"),
            ({"kind": "planted"}, "level"),
            ({"kind": "clean", "level": 1}, "level"),
            ({"kind": "trick_clean", "explanation": None}, "one-line"),
            ({"kind": "trick_clean", "explanation": "  "}, "one-line"),
            ({"kind": "trick_clean", "explanation": "One\nTwo"}, "one-line"),
            ({"segment_distractors": {"99": {}}}, "segment_distractors"),
            ({"segment_distractors": {"2": {"diagnosis": ["one"]}}}, "3-4 distinct"),
        ):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, message):
                payload = {**clean_pack_fixture(), **changes}
                payload = {key: value for key, value in payload.items() if value is not None}
                validate_pack_puzzle(payload)
        legacy = clean_pack_fixture()
        legacy.pop("kind")
        self.assertEqual(normalize_v2_puzzle(legacy, "code")["kind"], "clean")

    def test_export_writes_pack_manifests_and_per_domain_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "site"
            export_site(dest)
            for prefix in (dest, dest / "zh"):
                self.assertTrue((prefix / "daily.js").is_file())
                index = json.loads((prefix / "packs" / "index.json").read_text(encoding="utf-8"))
                self.assertTrue(index["static"])
                self.assertEqual([p["id"] for p in index["packs"]], ["logic", "code", "math"])
                total = 0
                for pack in index["packs"]:
                    pack_file = prefix / pack["file"]
                    self.assertTrue(pack_file.is_file())
                    data = json.loads(pack_file.read_text(encoding="utf-8"))
                    self.assertEqual(len(data["worksheets"]), pack["count"])
                    total += len(data["worksheets"])
                    encoded = json.dumps(data, ensure_ascii=False)
                    for marker in SECRET_MARKERS:
                        self.assertNotIn(marker, encoded)
                    for item in data["worksheets"]:
                        secret = json.loads((prefix / "secrets" / f"{item['id']}.json").read_text(encoding="utf-8"))
                        self.assertEqual(item["commitment"], redpen.commitment(secret["key"]))
                self.assertGreaterEqual(total, 26)

    def test_server_pack_endpoints_and_light_mode_submit(self):
        banks = load_banks()
        httpd = DemoServer(("127.0.0.1", 0), banks)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        port = httpd.server_address[1]
        self.addCleanup(httpd.shutdown)
        self.addCleanup(httpd.server_close)

        def fetch_json(path, body=None):
            data = None if body is None else json.dumps(body).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}{path}",
                data=data,
                method="POST" if data is not None else "GET",
                headers={"Content-Type": "application/json"} if data is not None else {},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))

        status, idx = fetch_json("/api/packs?lang=zh")
        self.assertEqual(status, 200)
        self.assertEqual([p["id"] for p in idx["packs"]], ["logic", "code", "math"])

        status, code_pack = fetch_json("/api/packs/code?lang=zh")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(code_pack["worksheets"]), 6)

        # Play a code puzzle in light mode via HTTP.
        status, rnd = fetch_json("/api/rounds", {"worksheet_id": "code-mutable-default", "lang": "zh"})
        self.assertEqual(status, 200)
        self.assertEqual(rnd["domain"], "code")
        self.assertEqual(rnd["renderer"], "code")
        self.assertIn("1", rnd["light_choices"])

        status, debrief = fetch_json(
            f"/api/rounds/{rnd['id']}/submit",
            {
                "mode": "light",
                "clean_claim": False,
                "selections": [{"step": 1, "diagnosis_id": "d1", "fix_id": "f1"}],
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(debrief["score"], 100)
        self.assertEqual(debrief["found"], 1)
        self.assertEqual(debrief["false_alarms"], 0)


class LightGradingAndDailyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.en_by_id = {e["id"]: e for e in load_pack_catalog("en")["entries"]}
        cls.zh_by_id = {e["id"]: e for e in load_pack_catalog("zh")["entries"]}

    def test_light_mode_grading_python_and_js_parity(self):
        trick = normalize_v2_puzzle({
            **clean_pack_fixture(),
            "id": "trick-clean-fixture",
            "kind": "trick_clean",
            "explanation": "When only one seat is left, you still have to check who's sitting in it.",
        }, "code")
        self.en_by_id[trick["id"]] = trick
        reveal = build_debrief(trick, "0", 0, grade_selections(trick, []), revealed=True)
        self.assertEqual(reveal["explanation"], trick["key"]["explanation"])
        self.assertNotIn("explanation", card(trick))
        cases = [
            # Perfect hit on code L1
            ("en", "code-mutable-default", False, [{"step": 1, "diagnosis_id": "d1", "fix_id": "f1"}], 100, 1, 0),
            # Right location + right diag, wrong fix
            ("en", "code-mutable-default", False, [{"step": 1, "diagnosis_id": "d1", "fix_id": "f2"}], 67, 1, 0),
            # Hit + 1 false alarm on a valid line after the flaw
            ("en", "code-mutable-default", False, [
                {"step": 1, "diagnosis_id": "d1", "fix_id": "f1"},
                {"step": 4, "diagnosis_id": "d2", "fix_id": "f2"},
            ], 67, 1, 1),
            # Clean round trusted -> 100
            ("en", "code-clean-binary-search", True, [], 100, 0, 0),
            # Clean round flagged -> 67 (1 false alarm)
            ("en", "code-clean-binary-search", False, [{"step": 3, "diagnosis_id": "d1", "fix_id": "f1"}], 67, 0, 1),
            ("en", "trick-clean-fixture", True, [], 100, 0, 0),
            ("en", "trick-clean-fixture", False, [{"step": 3, "diagnosis_id": "d1", "fix_id": "f1"}], 67, 0, 1),
            ("en", "code-mutable-default", True, [], 0, 0, 0),
            # Two-flaw logic round in Chinese: 1 perfect, 1 missed
            ("zh", "logic-coffee-promotions", False, [{"step": 3, "diagnosis_id": "d1", "fix_id": "f1"}], 50, 1, 0),
            # Math legacy round in light mode (Chinese)
            ("zh", "cubic-lost-root", False, [{"step": 2, "diagnosis_id": "d1", "fix_id": "f1"}], 100, 1, 0),
        ]

        py_results = []
        js_cases = []
        for lang, pid, clean_claim, sels, exp_score, exp_found, exp_alarms in cases:
            entry = self.zh_by_id[pid] if lang == "zh" else self.en_by_id[pid]
            grade = grade_selections(entry, sels, clean_claim=clean_claim)
            redpen.validate_grade(grade, len(entry["key"]["errors"]))
            scored = redpen.score_round(len(entry["key"]["errors"]), grade, 0)
            self.assertEqual(scored["score"], exp_score, (pid, sels))
            self.assertEqual(scored["found"], exp_found, (pid, sels))
            self.assertEqual(scored["false_alarms"], exp_alarms, (pid, sels))
            py_results.append(grade)
            js_cases.append({"entry": entry, "selections": sels, "clean_claim": clean_claim})

        if NODE is None:
            self.skipTest("node required for JS parity check")
        script = (
            "const fs=require('fs');const g=require('./demo/static/grade.js');"
            "const cases=JSON.parse(fs.readFileSync(0,'utf8'));"
            "console.log(JSON.stringify(cases.map(c=>g.gradeSelections(c.entry,c.selections,c.clean_claim))));"
        )
        out = subprocess.check_output([NODE, "-e", script], input=json.dumps(js_cases).encode("utf-8"), cwd=ROOT)
        self.assertEqual(json.loads(out.decode("utf-8")), py_results)

    def test_daily_determinism_fallback_streaks_and_spoiler_free_share(self):
        if NODE is None:
            self.skipTest("node required for daily.js tests")
        en_cards = [card(e) for e in self.en_by_id.values()]
        zh_cards = [card(e) for e in self.zh_by_id.values()]
        script = r"""
const assert = require('assert/strict');
const fs = require('fs');
const Daily = require('./demo/static/daily.js');
const { enCards, zhCards } = JSON.parse(fs.readFileSync(0, 'utf8'));

// 1. Deterministic across repeated calls and identical IDs across EN & ZH.
const d1 = Daily.selectDaily(enCards, '2026-11-20', 3);
const d1Again = Daily.selectDaily(enCards.slice().reverse(), '2026-11-20', 3);
const d1Zh = Daily.selectDaily(zhCards, '2026-11-20', 3);
assert.deepEqual(d1.map(x => x.id), d1Again.map(x => x.id));
assert.deepEqual(d1.map(x => x.id), d1Zh.map(x => x.id));
assert.deepEqual(d1.map(x => x.domain), ['logic', 'code', 'math']);
assert.equal(d1[0].opener, true);
assert.equal(d1Zh[0].opener, true);

// First-slot rotation stays inside the opener pool and visits each opener once per cycle.
// 2026-01-01 is dayIdx 0, so it starts a cycle for any pool length.
const openers = enCards.filter(x => x.opener === true).map(x => x.id).sort();
assert.ok(openers.length >= 4);
const firstIds = [];
for (let i = 0; i < openers.length; i++) {
  const day = String(1 + i).padStart(2, '0');
  const picked = Daily.selectDaily(enCards, `2026-01-${day}`, 3);
  assert.equal(picked[0].opener, true);
  firstIds.push(picked[0].id);
}
assert.deepEqual([...firstIds].sort(), openers);

// 2. Consecutive days do not repeat puzzles within a domain cycle.
const d2 = Daily.selectDaily(enCards, '2026-11-21', 3);
for (let i = 0; i < 3; i++) {
  assert.notEqual(d1[i].id, d2[i].id);
}

// A mixed bank can start with either kind of correct puzzle and can draw
// all correct, all planted, or a mix. Two-opener pools still alternate.
const days = Array.from({length: 180}, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
const mixed = ['logic', 'code', 'math'].flatMap(domain =>
  ['planted', 'clean', 'trick_clean', 'planted'].map((kind, i) =>
    ({ id: domain + i, domain, kind, opener: domain === 'logic' })));
const draws = days.map(date => Daily.selectDaily(mixed, date));
for (const slot of [0, 1, 2]) {
  assert.deepEqual(new Set(draws.map(row => row[slot].kind)), new Set(['planted', 'clean', 'trick_clean']));
}
assert.deepEqual(new Set(draws.map(row => row.filter(item => item.kind !== 'planted').length)),
                 new Set([0, 1, 2, 3]));
assert.ok(draws.slice(1).every((row, i) => row[0].id !== draws[i][0].id));
const twoOpeners = mixed.filter(x => x.domain !== 'logic' || x.kind !== 'planted');
const two = days.map(date => Daily.selectDaily(twoOpeners, date)[0].id);
assert.ok(two.slice(1).every((id, i) => id !== two[i]));

// 3. Fallback when one domain is missing still returns 3 deterministic unique puzzles.
const noCode = enCards.filter(x => x.domain !== 'code');
const fb1 = Daily.selectDaily(noCode, '2026-11-20', 3);
const fb2 = Daily.selectDaily(noCode.slice().reverse(), '2026-11-20', 3);
assert.equal(fb1.length, 3);
assert.equal(new Set(fb1.map(x => x.id)).size, 3);
assert.deepEqual(fb1.map(x => x.id), fb2.map(x => x.id));

// 4. Streak tracking & EN/ZH localStorage isolation.
const mem = new Map();
const store = { getItem: k => mem.get(k) || null, setItem: (k, v) => mem.set(k, v) };
const ids1 = d1.map(x => x.id);
const ids2 = d2.map(x => x.id);
for (const item of d1) {
  Daily.recordDailyResult('en', '2026-11-20', ids1, item.id, { score: 100, found: 1, planted: 1, false_alarms: 0, elapsedSec: 30, domain: item.domain }, store);
}
assert.equal(Daily.currentStreak(Daily.loadState('en', store), '2026-11-20'), 1);
assert.equal(Daily.currentStreak(Daily.loadState('zh', store), '2026-11-20'), 0);
for (const item of d2) {
  Daily.recordDailyResult('en', '2026-11-21', ids2, item.id, { score: 80, found: 1, planted: 1, false_alarms: 1, elapsedSec: 40, domain: item.domain }, store);
}
assert.equal(Daily.currentStreak(Daily.loadState('en', store), '2026-11-21'), 2);
// Missed a day -> streak resets to 0 on 2026-11-23.
assert.equal(Daily.currentStreak(Daily.loadState('en', store), '2026-11-23'), 0);

// 5. Spoiler-free Wordle share card in EN & ZH (no step numbers or flaw details).
const stEn = Daily.loadState('en', store);
const cardEn = Daily.formatShareCard({
  locale: 'en', dateStr: '2026-11-21', dailyItems: d2,
  dayResults: stEn.days['2026-11-21'].results, streak: 2,
});
assert.match(cardEn, /RedPen Daily #\d+/);
assert.match(cardEn, /2026-11-21/);
assert.match(cardEn, /2-day streak/);
assert.match(cardEn, /Does this hold up\?/);
assert.doesNotMatch(cardEn, /Step \d|L\d|Claim \d/i);

const cardZh = Daily.formatShareCard({
  locale: 'zh', dateStr: '2026-11-21', dailyItems: d2,
  dayResults: stEn.days['2026-11-21'].results, streak: 2,
});
assert.match(cardZh, /今日红笔 #\d+/);
assert.match(cardZh, /连续 2 天/);
assert.match(cardZh, /红笔抓错：这段话站得住脚吗？/);
assert.doesNotMatch(cardZh, /步骤\s*\d|第\s*\d|论点\s*\d/);
console.log('PASS daily determinism, fallback, streaks, isolation, spoiler-free share');
"""
        completed = subprocess.run(
            [NODE, "-e", script],
            input=json.dumps({"enCards": en_cards, "zhCards": zh_cards}).encode("utf-8"),
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr.decode("utf-8", "replace"))


class PlayFeelExportTest(unittest.TestCase):
    def test_exported_first_screens_are_playable_not_worksheets(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "site"
            export_site(dest)
            en_index = (dest / "index.html").read_text(encoding="utf-8")
            zh_index = (dest / "zh" / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("Worksheets can contain planted flaws", en_index)
            self.assertNotIn("请以批改复盘为准", zh_index)
            self.assertIn("Does this hold up?", en_index)
            self.assertIn("这段话站得住脚吗？", zh_index)

            for prefix in (dest, dest / "zh"):
                app_js = (prefix / "app.js").read_text(encoding="utf-8")
                css = (prefix / "style.css").read_text(encoding="utf-8")
                self.assertIn("function pickDefaultPuzzle", app_js)
                self.assertIn("First-screen instant play", app_js)
                self.assertIn("Does this hold up?", app_js)
                self.assertIn("这段话站得住脚吗？", app_js)
                self.assertIn("Tap a shaky line, or clear it as solid.", app_js)
                self.assertIn("觉得不对就用红笔点那一句；若没漏洞也可以直接放行", app_js)
                self.assertIn("Holds up", app_js)
                self.assertIn("没毛病，站得住", app_js)
                self.assertIn("Copy text", app_js)
                self.assertIn("复制战绩文本", app_js)
                self.assertIn("function playDockHtml", app_js)
                self.assertIn("function shareCardVisualHtml", app_js)
                self.assertIn("choice-drawer", app_js)
                self.assertIn("canNativeShare", app_js)
                # Commitment verification stays in the post-round details, not the play surface.
                start = app_js.index("function roundHtml()")
                mid = app_js.index("function debriefHtml(")
                self.assertNotIn('data-act="verify"', app_js[start:mid])
                self.assertIn('data-act="verify"', app_js[mid:])
                self.assertIn("@keyframes ink-flag", css)
                self.assertIn("@keyframes score-pop", css)
                self.assertIn(".play-dock", css)
                self.assertIn(".share-card", css)
                self.assertIn(".choice-drawer", css)




if __name__ == "__main__":
    unittest.main()
