# Research Harness (Automated Survey Agent)

[中文 README](./README.md)

An evidence-first automated web research harness: it plans questions → runs parallel role-based retrieval → keeps explicit sources → synthesizes a report strictly from collected evidence. If sources are insufficient or citations are inconsistent, it fails loudly instead of fabricating plausible content. Three executors (harnesses) are supported: OpenAI Responses API, Codex CLI, and Claude Code (including native subagents).

- **Parallel role-based agents**: ecosystem discovery, technical due diligence, funding, benchmark verification, source auditing, and more — sharded work packages running concurrently (default caps `quick/standard/deep = 12/32/64`).
- **Verifiable output**: every claim carries a clickable `[S1]`-style citation; produces both a Markdown report and an offline-searchable interactive HTML report.
- **Machine-checked structure**: planning, evidence, and synthesis stages are constrained by JSON Schema; invalid output triggers search-free repair passes, and still-invalid output aborts the report.
- **Credential safety**: API keys are read from environment variables only — never placed on the command line, in logs, or in reports.

## Requirements

- Node.js ≥ 20
- At least one executor:
  - `codex`: Codex CLI installed and logged in (`codex login`)
  - `cc` / `claude`: Claude Code installed and logged in (check with `claude auth status`)
  - `openai`: `export OPENAI_API_KEY='...'`

## Install & Build

```bash
npm install
npm run build
```

## Getting Started

### Option 1: One-command example script (recommended first run)

```bash
./examples/async-agentic-rl.sh                # default: codex, deep-dive on async Agentic RL
RH_HARNESS=cc RH_SUBWORK=hybrid ./examples/async-agentic-rl.sh   # use Claude Code instead
RH_OUTPUT=reports/my.md ./examples/async-agentic-rl.sh "Your own research topic"
```

The script builds and runs the harness, then writes an interactive report to `reports/*.html`. Override harness, concurrency, output paths, etc. via `RH_*` environment variables (see the comments at the top of the script).

### Option 2: Direct CLI

```bash
# Codex executor
npm start -- research "Your research question" \
  --harness codex --depth deep --max-agents 64 --concurrency 6 --heartbeat 5 \
  --out reports/result.md

# Claude Code executor (hybrid mode enables CC native subagents)
npm start -- research "Your research question" \
  --harness cc --depth deep --subwork hybrid --concurrency 4 \
  --out reports/result.md

# OpenAI Responses executor
export OPENAI_API_KEY='...'
npm start -- research "Palantir's products, customers, and competitive landscape" \
  --harness openai --depth deep --out reports/palantir.md
```

Each run produces both `result.md` and `result.html`. Progress and heartbeats stream to stderr — the run never waits silently.

Optional: pass `--seed path/to/reference.html` to feed a local reference page as a baseline to be verified (parsed into entities, then sharded across agents).

### Option 3: HTTP API (local server)

```bash
export RESEARCH_HARNESS_API_TOKEN='a-long-random-secret'
npm start -- serve --host 127.0.0.1 --port 8787
# Open http://127.0.0.1:8787/ui in a browser and enter the token

curl http://127.0.0.1:8787/v1/research \
  -H "Authorization: Bearer $RESEARCH_HARNESS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Deep-dive on Palantir","harness":"cc","depth":"deep","subworkMode":"hybrid","concurrency":4}'
```

Localhost-only by default — do not expose directly to the public internet.

## Common Options

| Flag | Description | Default |
|---|---|---|
| `--harness` | Executor: `codex` / `cc` / `openai` | `codex` |
| `--depth` | Depth: `quick` / `standard` / `deep` | `standard` |
| `--subwork` | Subtask mode: `delegated` / `native` / `hybrid` | `delegated` |
| `--concurrency` | Work packages running simultaneously | `4` |
| `--max-agents` | Total work-package cap (12/32/64 by depth) | by depth |
| `--max-queries` / `--max-sources` | Query count / evidence budget per package | `6` / by depth |
| `--seed` | Local reference page (.html/.json) as a to-be-verified baseline | none |
| `--out` / `--html-out` | Markdown / HTML output paths | under `reports/` |
| `--heartbeat` | Heartbeat seconds; `--log-format json` emits line-delimited JSON events | `5` |

## Tests & Docs

```bash
npm test        # fully offline, consumes no tokens
npm run check   # build + test
```

- Full manual (Chinese): [docs/使用手册.zh-CN.md](./docs/使用手册.zh-CN.md)
- Target architecture: [RESEARCH_OS_ARCHITECTURE.md](./RESEARCH_OS_ARCHITECTURE.md)
- Survey of 87 related projects: [AUTORESEARCH_LANDSCAPE_50.md](./AUTORESEARCH_LANDSCAPE_50.md)
