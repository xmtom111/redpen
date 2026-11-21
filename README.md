# 🖍️ RedPen

[**免安装在线体验 · 简体中文**](https://xmtom111.github.io/redpen/zh/) · [**Try online · English**](https://xmtom111.github.io/redpen/) · [中文说明](README_zh.md)

**Spot the flaw. Beat the AI.** *(Code · Math · Logic)*

Convincing AI explanations still need human verification. RedPen drops you straight into a short, checkable puzzle — code snippets, logic & statistics briefs, or worked math solutions — with deliberately planted flaws (or none at all). Tap the broken line, pick what went wrong and how to fix it, and get instant red-pen feedback.

## Web-first play

1. **Open and play immediately.** Visiting `/` or `/zh/` starts today's **Daily RedPen** (3 deterministic puzzles across Logic, Code, and Math) with no login, backend, or API key.
2. **Tap & pick (default) or free-text.** Tap any flawed line/claim/step to mark it in red and pick the diagnosis and fix, or mark the item clean. Switch to **Free text** any time to write explanations by hand.
3. **Track streaks & share without spoilers.** Progress and streaks stay in your browser (`localStorage`), and finishing Daily RedPen generates a Wordle-style spoiler-free score card.
4. **Explore packs or build custom rounds.** Browse Logic, Code, Math, and Blind rounds under **Packs**. **Workshop** (optional, secondary) lets you plug in your own API key to generate custom AI rounds.

Scoring: each planted flaw is worth 3 points (1 locate, 1 diagnosis, 1 fix); extra flags on valid lines lower accuracy (−1); hints cost 0.5. Level 0 items are completely clean.

## Custom practice (Workshop)

Open **Workshop** → **AI model settings**, choose a provider, and paste your own API key. Enter a topic or problem, choose level 0–4 or blind, and generate a custom round. You can upload problem text, supply a reference answer, choose difficulty and focus categories, use hints, and compare your hunt with AI after submission. Browser history tracks your weak categories on this device.

The browser sends requests directly to your selected provider, which may charge for usage. Keys stay in this browser's local storage until cleared; use your own device. Some providers block browser requests through CORS: choose a browser-compatible endpoint or use the local server with environment configuration. Browser-generated solutions are model-checked, not SymPy-verified. A commitment hash detects changes to the sealed key; it does not prove mathematical correctness or hide a key from browser developer tools.

## Local app and hosted server

The repository includes a Docker Space setup and a Windows/macOS release build workflow. Official hosted Space and downloadable release assets require the owner to publish them; no live Space or binary is claimed here. See [deployment instructions](docs/deployment.md).

Built-in rounds work without a key or network after loading the local app. Formula rendering uses an online MathJax CDN; plain-text math remains usable offline. The local Python service checks answer-key identities with SymPy.

## Advanced: CLI, development, and AI coding assistants

## Quick start

You need Python 3.9 or newer (use `python3` if `python` isn't found).

```bash
git clone https://github.com/xmtom111/redpen.git && cd redpen
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
| `demo` | Open the browser demo. `--export DIR` writes a static site. `--host` and `--port` change where it listens |

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

**What if the AI makes a mistake it didn't plant?** Server-generated keys run SymPy identities when provided; failed checks trigger a retry. Browser-generated keys do not run SymPy. Model grading can award a bounty for a real unplanted error; the built-in heuristic grader cannot independently establish arbitrary bounties.

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
demo/          browser demo: UI, canned worksheets, automatic grader, local server
demo/bank/     canned answer keys. The server sends a key only in the debrief
demo/bank/zh/  Simplified Chinese worksheets for /zh/
Dockerfile     container for the demo (port 7860)
.github/       GitHub Pages workflow for the static demo
tests/         end-to-end tests with a fake model: python -m unittest discover tests
.env.example   model configuration
sessions/      your rounds (git-ignored)
```

## License

[Apache-2.0](LICENSE). Copyright 2026 RedPen contributors; see [NOTICE](NOTICE).
