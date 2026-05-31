# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run format          # format all *.md files with Prettier
npm run format:check    # check formatting without writing
```

## What this repo is

A Lithuanian public procurement fraud investigation system. It uses a multi-agent workflow driven by Claude Code
subagents and a local MCP server (`viespirkiai-local`) that exposes Lithuanian procurement, company registry, and court
data.

There is no application code to build or test — the "output" is investigation reports written as Markdown files under
`investigations/`.

## Architecture

### Agent chain

Three specialist agents in `.claude/agents/` run sequentially for every investigation:

1. **`fraud-investigation-planner`** — parses the case prompt, queries MCP once for all named entities, writes
   `dossier.md` and `plan.md`, then spawns the first investigator.
2. **`procurement-fraud-investigator`** — handles one theme per instance; reads the shared dossier, runs theme-specific
   MCP queries, writes its findings file, then spawns the next investigator (or the reporter if it is the last theme).
3. **`fraud-investigation-reporter`** — synthesis only, no MCP queries; reads all theme files and writes the final
   `report.md` with supervisory authority referral recommendations.

The planner is triggered by the user. Investigators and the reporter are always spawned by the prior agent, never
directly.

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
