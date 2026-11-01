"""End-to-end tests with a fake model. Run: python -m unittest discover tests"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import redpen  # noqa: E402

# A setter reply the way models often write it: unescaped LaTeX backslashes, wrapped in prose.
SETTER_REPLY = r"""Here is the worksheet:
```json
{
  "title": "Solving a cubic by factoring",
  "problem": "Find all real solutions of $x^3 = 4x$.",
  "steps": [
    "We are given $x^3 = 4x$.",
    "Divide both sides by $x$: $x^2 = 4$.",
    "Take square roots: $x = \pm 2$, since $\sqrt{4} = 2$ and $x \neq 0$ is not needed."
  ],
  "final_answer": "$x \in \{-2, 2\}$",
  "key": {
    "level": 1,
    "clean_steps": ["Move all terms to one side: $x^3 - 4x = 0$.", "Factor: $x(x-2)(x+2) = 0$.",
                    "A product is zero when a factor is zero: $x = 0$, $x = 2$ or $x = -2$."],
    "clean_final_answer": "$x \in \{-2, 0, 2\}$",
    "errors": [{
      "step": 2, "category": "division-by-zero",
      "original": "Move all terms to one side and factor: $x(x^2 - 4) = 0$.",
      "corrupted": "Divide both sides by $x$: $x^2 = 4$.",
      "why_wrong": "Dividing by $x$ assumes $x \neq 0$, which discards the solution $x = 0$.",
      "why_tempting": "Cancelling a common factor looks like simplification.",
      "catch_rule": "Before dividing by an expression, ask whether it can be zero; if so, solve that case separately.",
      "hint": "What did step 2 silently assume about $x$?",
      "practice": {"problem": "Solve $x^4 = 9x^2$ over the reals.", "answer": "$x \in \{-3, 0, 3\}$"}
    }],
    "checks": ["solve(x**3 - 4*x, x) == [-2, 0, 2]"],
    "reference_check": "none"
  }
}
```"""

GRADE_REPLY = json.dumps({
    "errors": [{"found": True, "diagnosis": 1, "fix": 0.5, "comment": "Right diagnosis; your fix drops x = -2."}],
    "false_alarms": [{"step": 3, "claim": "only x = 2", "why_correct": "x^2 = 4 has the two roots ±2."}],
    "bounties": [],
    "feedback": "You spotted the lost root. Next time, list every solution and substitute each one back.",
})


class FakeModel:
    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def __call__(self, task, model_var="REDPEN_MODEL"):
        self.prompts.append(task)
        return self.replies.pop(0)


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        redpen.main(list(argv))
    return out.getvalue()


class RedPenTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        patcher = mock.patch.dict(os.environ, {"REDPEN_HOME": self.home.name, "REDPEN_MODEL": "fake"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.home.cleanup)

    def session(self):
        return next(p for p in Path(self.home.name).iterdir() if p.is_dir())

    def test_latex_backslashes_are_repaired(self):
        data = redpen.extract_json(SETTER_REPLY)
        self.assertEqual(data["final_answer"], r"$x \in \{-2, 2\}$")
        self.assertIn(r"\neq", data["key"]["errors"][0]["why_wrong"])
        self.assertEqual(redpen.extract_json('{"a": "line\\nbreak", "b": "\\\\frac"}'),
                         {"a": "line\nbreak", "b": "\\frac"})

    def test_error_count_must_match_level(self):
        draft = redpen.extract_json(SETTER_REPLY)
        draft["key"]["level"] = 2
        with self.assertRaisesRegex(ValueError, "needs 2-3 planted errors"):
            redpen.validate_draft(draft)

    def test_scoring(self):
        grade = json.loads(GRADE_REPLY)
        self.assertEqual(redpen.score_round(1, grade, hints_used=1)["score"], 33)  # (2.5 - 1 - 0.5) / 3
        clean = {"errors": [], "false_alarms": [], "bounties": []}
        self.assertEqual(redpen.score_round(0, clean, 0)["score"], 100)
        self.assertEqual(redpen.next_mode("2", 2, 85), "1")
        self.assertEqual(redpen.next_mode("1", 1, 90), "blind")
        self.assertEqual(redpen.next_mode("2", 2, 20), "3")

    def test_cli_round(self):
        model = FakeModel(SETTER_REPLY, GRADE_REPLY)
        with mock.patch.object(redpen, "llm", model):
            out = run("new", "cubic equations", "--level", "1", "--no-open")
            self.assertIn("**Step 2.** Divide both sides by $x$", out)
            self.assertIn("1/1 SymPy checks passed", out)
            self.assertIn("Hint 1/2", run("hint"))
            (self.session() / "answers.md").write_text("Step 2\nWhat's wrong: divides by x\nFix: x = 0, 2\n")
            report = run("submit")
        self.assertIn("**You: 33/100**", report)
        self.assertIn("ANSWER KEY", model.prompts[1])
        self.assertIn("divides by x", model.prompts[1])
        self.assertIn("OK: key.json matches", run("verify"))
        stats = run("stats")
        self.assertIn("division-by-zero", stats)
        self.assertIn("--level 2", stats)  # 33 < 40: one level easier

    def test_failing_check_triggers_retry(self):
        bad = SETTER_REPLY.replace("[-2, 0, 2]", "[-2, 2]")
        model = FakeModel(bad, SETTER_REPLY)
        with mock.patch.object(redpen, "llm", model):
            run("new", "cubic equations", "--level", "1", "--no-open")
        self.assertIn("checks of the clean solution failed", model.prompts[1])

    def test_agent_round_and_tamper_detection(self):
        draft = redpen.extract_json(SETTER_REPLY)
        draft["meta"] = {"topic": "cubic equations", "mode": "blind"}
        Path(self.home.name, "draft.json").write_text(json.dumps(draft))
        run("seal", "--no-open")
        session = self.session()
        self.assertFalse(Path(self.home.name, "draft.json").exists())
        self.assertIn("1 planted error", run("hint"))  # blind rounds start with the error count
        (session / "grade.json").write_text(GRADE_REPLY)
        self.assertIn("blind round", run("score"))
        key = json.loads((session / "key.json").read_text())
        key["errors"][0]["step"] = 3
        (session / "key.json").write_text(json.dumps(key))
        with self.assertRaises(SystemExit):
            run("verify")

    def test_reveal(self):
        with mock.patch.object(redpen, "llm", FakeModel(SETTER_REPLY)):
            run("new", "cubic equations", "--level", "1", "--no-open")
        out = run("reveal", "--yes")
        self.assertIn("❌ missed", out)
        self.assertIn("Practice answers", out)


if __name__ == "__main__":
    unittest.main()
