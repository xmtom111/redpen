"""Regression coverage for web controls and deterministic grading tolerance."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import redpen
from demo.grade import equivalent_fix, grade_findings, LEXICON
from demo.server import load_bank, generate_live

ROOT = Path(__file__).resolve().parents[1]


class ImprovementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = {e['id']: e for e in load_bank()}

    def test_equivalent_math_and_colloquial_diagnoses_match_in_both_graders(self):
        cases = [
            ('chain-and-square', "Step 2\nWhat's wrong: forgot factor from the inner derivative\nFix: cos(x*x)*2*x"),
            ('chain-and-square', "Step 2\n错误：忘乘内函数的导数\n修正：$2*x*cos(x**2)$"),
            ('chain-and-square', "Step 3\n错误：平方展开少了交叉项\n修正：1+2*x+x**2"),
            ('cubic-lost-root', "Step 2\n错误：除以x漏解，零也可以\n修正：x=0 or x=2 or x=-2"),
        ]
        for ident, findings in cases:
            grade = grade_findings(self.entries[ident], findings)
            found = [row for row in grade['errors'] if row['found']]
            self.assertTrue(found, findings)
            self.assertEqual((found[0]['diagnosis'], found[0]['fix']), (1, 1), findings)
        if not shutil.which('node'):
            self.skipTest('node unavailable')
        js = """const fs=require('fs');const g=require('./demo/static/grade.js');
const data=JSON.parse(fs.readFileSync(0,'utf8'));g.init(data.lexicon);
console.log(JSON.stringify(data.cases.map(([id,f])=>g.gradeFindings(data.entries[id],f))));"""
        data = {'lexicon':json.loads((ROOT/'demo/static/grade_lexicon.json').read_text()),'entries':self.entries,'cases':cases}
        actual = json.loads(subprocess.check_output(['node','-e',js],input=json.dumps(data).encode(),cwd=ROOT))
        expected = [grade_findings(self.entries[i], f) for i,f in cases]
        self.assertEqual(actual, expected)

    def test_equivalence_aliases_do_not_accept_wrong_sign_or_missing_factor(self):
        original = self.entries['chain-and-square']['key']['errors'][0]['original']
        for wrong in ['cos(x^2)', '-2xcos(x^2)', '2xcos(x)', '2xcos(x^2)+1']:
            self.assertFalse(equivalent_fix(wrong, original, LEXICON))

    def test_live_reference_and_focus_reach_setter(self):
        draft = json.loads((ROOT/'demo/bank/cubic-lost-root.json').read_text())
        with patch.dict('os.environ', {'REDPEN_MODEL':'test'}), patch('redpen.ask_json', return_value=draft) as ask:
            generate_live('Solve x^3=4x', '1', 'intro', 'en', ['division-by-zero'], '-2,0,2')
        prompt = ask.call_args.args[0]
        self.assertIn('division-by-zero', prompt)
        self.assertIn('-2,0,2', prompt)
        self.assertIn('intro', prompt)

    def test_browser_protocol_matches_repository_instructions(self):
        self.assertEqual((ROOT/'AGENTS.md').read_text(), (ROOT/'demo/static/protocol.txt').read_text())
