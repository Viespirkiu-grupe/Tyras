# TODO — Architectural & Anti-Hallucination Improvements

> Comprehensive review of the Tyras procurement-fraud agentic system against current best practices for
> Claude/agentic-system design and LLM hallucination control. **Prioritised, not estimated.** No detailed planning here
> — each item states _what_, _why_ (which LLM limitation or best practice it addresses), and the _implementation
> surface_ (Skill / Hook / Subagent / Slash command / repo artifact / MCP server). Detailed design comes later.

## Method & caveat

- Reviewed: all three agents (`planner`, `investigator`, `reporter`), `docs/index/mcp-investigator-prompt.md`, and a
  representative spread of the 27 theme files (1, 2, 4, 5, 11, 16, 25).
- **Could not run live MCP queries.** The local server `viespirkiai-local` (`localhost:9019`) is not running — nothing
  is listening on the port and `claude mcp list` reports it as failed. Only the remote `viespirkiai.org/mcp` is
  connected, and neither server's tools are exposed in this session. Several items below (schema snapshot, SQL dry-run,
  indicator calibration) should be validated against a live DB once the server is up — I can do that follow-up run then.

## Executive summary — the five highest-leverage changes

1. **A single structured evidence ledger** (one JSON record per MCP call: tool, params/SQL, full raw result, error,
   timestamp). Today raw results are pasted into prose markdown, so nothing can mechanically verify that a number in a
   theme file actually came from a query. This is the root enabler for everything else.
2. **A verifier / grounding subagent** that checks every quantitative claim against the ledger before the report is
   written. The `QUANTITATIVE CLAIMS RULE` is currently prose the LLM is asked to self-enforce — unenforceable prose is
   the single largest hallucination surface in this system.
3. **Replace the spawn-chain with an orchestrator** that owns the plan and state and dispatches theme workers
   (Anthropic's orchestrator-worker pattern). The current "each investigator spawns the next" design propagates early
   errors, can't recover from a mid-chain failure, and forces everything to run serially.
4. **Centralise the duplicated rules into a Claude Code Skill** and turn theme SQL into a **parameterised, validated
   query library**. The MCP rules, person-investigation sequence, and view reference are copy-pasted across all agents
   (drift already happened — the reporter was missing the tech-report rule). Free-form, LLM-adapted SQL is a
   hallucination and silent-failure source.
5. **Build an eval harness with golden cases.** There is currently no way to tell whether a prompt/theme change improves
   or degrades investigation quality. "Build evals first" is the core discipline of reliable agentic development.

---

## P0 — Anti-hallucination core (highest leverage)

### P0.1 Structured evidence ledger (single source of truth)

- **What:** Every MCP call writes a machine-readable record to `investigations/<case-id>/evidence/NNNN.json` —
  `{id, agent, theme, tool, params, sql, raw_result, row_count, error, timestamp}`. Markdown findings cite ledger IDs
  (`[E-0042]`) instead of restating numbers.
- **Why:** LLMs drift numbers when restating them in prose; nothing can currently detect this. A ledger makes every
  claim traceable and gives the verifier and reporter a source of truth that is independent of any agent's prose.
- **Surface:** repo artifact + PostToolUse hook that appends the record automatically; convention in all agents.

### P0.2 Verifier / grounding subagent

- **What:** A new `fraud-procurement-investigation-verifier` subagent (or a pre-report gate) that extracts every numeric
  claim and named-entity accusation from the theme files and confirms each maps to a ledger record with matching value.
  Unsupported claims are flagged or stripped before the report is produced.
- **Why:** Moves the `QUANTITATIVE CLAIMS RULE` from "the model promises to comply" to "an adversarial pass checks
  compliance." Directly targets the dominant hallucination mode in a fraud-claims context, where a wrong number is a
  defamation risk.
- **Surface:** new Subagent (consider Opus for the critic role); optionally enforced by a `SubagentStop`/`Stop` hook.

### P0.3 Enforce the quantitative-claims and coverage gates with hooks, not prose

- **What:** Hooks/scripts that (a) block report finalisation if any theme file contains a number with no ledger
  citation, and (b) refuse bidder/competition conclusions unless they cite a specific procurement's ATN-1 file read (or
  are explicitly marked "no ATN-1 report available" for that procurement).
- **Why:** The "old CVPP has no bidder data" trap and the "search\_\* can't confirm scale" rule are both well-written
  prose that the LLM may still skip under context pressure. Harness-level enforcement is deterministic.
- **Surface:** Hooks + small validation script in the repo.

### P0.4 Capture raw tool results including errors; define failure behaviour

- **What:** Mandate that the full tool response — _including SQL errors and empty results_ — is recorded verbatim in the
  ledger, and add explicit decision rules: on tool error, retry once, then record and continue or abort (never invent a
  plausible result). "No data" and "query errored" must be distinguishable in the output.
- **Why:** A common failure is the LLM recovering from a failed/empty query by emitting confident, fabricated numbers,
  or conflating "query errored" with "no fraud found." Both are dangerous here.
- **Surface:** agent rules + ledger schema (`error` field) + retry guidance in the shared Skill.

### P0.5 SQL validation / dry-run before trusting results

- **What:** Validate generated SQL against a checked-in schema snapshot (and/or `EXPLAIN`/`LIMIT 0` dry-run) before the
  analytic run; surface parse/column errors to the agent for correction rather than letting a malformed query silently
  return nothing.
- **Why:** Themes contain complex hand-written joins, `::text` casts, array indexing (`bvpzKodai[1]`), and
  Postgres-specific syntax that the LLM further edits per case. Schema drift or a typo yields empty results that can be
  misread as findings.
- **Surface:** repo script + schema snapshot (see P1.6); optionally a Skill helper.

---

## P1 — Architecture modernisation (agentic best practices)

### P1.1 Introduce a top-level orchestrator; retire the spawn-chain

- **What:** A planner/orchestrator owns `plan.md` and investigation state and dispatches theme workers, collecting their
  results — instead of each investigator spawning the next.
- **Why:** The current chain has no recovery: if investigator _k_ fails, the run dies and no agent owns restart. It also
  serialises everything and compounds context. Orchestrator-worker is Anthropic's recommended multi-agent topology.
- **Surface:** restructure Subagents; the planner becomes the orchestrator.

### P1.2 Parallelise independent themes (fan-out / fan-in), with a second targeted wave

- **What:** Run independent theme workers concurrently for an initial screening pass, then have the orchestrator merge
  "new entities surfaced" and dispatch a focused second wave + synthesis.
- **Why:** Most themes are independent; serial execution is slow and lets one theme's context bloat the next. Two-phase
  fan-out preserves the genuine benefit of the current design (later themes seeing entities surfaced earlier) without
  paying for full serialisation.
- **Surface:** orchestrator dispatch logic; parallel Subagent invocation.

### P1.3 Centralise shared rules into a Claude Code Skill

- **What:** A `procurement-mcp-querying` Skill holding the tool-selection table, the mandatory person-investigation
  sequence, the view/coverage reference, the quantitative-claims rule, and failure handling — loaded on demand by all
  agents instead of copy-pasted into each.
- **Why:** The same ~40 lines are duplicated across planner/investigator/reporter and have already drifted. Skills give
  progressive disclosure (lower context cost) and a single edit point (no drift). This is the most direct answer to
  "should I use Claude Code Skills?" — yes, start here.
- **Surface:** new Skill under `.claude/skills/`.

### P1.4 Parameterised, validated SQL template library

- **What:** Convert each theme's SQL into named, parameterised templates (fill JAR codes / date windows / thresholds)
  exposed as a Skill or scripts, with the validated query checked in. The agent selects a template and supplies
  parameters rather than authoring SQL freehand.
- **Why:** Anthropic guidance: prefer deterministic code over LLM-generated logic wherever possible. Pre-validated
  queries collapse the SQL-hallucination and silent-empty-result surface and make findings reproducible.
- **Surface:** Skill + `docs/themes/*.sql` template files; thresholds sourced from P2.4 reference data.

### P1.5 Context economy: separate a compact facts ledger from verbose raw dumps

- **What:** Keep `dossier.md` as a compact, structured facts table (entity → confirmed metric → ledger ID) and move the
  bulky raw output into the evidence ledger (P0.1). Workers read only the facts they need plus their theme; they do not
  re-ingest every prior raw dump.
- **Why:** "Record raw MCP results in full" + "read the full dossier and all prior theme files" guarantees unbounded
  context growth, "lost-in-the-middle" degradation, and rising cost as themes accumulate.
- **Surface:** dossier convention change + agent read-scope rules.

### P1.6 Checked-in schema snapshot + enforce the `get_schema` gate

- **What:** Commit a generated snapshot of live table/view columns to the repo; have agents/skills diff against it and
  require a `get_schema` confirmation (or snapshot match) before running theme SQL.
- **Why:** "Call get_schema before writing SQL" is advisory today. A snapshot makes column drift between theme examples
  and the live DB visible instead of surfacing as confusing empty results.
- **Surface:** repo artifact + refresh script + Skill reference.

### P1.7 Structured machine-readable handoffs (`dossier.json` / `plan.json`)

- **What:** Back the human-readable markdown with structured JSON for entities, codes, selected themes, and confirmed
  metrics, validated against a schema on write.
- **Why:** Downstream agents currently parse prose tables, which is fragile. Structured handoffs let the reporter and
  verifier validate numbers programmatically and eliminate parse ambiguity.
- **Surface:** schema files + write/validate helper.

---

## P2 — Domain methodology (fraud-detection rigor)

### P2.1 Standardised red-flag indicator framework

- **What:** Add a computed indicator set used across themes: **single-bidding rate**, **Coefficient of Variation of bids
  (CV)**, **Herfindahl-Hirschman Index (HHI)** for buyer/supplier concentration, **Benford's-law** deviation on contract
  values, procedure-type and advertisement-period flags — i.e. a Tyras adaptation of the established Corruption Risk
  Index (CRI) used in EU procurement research (Fazekas et al. / Opentender / ARACHNE).
- **Why:** Many themes ask the LLM to judge whether something is "anomalous" or "suspiciously uniform" with no baseline.
  Standard, computed indicators replace LLM gut-judgement with reproducible numbers and are the field's accepted method.
- **Surface:** new indicator theme/skill + parameterised SQL (depends on P1.4); validate thresholds on live data.

### P2.2 Weighted confidence scoring model

- **What:** Replace free-form High/Medium/Low confidence with a weighted score: count of independent red-flag indicators
  × severity weights → banded confidence, recorded per finding.
- **Why:** Current confidence labels are inconsistent LLM judgement. A scoring model makes confidence comparable across
  themes and investigations and defensible in a referral.
- **Surface:** scoring rubric in the Skill + reporter logic.

### P2.3 Elevate single-bidding to a first-class indicator — DONE (theme 28)

- **What:** Single-bidding is now a dedicated theme ([28](docs/themes/28-single-bidding-competition-intensity.md)): a
  structural screen (procedure mix, buyer→supplier concentration) to shortlist, then a per-procurement bidder count from
  each ATN-1 file. Cross-referenced from themes 2, 14, 17, 20, 27.
- **Why:** Single-bidding is the strongest empirically validated corruption proxy in EU procurement literature; it
  deserves headline status and consistent measurement.
- **Remaining:** fold the structural screen into the P2.1 indicator framework once that lands; a notice-level bid-count
  field (P3.9) would let it run market-wide instead of per procurement.

### P2.4 Maintained thresholds & reference-data table

- **What:** Extract hardcoded thresholds (the €30k MVT and €215k EU sub-central values in theme 5, the 3-year windows,
  CPV groupings) into a single dated reference file the SQL templates read from.
- **Why:** Thresholds change over time and by procedure; baking them into example SQL guarantees silent staleness. A
  dated table keeps every theme consistent and auditable, and makes the "as of" date explicit.
- **Surface:** `docs/reference/thresholds.md|json` consumed by P1.4 templates.

---

## P3 — Safety, reproducibility & operations

### P3.1 Eval harness with golden cases

- **What:** A set of fixture investigations with known entities and expected red-flag outcomes, plus assertion- and
  LLM-judge-based checks, runnable on prompt/theme/agent changes.
- **Why:** There is no regression signal today; any edit to prompts or themes is a blind change. Evals are the
  foundation of iterating an agentic system without silently degrading it.
- **Surface:** `evals/` harness + golden fixtures (can seed from past `investigations/` once available).

### P3.2 Defamation / harm guardrails + mandatory exculpatory step

- **What:** Elevate "indicators are not conclusions" to a first-class constraint: require each named-entity finding to
  include an explicit exculpatory/innocent-explanation check, and gate any report that names a person/company behind a
  human-review acknowledgement.
- **Why:** The system outputs fraud suspicion about real, named people and companies from automated indicators. The
  current "alleged/suspected" wording rule is necessary but thin for that level of reputational and legal risk.
- **Surface:** agent rules + reporter template section + a finalisation gate (hook).

### P3.3 PII minimisation policy for PINREG data

- **What:** Guidance on minimising, scoping, and redacting sensitive personal data (spouse employment, personal
  transactions from `rysiaiDelSandoriu`) in stored artifacts and reports.
- **Why:** PINREG declarations are highly sensitive personal data; there is currently no minimisation or redaction
  policy, only free-form pasting into markdown.
- **Surface:** policy doc + reporter redaction rules.

### P3.4 Entity disambiguation step (homonyms)

- **What:** A structured disambiguation routine when `search_sutartys(search="Pavardė")` returns multiple people —
  confirm identity via PINREG code/links before attributing contracts, instead of the manual "filter by first name"
  note.
- **Why:** Common Lithuanian surnames make wrong-person attribution easy, and in a fraud context misattribution is a
  serious harm. This is currently left to the LLM's manual filtering.
- **Surface:** routine in the shared Skill (P1.3) + person-sequence update.

### P3.5 Structured case intake (slash command)

- **What:** A `/new-investigation` slash command that captures scope, named entities, alleged fraud types, jurisdiction,
  and time window in a consistent schema, feeding the orchestrator.
- **Why:** The planner currently parses a free-form Lithuanian paragraph; structured intake reduces mis-parsing of
  entities/scope at the most error-amplifying point of the pipeline.
- **Surface:** slash command + intake schema.

### P3.6 Model tiering across roles

- **What:** Use the strongest model (Opus 4.8) for synthesis/critic roles (reporter, verifier), keep Sonnet for theme
  workers, and consider Haiku for mechanical steps (ledger formatting, schema diffs).
- **Why:** All agents are currently Sonnet. Synthesis and adversarial verification benefit most from a stronger model;
  mechanical steps can be cheaper. Right-sizing improves both quality and cost.
- **Surface:** agent frontmatter `model:` fields.

### P3.7 MCP resilience: retry/backoff and server-health preflight

- **What:** A preflight check that the MCP server is reachable before an investigation starts (it was down during this
  review), plus retry/backoff rules and a clear abort path when it is unavailable mid-run.
- **Why:** `tech-report.md` only captures failures after the fact. The server being unreachable should fail fast and
  loud, not produce a half-finished investigation with gaps mistaken for findings.
- **Surface:** preflight script/hook + failure rules in the Skill.

### P3.8 Cross-investigation memory (known patterns & false-positive registry)

- **What:** Use agent/project memory to accumulate confirmed entities, recurring shell-company patterns, and a
  false-positive registry that future investigations consult to avoid re-flagging cleared entities.
- **Why:** The planner already declares `memory: project` but it is unused for learning. A curated pattern/FP memory
  reduces repeat false positives and compounds investigative value across cases.
- **Surface:** memory convention + a maintained registry artifact.

### P3.9 MCP server feature requests (dependency-side)

- **What:** Track upstream asks to the MCP server: a real `count`/cursor on `search_*` (today: max 50 rows,
  `total: null`), and a **notice-level "tenders received" / bidder-count field** so single-bidding can be computed
  market-wide instead of read one ATN-1 file at a time (and ideally a structured participants endpoint so bid data isn't
  only reachable by parsing XLSX page text).
- **Why:** The entire `QUANTITATIVE CLAIMS RULE` exists to work around `search_*` being unable to confirm scale, and
  bid-level competition analysis is currently per-procurement and qualitative only. Fixing these at the source removes
  whole classes of workaround and hallucination risk. Out of this repo, but the highest-value external dependency.
- **Surface:** upstream issue against the MCP server.

---

## Dependency notes

- P0.1 (evidence ledger) underpins P0.2, P0.3, P1.5, P1.7, P2.2 and P3.1 — sequence it first.
- P1.3 (shared Skill) is the natural home for the rules referenced by P0.3, P0.4, P1.4, P2.2, P3.4 and P3.7.
- P1.4 (SQL templates) depends on P1.6 (schema snapshot) and P2.4 (thresholds reference).
