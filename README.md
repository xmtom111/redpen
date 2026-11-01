# 🖍️ RedPen

**Learn math by catching an AI's planted mistakes.**

RedPen writes a worked solution with errors planted on purpose, at a level you choose. You find each error, explain what's wrong, and fix it. RedPen then grades you, debriefs every error, and aims the next round at what you missed.

## Why

Reading a correct AI explanation feels like learning, but it's passive: it sounds convincing, and a week later it's gone. Hunting for errors forces you to check every step against what you actually know. If you've mastered a topic, you can spot a wrong step fast. RedPen trains exactly that, and the habit carries over to checking your own homework and exams.

Learning science calls this *erroneous examples*: solutions with errors that students find and fix. They tend to pay off on delayed tests rather than right away, and they help most once you have some grounding in the topic ([research](#research)).

## Error levels

| Level | Name | What's planted |
|---|---|---|
| 0 | Clean | Nothing. Can you trust correct work? |
| 1 | Subtle | One expert-level error: a failed hypothesis, a lost solution, an edge case |
| 2 | Minor | 2–3 classic misconceptions (default) |
| 3 | Mixed | About half the steps are wrong, including the method |
| 4 | Nonsense | Nearly everything is wrong; only notation and common sense survive |
| blind | ? | A hidden level from 0–2. You don't know how many errors there are, just like real work |

Level 4 is the *easiest* to hunt and level 1 the hardest. Start at 3, work toward 1, then go blind.

## Quick start

You need Python 3.9 or newer (use `python3` if `python` isn't found).

```bash
git clone https://github.com/<you>/redpen.git && cd redpen
pip install sympy        # optional, recommended: machine-checks every answer key
cp .env.example .env     # add your API key and model
python redpen.py new "integration by parts" --level 2
```

The worksheet opens in your browser. Write your findings in the session's `answers.md`:

```text
Step 4
What's wrong: the chain rule is missing the inner derivative 2x.
Fix: d/dx sin(x^2) = 2x cos(x^2), so the integral becomes ...
```

Then grade it:

```bash
python redpen.py submit
```

You get a score, a debrief of every error (why it's wrong, why it's tempting, a habit that catches it next time), a practice problem with the same trap, and the correct solution.

## Commands

| Command | What it does |
|---|---|
| `new <topic or problem>` | Start a round. `--level 0-4` or `blind`, `--difficulty intro\|standard\|advanced\|competition`, `--file problem.txt`, `--answer "x = 3/2"` (your textbook's answer as ground truth), `--focus sign,domain` |
| `hint` | Next hint: error count, then location, then concept. Each costs 0.5 points |
| `submit` | Grade `answers.md`, a file you name, or `-` for stdin |
| `submit --ai` | After you're graded, let an AI hunt the same worksheet and compare |
| `reveal` | Give up and see the answer key (errors count as missed) |
| `stats` | Scores by level, the error types you miss most, the suggested next round |
| `verify` | Prove the answer key wasn't changed after the worksheet was issued |

**Scoring.** Each planted error is worth 3 points: 1 for finding it, 1 for diagnosing it, 1 for fixing it. Each false alarm costs 1, so flagging everything doesn't pay. A clean round scores 100 only if you flag nothing. A real error the AI didn't plant earns a +3 bounty.

## Use it with an AI coding agent

Open the folder in any agent that reads `AGENTS.md` (Codex, Cursor, and others). Claude Code reads it through `CLAUDE.md`. Then just ask:

> new round: eigenvalues, level 1

No API key is needed: the agent writes and grades the rounds itself, and uses `redpen.py` to seal keys, run checks, give hints, and keep score.

**Spoiler warning:** agents display their tool calls, so the answer key can show up while it's being written. Don't expand that step, or use the CLI for strict play.

## Model setup

`.env` accepts any OpenAI-compatible endpoint:

| Provider | `REDPEN_BASE_URL` |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com` |
| Qwen (Alibaba Cloud) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (local) | `http://localhost:11434/v1` |

Use the strongest reasoning model you have. The quality of the answer key depends on it.

## Getting the most out of it

- **Study first, then hunt.** RedPen is practice, not a first explanation.
- **Explain, don't just point.** Diagnosis and fix are two thirds of the points, and they're where the learning happens.
- **Use your real material:** `--file hw3-q2.txt --answer "x = 3/2"`.
- **Do the practice problems** in each report. They're the same trap in a new setting.
- **Go blind** once level 1 feels easy.
- **Check `stats` weekly.** New rounds target your weak spots automatically.

## FAQ

**Won't I learn wrong math?** Every round ends with each error corrected and explained, and worksheets carry a warning banner. Keep `report.md` as your notes, not the worksheet.

**What if the AI makes a mistake it didn't plant?** Answer keys are checked with SymPy whenever possible, and the worksheet is regenerated if a check fails. If you find a real unplanted error, you get a bounty.

**Why not just paste `AGENTS.md` into a chat app?** A chat window can't keep a hidden answer key. Without one, the AI reconstructs "its" errors after the fact. RedPen seals the key in a file and publishes its hash before you start.

## Research

- McLaren, Adams & Mayer (2015). [Delayed learning effects with erroneous examples: a study of learning decimals with a web-based tutor](https://link.springer.com/article/10.1007/s40593-015-0064-x). *International Journal of Artificial Intelligence in Education.*
- Große & Renkl (2007). Finding and fixing errors in worked examples: Can this foster learning outcomes? *Learning and Instruction.*
- Bastani et al. (2025). [Generative AI without guardrails can harm learning: Evidence from high school mathematics](https://www.pnas.org/doi/10.1073/pnas.2422633122). *PNAS.*
- [AI-generated errors as a learning tool: improving programming education through error correction](https://files.eric.ed.gov/fulltext/EJ1499130.pdf) (ERIC).

## Project layout

```text
AGENTS.md      the brain: levels, error taxonomy, setter and grader rules, formats
CLAUDE.md      points Claude Code to AGENTS.md
redpen.py      the CLI: sessions, sealed keys, SymPy checks, hints, scoring, stats
tests/         end-to-end tests with a fake model: python -m unittest discover tests
.env.example   model configuration
sessions/      your rounds (git-ignored)
```

## License

MIT
