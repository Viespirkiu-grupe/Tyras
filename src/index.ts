import { investigate } from "./orchestrator.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command === "investigate") {
    const casePrompt = args.find((a) => !a.startsWith("--"));
    if (!casePrompt || casePrompt === "investigate") {
      // Prompt is the second non-flag arg, or read from remaining args
      const promptParts = args.slice(1).filter((a) => !a.startsWith("--"));
      if (promptParts.length === 0) {
        console.error("Error: provide a case prompt as argument");
        console.error('Usage: npm run investigate -- "Case description..."');
        process.exit(1);
      }
      await investigate({
        casePrompt: promptParts.join(" "),
        caseId: getFlagValue(args, "--case-id"),
        resume: false,
      });
    } else {
      await investigate({
        casePrompt: args
          .slice(1)
          .filter((a) => !a.startsWith("--"))
          .join(" "),
        caseId: getFlagValue(args, "--case-id"),
        resume: false,
      });
    }
  } else if (command === "resume") {
    const caseId = args[1];
    if (!caseId) {
      console.error("Error: provide case ID to resume");
      console.error("Usage: npm run investigate -- resume inv-2026-001");
      process.exit(1);
    }
    await investigate({
      casePrompt: "",
      caseId,
      resume: true,
    });
  } else {
    // Treat the entire args as a case prompt
    await investigate({
      casePrompt: args.filter((a) => !a.startsWith("--")).join(" "),
      caseId: getFlagValue(args, "--case-id"),
      resume: false,
    });
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printUsage() {
  // @TODO: move message to constants or somewhere from the code to do not bloat it
  console.log(`
Tyras — Lithuanian Public Procurement Fraud Investigation Pipeline

Usage:
  npm run investigate -- investigate "Case description..."
  npm run investigate -- investigate "Case description..." --case-id inv-2026-003
  npm run investigate -- resume inv-2026-003

Prerequisites:
  - Claude CLI installed and authenticated (claude auth)
  - MCP server viespirkiai-local configured in .claude settings

Environment variables:
  MODEL                Model alias (default: sonnet). Use opus, haiku, etc.
  MAX_RETRIES          Max retries per step (default: 3)
  MAX_BUDGET_PER_STEP  Max USD per step (default: 5.0)
  PARALLEL             Enable parallel theme execution (default: false)

Pipeline:
  1. Planner    — parses case, queries MCP for entities, selects themes
  2. Investigator — runs each theme (sequential or parallel)
  3. Reporter   — synthesizes findings into final report

Output:
  investigations/<case-id>/
    dossier.md        — shared entity data
    plan.md           — selected themes and queries
    theme-NN-*.md     — per-theme findings
    report.md         — final investigation report
    tech-report.md    — MCP tool failures and data gaps
    state.json        — orchestration state (for resume)
`);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
