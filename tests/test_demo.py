"""Browser demo: canned keys, automatic grader, local server, static export."""
import hashlib
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

import sympy as sp

import redpen
from demo.grade import grade_findings
from demo.server import DemoError, DemoServer, build_debrief, export_site, load_bank

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")

CUBIC_GOOD = """\
Step 2
What's wrong: Dividing by x assumes x is not zero, so the root x = 0 is discarded.
Fix: Factor x(x^2 - 4) = 0, which gives x = -2, x = 0, and x = 2.
"""
CUBIC_NEIGHBOR = """\
Step 3
What's wrong: The previous division by x discarded the root x = 0.
Fix: Keep the factor x and solve x(x^2-4)=0, so x is -2, 0, or 2.
"""
CHAIN_BOTH = """\
Step 2
What's wrong: The chain rule is missing the inner derivative 2x.
Fix: d/dx sin(x^2) = 2x cos(x^2).

Step 3
What's wrong: (x+1)^2 = x^2 + 2x + 1, not x^2 + 1. The cross term is missing.
Fix: Expand (x+1)^2 = x^2 + 2x + 1, so the derivative of that term is 2x + 2.
"""
CHAIN_VAGUE = """\
Step 2
What's wrong: the derivative is off
"""
LOG_BOTH = """\
Step 1
What's wrong: ln is only defined for positive arguments, so the domain is x > 2.
Fix: Require x > 0 and x - 2 > 0, hence x > 2.

Step 2
What's wrong: A sum of logarithms is the logarithm of a product, ln(ab), not a sum.
Fix: ln x + ln(x-2) = ln(x(x-2)), so x(x-2) = 3 and x = 3.
"""
SINE_BOTH = """\
Step 3
What's wrong: dx = du/2, so the factor 1/2 is missing from the integral.
Fix: The integral is (1/2) times the integral of sin u from 0 to pi.

Step 4
What's wrong: The antiderivative of sin u is -cos u, not cos u. The minus sign is wrong.
Fix: An antiderivative of sin u is -cos u.
"""
SINE_EARLY = """\
Step 1
What's wrong: The substitution itself is illegal.
Fix: Do not substitute.
"""
CLEAN = "No errors found.\n"
INTEGRAL_FLAG = """\
Step 4
What's wrong: 1 cubed plus 1 squared is not 2.
Fix: F(1) = 3.
"""


def rows(grade):
    return [(row["found"], row["diagnosis"], row["fix"]) for row in grade["errors"]]


class BankAndGraderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank = load_bank()
        cls.by_id = {entry["id"]: entry for entry in cls.bank}

    def entry(self, worksheet_id):
        return self.by_id[worksheet_id]

    def test_bank_matches_the_level_rules_and_checks(self):
        self.assertEqual(
            [entry["id"] for entry in self.bank],
            ["definite-integral", "cubic-lost-root", "log-equation", "sine-substitution", "chain-and-square"],
        )
        for entry in self.bank:
            self.assertEqual(redpen.commitment(entry["key"]), entry["commitment"])
            self.assertIn("passed", entry["verified"])
            self.assertNotIn("check_results", entry["key"])
            redpen.validate_grade(grade_findings(entry, CLEAN), len(entry["key"]["errors"]))

    def test_clean_mathematics(self):
        x = sp.symbols("x")
        self.assertEqual(set(sp.solve(sp.Eq(x**3, 4 * x), x)), {0, -2, 2})
        self.assertEqual(set(sp.solve(x**4 - 9 * x**2, x)), {0, -3, 3})
        f = sp.sin(x**2) + (x + 1) ** 2
        clean = 2 * x * sp.cos(x**2) + 2 * x + 2
        shown = sp.cos(x**2) + 2 * x
        self.assertEqual(sp.simplify(sp.diff(f, x) - clean), 0)
        self.assertNotEqual(sp.simplify(sp.diff(f, x) - shown), 0)
        self.assertEqual(sp.simplify(sp.diff(sp.cos(x**3), x) + 3 * x**2 * sp.sin(x**3)), 0)
        self.assertEqual(sp.expand((x - 3) ** 2), x**2 - 6 * x + 9)
        self.assertEqual(sp.integrate(3 * x**2 + 2 * x, (x, 0, 1)), 2)
        self.assertEqual(sp.simplify(sp.log(3) + sp.log(1) - sp.log(3)), 0)
        self.assertNotEqual(sp.simplify(sp.log(sp.Rational(5, 2)) + sp.log(sp.Rational(5, 2) - 2) - sp.log(3)), 0)
        self.assertEqual(set(sp.solve(x**2 + 3 * x - 4, x)), {-4, 1})
        self.assertEqual(sp.simplify(sp.log(6) + sp.log(2) - sp.log(12)), 0)
        self.assertEqual(sp.integrate(sp.sin(2 * x), (x, 0, sp.pi / 2)), 1)
        self.assertEqual(sp.simplify(sp.integrate(sp.exp(3 * x), (x, 0, 1)) - (sp.exp(3) - 1) / 3), 0)
        self.assertEqual(sp.diff(-sp.cos(x), x), sp.sin(x))

    def test_scores_a_careful_hunt_and_ignores_mere_symptoms(self):
        cubic = grade_findings(self.entry("cubic-lost-root"), CUBIC_GOOD)
        self.assertEqual(rows(cubic), [(True, 1, 1)])
        self.assertEqual(cubic["false_alarms"], [])
        self.assertEqual(redpen.score_round(1, cubic, 0)["score"], 100)

        neighbor = grade_findings(self.entry("cubic-lost-root"), CUBIC_NEIGHBOR)
        self.assertEqual(rows(neighbor), [(True, 0.5, 1)])

        symptom = grade_findings(self.entry("cubic-lost-root"), "The final answer is wrong.\n")
        self.assertEqual(rows(symptom), [(False, 0, 0)])
        self.assertEqual(symptom["false_alarms"], [])
        self.assertEqual(redpen.score_round(1, symptom, 0)["score"], 0)

        clean = grade_findings(self.entry("cubic-lost-root"), CLEAN)
        self.assertEqual(rows(clean), [(False, 0, 0)])
        self.assertIn("missed 1 planted error", clean["feedback"])

        chain = grade_findings(self.entry("chain-and-square"), CHAIN_BOTH)
        self.assertEqual(rows(chain), [(True, 1, 1), (True, 1, 1)])
        vague = grade_findings(self.entry("chain-and-square"), CHAIN_VAGUE)
        self.assertEqual(rows(vague), [(True, 0.5, 0), (False, 0, 0)])

        logs = grade_findings(self.entry("log-equation"), LOG_BOTH)
        self.assertEqual(rows(logs), [(True, 1, 1), (True, 1, 1)])
        sine = grade_findings(self.entry("sine-substitution"), SINE_BOTH)
        self.assertEqual(rows(sine), [(True, 1, 1), (True, 1, 1)])

    def test_false_alarms_and_a_clean_round(self):
        early = grade_findings(self.entry("sine-substitution"), SINE_EARLY)
        self.assertEqual(rows(early), [(False, 0, 0), (False, 0, 0)])
        self.assertEqual([item["step"] for item in early["false_alarms"]], [1])
        flagged = grade_findings(self.entry("definite-integral"), INTEGRAL_FLAG)
        self.assertEqual(len(flagged["false_alarms"]), 1)
        self.assertEqual(redpen.score_round(0, flagged, 0)["score"], 67)
        trusted = grade_findings(self.entry("definite-integral"), CLEAN)
        self.assertEqual(trusted["false_alarms"], [])
        self.assertEqual(redpen.score_round(0, trusted, 0)["score"], 100)
        hinted = redpen.score_round(1, grade_findings(self.entry("cubic-lost-root"), CUBIC_GOOD), 1)
        self.assertEqual(hinted["score"], 83)

    def test_empty_template_claims_the_work_is_clean(self):
        template = "Step:\nWhat's wrong:\nFix:\n"
        parsed_grade = grade_findings(self.entry("cubic-lost-root"), template)
        self.assertEqual(rows(parsed_grade), [(False, 0, 0)])
        self.assertEqual(parsed_grade["false_alarms"], [])

    def test_browser_grader_matches_python(self):
        if NODE is None:
            self.skipTest("node is required to compare the browser grader")
        cases = [
            {"id": "cubic-lost-root", "mode": "1", "hints_used": 0, "findings": CUBIC_GOOD, "revealed": False},
            {"id": "cubic-lost-root", "mode": "1", "hints_used": 1, "findings": CUBIC_GOOD, "revealed": False},
            {"id": "cubic-lost-root", "mode": "blind", "hints_used": 0, "findings": "The final answer is wrong.\n", "revealed": False},
            {"id": "cubic-lost-root", "mode": "1", "hints_used": 2, "findings": "", "revealed": True},
            {"id": "chain-and-square", "mode": "2", "hints_used": 0, "findings": CHAIN_BOTH, "revealed": False},
            {"id": "chain-and-square", "mode": "2", "hints_used": 0, "findings": CHAIN_VAGUE, "revealed": False},
            {"id": "log-equation", "mode": "2", "hints_used": 0, "findings": LOG_BOTH, "revealed": False},
            {"id": "sine-substitution", "mode": "2", "hints_used": 0, "findings": SINE_BOTH, "revealed": False},
            {"id": "sine-substitution", "mode": "2", "hints_used": 0, "findings": SINE_EARLY, "revealed": False},
            {"id": "definite-integral", "mode": "0", "hints_used": 0, "findings": CLEAN, "revealed": False},
            {"id": "definite-integral", "mode": "0", "hints_used": 0, "findings": INTEGRAL_FLAG, "revealed": False},
            {"id": "definite-integral", "mode": "blind", "hints_used": 1, "findings": CLEAN, "revealed": False},
        ]
        expected = []
        for case in cases:
            entry = self.entry(case["id"])
            if case["revealed"]:
                from demo.grade import blank_grade
                grade = blank_grade(len(entry["key"]["errors"]))
            else:
                grade = grade_findings(entry, case["findings"])
            debrief = build_debrief(
                entry, case["mode"], case["hints_used"], grade,
                revealed=case["revealed"], grader="reveal" if case["revealed"] else "auto",
            )
            debrief.pop("report_md")
            expected.append(debrief)

        scores = []
        for n_errors in range(0, 4):
            for hints in (0, 1, 2):
                for alarms in (0, 1):
                    for diagnosis, fix in ((0, 0), (0.5, 0), (1, 0.5), (1, 1)):
                        found_rows = []
                        if n_errors:
                            found_rows.append({"found": True, "diagnosis": diagnosis, "fix": fix})
                            found_rows.extend({"found": False, "diagnosis": 0, "fix": 0} for _ in range(n_errors - 1))
                        grade = {"errors": found_rows, "false_alarms": [{}] * alarms, "bounties": []}
                        scores.append({
                            "n": n_errors,
                            "hints": hints,
                            "grade": grade,
                            "score": redpen.score_round(n_errors, grade, hints)["score"],
                        })
        lexicon = json.loads((ROOT / "demo" / "static" / "grade_lexicon.json").read_text(encoding="utf-8"))
        payload = {
            "lexicon": lexicon,
            "entries": self.by_id,
            "cases": cases,
            "scores": [{"n": item["n"], "hints": item["hints"], "grade": item["grade"]} for item in scores],
            "keys": [entry["key"] for entry in self.bank],
        }
        completed = subprocess.run(
            [NODE, str(ROOT / "tests" / "grade_parity.js")],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        got = json.loads(completed.stdout)
        self.assertEqual(got["debriefs"], expected)
        self.assertEqual(got["scores"], [item["score"] for item in scores])
        canonical = [
            json.dumps(entry["key"], sort_keys=True, ensure_ascii=False, separators=(",", ":"))
            for entry in self.bank
        ]
        self.assertEqual(got["canonical"], canonical)
        for entry, text in zip(self.bank, canonical):
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            self.assertEqual(digest, entry["commitment"])


SECRET_MARKERS = ("why_wrong", "why_tempting", "catch_rule", "clean_final_answer", "clean_steps", "division-by-zero")


class ServerAndExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank = load_bank()

    def setUp(self):
        self.httpd = DemoServer(("127.0.0.1", 0), self.bank)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.httpd.server_address[1]
        self.addCleanup(self.httpd.shutdown)
        self.addCleanup(self.httpd.server_close)

    def request(self, method, path, body=None, raw_headers=None):
        if raw_headers is not None:
            connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            connection.request(method, path, body=body, headers=raw_headers)
            response = connection.getresponse()
            payload = response.read()
            status = response.status
            connection.close()
            return status, payload
        url = f"http://127.0.0.1:{self.port}{path}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as err:
            return err.code, err.read()

    def json(self, method, path, body=None):
        status, payload = self.request(method, path, body)
        return status, json.loads(payload.decode("utf-8"))

    def test_page_catalog_and_a_full_round(self):
        status, page = self.request("GET", "/")
        self.assertEqual(status, 200)
        text = page.decode("utf-8")
        self.assertIn("RedPen", text)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, text)

        status, catalog = self.json("GET", "/api/catalog")
        self.assertEqual(status, 200)
        encoded = json.dumps(catalog)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, encoded)
        self.assertIn("cubic-lost-root", encoded)
        self.assertFalse(catalog["static"])

        status, health = self.json("GET", "/api/health")
        self.assertEqual(health["worksheets"], 5)
        self.assertTrue(health["ok"])

        status, rnd = self.json("POST", "/api/rounds", {"worksheet_id": "cubic-lost-root"})
        self.assertEqual(status, 200)
        self.assertEqual(rnd["level"], 1)
        sealed = next(entry["commitment"] for entry in self.bank if entry["id"] == "cubic-lost-root")
        self.assertEqual(rnd["commitment"], sealed)
        public = json.dumps(rnd)
        for marker in SECRET_MARKERS:
            self.assertNotIn(marker, public)
        self.assertNotIn("solve(x**3", public)

        status, hint = self.json("POST", f"/api/rounds/{rnd['id']}/hint", {})
        self.assertEqual(status, 200)
        self.assertIn("steps 1-3", hint["hint"])
        self.assertEqual(hint["hints_used"], 1)
        self.assertNotIn("why_wrong", json.dumps(hint))

        status, debrief = self.json("POST", f"/api/rounds/{rnd['id']}/submit", {"findings": CUBIC_GOOD})
        self.assertEqual(debrief["score"], 83)
        self.assertEqual(debrief["found"], 1)
        self.assertEqual(debrief["hints_used"], 1)
        self.assertTrue(debrief["commitment_ok"])
        self.assertIn("dividing by", debrief["errors"][0]["why_wrong"].lower())
        self.assertIn("0", debrief["clean_final_answer"])
        self.assertIn("-2", debrief["clean_final_answer"])
        self.assertNotIn("solve(x**3", json.dumps(debrief))
        self.assertIn("Correct", debrief["report_md"])

        status, again = self.json("POST", f"/api/rounds/{rnd['id']}/submit", {"findings": CUBIC_GOOD})
        self.assertEqual(status, 409)

        status, fetched = self.json("GET", f"/api/rounds/{rnd['id']}")
        self.assertEqual(fetched["debrief"]["score"], 83)

    def test_blind_round_hides_the_level_until_the_debrief(self):
        with mock.patch("demo.server.random.choice", lambda pool: next(item for item in pool if item["id"] == "cubic-lost-root")):
            status, rnd = self.json("POST", "/api/rounds", {"blind": True})
        self.assertEqual(status, 200)
        self.assertEqual(rnd["mode"], "blind")
        self.assertIsNone(rnd["level"])
        self.assertNotIn("why_wrong", json.dumps(rnd))
        status, hint = self.json("POST", f"/api/rounds/{rnd['id']}/hint", {})
        self.assertIn("1 planted error", hint["hint"])
        status, debrief = self.json("POST", f"/api/rounds/{rnd['id']}/reveal", {})
        self.assertTrue(debrief["revealed"])
        self.assertIsNone(debrief["score"])
        self.assertEqual(debrief["level"], 1)
        self.assertEqual(debrief["found"], 0)
        self.assertIn("discards the solution", debrief["errors"][0]["why_wrong"])

    def test_clean_round_and_false_alarm_over_http(self):
        status, rnd = self.json("POST", "/api/rounds", {"worksheet_id": "definite-integral"})
        status, debrief = self.json("POST", f"/api/rounds/{rnd['id']}/submit", {"findings": CLEAN})
        self.assertEqual(debrief["score"], 100)
        self.assertEqual(debrief["planted"], 0)
        status, other = self.json("POST", "/api/rounds", {"worksheet_id": "definite-integral"})
        status, flagged = self.json("POST", f"/api/rounds/{other['id']}/submit", {"findings": INTEGRAL_FLAG})
        self.assertEqual(flagged["score"], 67)
        self.assertEqual(flagged["false_alarms"], 1)

    def test_unknown_routes_traversal_and_oversized_body(self):
        status, missing = self.json("POST", "/api/rounds", {"worksheet_id": "nope"})
        self.assertEqual(status, 404)
        status, bad = self.json("GET", "/api/rounds/not-an-id")
        self.assertEqual(status, 404)
        status, secret = self.request("GET", "/secrets/cubic-lost-root.json")
        self.assertEqual(status, 404)
        self.assertNotIn(b"why_wrong", secret)
        status, escaped = self.request("GET", "/%2e%2e/redpen.py")
        self.assertEqual(status, 404)
        self.assertNotIn(b"REDPEN_API_KEY", escaped)
        status, nested = self.request("GET", "/static/../../redpen.py")
        self.assertEqual(status, 404)
        status, huge = self.request(
            "POST", "/api/rounds", body=b"{}",
            raw_headers={"Content-Type": "application/json", "Content-Length": "200000"},
        )
        self.assertEqual(status, 400)
        self.assertIn(b"too large", huge)

    def test_canned_rounds_do_not_call_the_model(self):
        with mock.patch.dict(os.environ, {"REDPEN_MODEL": "fake-model"}):
            with mock.patch("redpen.ask_json", side_effect=AssertionError("model called")):
                status, health = self.json("GET", "/api/health")
                self.assertTrue(health["live"])
                status, rnd = self.json("POST", "/api/rounds", {"worksheet_id": "cubic-lost-root"})
                status, debrief = self.json("POST", f"/api/rounds/{rnd['id']}/submit", {"findings": CUBIC_GOOD})
        self.assertEqual(status, 200)
        self.assertEqual(debrief["grader"], "auto")
        self.assertEqual(debrief["score"], 100)

    def test_live_round_needs_a_model_and_keeps_the_key_server_side(self):
        with mock.patch.dict(os.environ, {"REDPEN_MODEL": ""}):
            status, payload = self.json("POST", "/api/live", {"topic": "chain rule", "level": "1"})
        self.assertEqual(status, 400)
        self.assertIn("REDPEN_MODEL", payload["error"])

        draft = json.loads((ROOT / "demo" / "bank" / "cubic-lost-root.json").read_text(encoding="utf-8"))
        model_grade = {
            "errors": [{"found": True, "diagnosis": 1, "fix": 1, "comment": "The division drops x = 0."}],
            "false_alarms": [],
            "bounties": [],
            "feedback": "You caught the lost root.",
        }
        with mock.patch.dict(os.environ, {"REDPEN_MODEL": "fake-model"}):
            with mock.patch("redpen.ask_json", side_effect=[draft, model_grade]) as ask:
                status, rnd = self.json("POST", "/api/live", {"topic": "cubic equations", "level": "1"})
                self.assertEqual(status, 200)
                self.assertTrue(rnd["live"])
                self.assertEqual(rnd["level"], 1)
                for marker in SECRET_MARKERS:
                    self.assertNotIn(marker, json.dumps(rnd))
                status, debrief = self.json(
                    "POST", f"/api/rounds/{rnd['id']}/submit", {"findings": "Step 2\nWhat's wrong: divided by x\n"}
                )
        self.assertEqual(ask.call_count, 2)
        self.assertEqual(debrief["grader"], "model")
        self.assertEqual(debrief["score"], 100)
        self.assertEqual(debrief["feedback"], "You caught the lost root.")
        self.assertTrue(debrief["commitment_ok"])

    def test_export_writes_a_playable_static_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "site"
            blocked = Path(tmp) / "notes"
            blocked.mkdir()
            (blocked / "keep.txt").write_text("leave me", encoding="utf-8")
            with self.assertRaises(DemoError):
                export_site(blocked)
            self.assertEqual((blocked / "keep.txt").read_text(encoding="utf-8"), "leave me")

            exported = subprocess.run(
                [sys.executable, str(ROOT / "redpen.py"), "demo", "--export", str(dest)],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            self.assertEqual(exported.returncode, 0, exported.stderr)
            catalog = json.loads((dest / "catalog.json").read_text(encoding="utf-8"))
            self.assertTrue(catalog["static"])
            self.assertNotIn("why_wrong", json.dumps(catalog))
            secret = json.loads((dest / "secrets" / "cubic-lost-root.json").read_text(encoding="utf-8"))
            card = next(item for item in catalog["worksheets"] if item["id"] == "cubic-lost-root")
            self.assertEqual(card["commitment"], redpen.commitment(secret["key"]))
            self.assertIn("why_wrong", json.dumps(secret))
            self.assertTrue((dest / "index.html").is_file())
            self.assertTrue((dest / "grade.js").is_file())
            self.assertTrue((dest / ".nojekyll").is_file())
            self.assertNotIn("why_wrong", (dest / "index.html").read_text(encoding="utf-8"))
            page = (dest / "index.html").read_text(encoding="utf-8")
            self.assertNotIn('src="/', page)
            self.assertNotIn("href=\"/", page)

    def test_license_is_apache_2(self):
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("Apache License", license_text)
        self.assertIn("Version 2.0, January 2004", license_text)
        self.assertIn("Apache-2.0", readme)
        self.assertNotRegex(readme, r"\bMIT\b")
        self.assertIn("Copyright 2026 RedPen contributors", (ROOT / "NOTICE").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
