# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run investigate -- investigate "Case description..."       # run full investigation
npm run investigate -- investigate "..." --case-id inv-2026-003  # with explicit case ID
npm run investigate -- resume inv-2026-003                     # resume interrupted investigation
npm run format          # format all *.md files with Prettier
npm run format:check    # check formatting without writing
npx tsc --noEmit        # type-check TypeScript
```

## What this repo is

A Lithuanian public procurement fraud investigation system. It uses a programmatic TypeScript pipeline that spawns
`claude -p` subprocesses for each investigation step, with a local MCP server (`viespirkiai-local`) that exposes
Lithuanian procurement, company registry, and court data.

The "output" is investigation reports written as Markdown files under `investigations/`.

## Architecture

### Programmatic pipeline (`src/`)

The primary investigation pipeline is a TypeScript orchestrator that spawns `claude -p` (print mode) subprocesses.
Each agent step runs as an independent Claude session with restricted tools and streaming JSON output. Uses the CLI
subscription — no API key needed.

```
src/
  index.ts              ← CLI entry point
  orchestrator.ts       ← pipeline: planner → investigators → reporter
  agent-loop.ts         ← claude -p subprocess wrapper (stream-json output)
  config.ts             ← env-var configuration
  types.ts              ← shared types
  agents/planner.ts     ← planner agent function
  agents/investigator.ts ← investigator agent function
  agents/reporter.ts    ← reporter agent function
  prompts/*.md          ← system prompts (appended to Claude Code defaults)
  io/workspace.ts       ← file management helpers
```

**Key design decisions:**

- Each agent = one `claude -p` subprocess with `--tools "Read,Write,Edit"` (no Agent, no Bash).
- MCP tools available natively from the project's `.claude` MCP config.
- `--allowed-tools` pre-approves all tools (no interactive permission prompts).
- `--max-budget-usd` caps cost per step.
- `--output-format stream-json` streams tool calls for real-time visibility.
- Automatic retry with exponential backoff on failures.
- State checkpointed to `state.json` after each step — `resume` picks up where it left off.
- Optional parallel theme execution (`PARALLEL=true`).
- Zero runtime dependencies — only uses the `claude` CLI binary.

**Environment variables:** `MODEL` (default: sonnet), `MAX_RETRIES`, `MAX_BUDGET_PER_STEP`, `PARALLEL`.

### Legacy agent chain (`.claude/agents/`)

Three Claude Code agent definitions remain in `.claude/agents/` for ad-hoc interactive use. The programmatic pipeline
above is preferred for full investigations.

### Investigation workspace

Each case lives under `investigations/<case-id>/` (format `inv-YYYY-NNN`):

```
investigations/inv-2026-001/
  dossier.md          ← shared entity data; written once by planner; all agents read it
  plan.md             ← selected themes and per-theme query plans
  theme-01-<name>.md  ← findings written by each investigator agent
  theme-02-<name>.md
  report.md           ← final report written by the reporter agent
  tech-report.md      ← each agent appends MCP tool failures/gaps here
```

### Theme library

28 fraud detection themes live in `docs/themes/`. Each theme file describes:

- Fraud pattern and detection logic
- Specific MCP tools and SQL examples
- Red flags and supervisory authority routing (STT / FNTT / VPT / VK / KT)

The index and MCP tool reference is in `docs/index/mcp-investigator-prompt.md` — read this before writing any
investigation prompt or modifying agent instructions.

### MCP tool rules (enforced across all agents)

- **Discovery**: use `search_sutartys`, `search_juridiniai`, `search_failai`, `search_viesieji_pirkimai`
- **Aggregations and scale confirmation**: use `execute_query` with views (`v_sutartys`, `v_company`, `v_pirkimas`,
  `v_person_links`, `v_bylos`)
- **QUANTITATIVE CLAIMS RULE**: any count, total, or ratio must be backed by an `execute_query` result — `search_*`
  tools return at most 50 rows with `total: null` and cannot confirm scale
- **Bidders and bid prices are not queryable** — read them per procurement from the ATN-1 XLSX:
  `get_viesasis_pirkimas(pirkimoId)` → ATN-1 file (filename `PPA-`/`ATN-`/`Atn-1`) →
  `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` (p.4 bidders+codes, p.7 ranked bids+prices). Only new CVP IS
  procurements (~2022→today) have these; old CVPP procurements have none. See **Participant & bid data** in
  `docs/index/mcp-investigator-prompt.md`
- `EXISTS` / correlated subqueries are blocked by the query engine — rewrite as JOIN + `GROUP BY`/`DISTINCT`
- Call `get_schema` to confirm column names before writing SQL

### Person investigation sequence (mandatory, in order)

1. `get_pinreg_asmuo("Vardas Pavardė")`
2. `search_sutartys(search="Pavardė")` — surfaces self-dealing contracts in metadata; filter by first name
3. `search_failai(search="Vardas Pavardė")`
4. `search_sutartys(tiekejoKodas=...)` for each linked company
5. `execute_query` on `v_sutartys` to confirm totals — mandatory if step 4 returned results

### Formatting

Prettier formats all `.md` files (print width 120, prose wrap always). Run `npm run format` before committing.

### tech-report.md

Each agent appends a section to `investigations/<case-id>/tech-report.md` describing what failed or was missing when
using MCP tools. The file may already contain entries from prior agents — **append only, never overwrite**. This is the
feedback loop for identifying data gaps and tool deficiencies — do not skip it.
