/* Compare the browser grader with the Python grader. The Python test feeds cases on stdin. */
const grade = require("../demo/static/grade.js");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const data = JSON.parse(raw);
  grade.init(data.lexicon);
  const debriefs = data.cases.map((item) => {
    const entry = data.entries[item.id];
    const lang = entry.lang || "en";
    const scored = item.revealed
      ? grade.blankGrade(entry.key.errors.length, lang)
      : grade.gradeFindings(entry, item.findings);
    return grade.buildDebrief(
      entry,
      item.mode,
      item.hints_used,
      scored,
      !!item.revealed,
      item.revealed ? "reveal" : "auto",
    );
  });
  const scores = data.scores.map((item) => grade.scoreRound(item.n, item.grade, item.hints).score);
  const canonical = data.keys.map((key) => grade.canonicalize(key));
  process.stdout.write(JSON.stringify({ debriefs, scores, canonical }));
});
