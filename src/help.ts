export const HELP_TEXT = `
Tyras — Lithuanian Public Procurement Fraud Investigation Pipeline

Usage:
  npm run investigate -- investigate "Case description..." --keyword kelme
  npm run investigate -- investigate "Case description..." --case-id 20260617_kelme
  npm run investigate -- resume 20260617_kelme

Prerequisites:
  - Claude CLI installed and authenticated (claude auth)
  - MCP server viespirkiai-local configured in .claude settings

Options:
  --keyword <word>   Short Latin keyword for case ID (max 20 chars, e.g. kelme, vilnius_roads)
  --case-id <id>     Explicit case ID (overrides --keyword)

Environment variables:
  MODEL                Model alias (default: sonnet). Use opus, haiku, etc.
  MAX_RETRIES          Max retries per step (default: 3)
  MAX_BUDGET_PER_STEP  Max USD per step (default: 5.0)
  PARALLEL             Enable parallel theme execution (default: false)

Pipeline:
  1. Planner       — parses case, queries MCP for entities, selects themes
  2. Investigator  — runs each theme (sequential or parallel)
  3. Reporter      — synthesizes findings into final report
  4. Tech Reviewer — categorizes MCP and system issues from tech-report

Output:
  investigations/<YYYYMMDD_keyword>/
    dossier.md              — shared entity data
    plan.md                 — selected themes and queries
    theme-NN-*.md           — per-theme findings
    report.md               — final investigation report
    tech-report.md          — MCP tool failures and data gaps
    tech-report-summary.md  — categorized technical issues
    investigation.log       — full orchestrator log with timestamps
    state.json              — orchestration state (for resume)
`;
