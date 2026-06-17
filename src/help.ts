export const HELP_TEXT = `
Tyras — Lithuanian Public Procurement Fraud Investigation Pipeline

Usage:
  npm run investigate 20260617_kelme

  First run  — creates investigations/20260617_kelme/case.md for you to fill in.
  Second run — reads case.md, asks for confirmation, then runs the full pipeline.
  After that — resumes from where it left off (reads investigation-state.json).

Prerequisites:
  - Claude CLI installed and authenticated (claude auth)
  - MCP server viespirkiai-local configured in .claude settings

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
  investigations/<case-id>/
    case.md                 — case description (written by you)
    dossier.md              — shared entity data
    plan.md                 — selected themes and queries
    theme-NN-*.md           — per-theme findings
    report.md               — final investigation report
    tech-report.md          — MCP tool failures and data gaps
    tech-report-summary.md  — categorized technical issues
    investigation.log       — full orchestrator log with timestamps
    investigation-state.json — orchestration state (for resume)
`;
