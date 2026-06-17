import * as readline from "readline";
import { runPlanner } from "./agents/planner.js";
import { runInvestigator } from "./agents/investigator.js";
import { runReporter } from "./agents/reporter.js";
import { runTechReviewer } from "./agents/tech-reviewer.js";
import * as workspace from "./io/workspace.js";
import { initLogger, log, warn } from "./io/logger.js";
import { CONFIG } from "./config.js";
import type { InvestigationState, InvestigatorInputs, StepResult, PlannerHandoff } from "./types.js";

const CASE_MD_TEMPLATE = `# Case Description

Describe the case here. Include:
- Named organizations and their JAR codes (if known)
- Named individuals
- Contract types, amounts, time periods
- Alleged fraud patterns
- Any specific concerns or leads
`;

export async function investigate(caseId: string): Promise<void> {
  const caseDir = await workspace.createWorkspace(caseId);
  const caseMd = workspace.caseMdPath(caseDir);

  if (!(await workspace.fileExists(caseMd))) {
    await workspace.writeFile(caseMd, CASE_MD_TEMPLATE);
    console.log(`\n  📂 Created: ${caseMd}`);
    console.log(`  ✏️  Write your case description in this file, then run again:`);
    console.log(`     npm run investigate ${caseId}\n`);
    return;
  }

  const casePrompt = await workspace.readFile(caseMd);
  const saved = (await workspace.loadState(caseDir)) as InvestigationState | null;

  if (saved) {
    initLogger(caseDir);
    log("");
    log("🚀 Tyras Investigation Orchestrator (resuming)");
    log(`   Model: ${CONFIG.model}  Budget: $${CONFIG.maxBudgetPerStep}/step  Parallel: ${CONFIG.parallelThemes}`);
    log(`   Case:  ${caseId}`);
    log(`   Status: ${saved.status}, ${saved.completedThemes.length} themes done`);
    log("");
    await runPipeline(caseId, caseDir, casePrompt, saved);
    return;
  }

  console.log(`\n  📋 Case: ${caseId}\n`);
  console.log(casePrompt.trim());
  console.log();

  const confirmed = await confirm("  Start investigation?");
  if (!confirmed) {
    console.log("  Aborted. Edit case.md and run again.\n");
    return;
  }

  initLogger(caseDir);
  log("");
  log("🚀 Tyras Investigation Orchestrator");
  log(`   Model: ${CONFIG.model}  Budget: $${CONFIG.maxBudgetPerStep}/step  Parallel: ${CONFIG.parallelThemes}`);
  log(`   Case:  ${caseId}`);
  log(`   Dir:   ${caseDir}/`);
  log("");

  const state: InvestigationState = {
    caseId,
    caseDir,
    status: "planning",
    completedThemes: [],
    steps: [],
    totalCostUsd: 0,
    startTime: Date.now(),
  };

  await runPipeline(caseId, caseDir, casePrompt, state);
}

async function runPipeline(
  caseId: string,
  caseDir: string,
  casePrompt: string,
  state: InvestigationState,
): Promise<void> {
  let plan: PlannerHandoff;
  if (state.status === "planning") {
    log("📋 Phase 1: Planning");
    log("");
    const { handoff, step } = await withRetry("planner", () =>
      runPlanner(casePrompt, caseId, CONFIG.model, CONFIG.maxBudgetPerStep),
    );
    plan = handoff;
    state.plan = plan;
    state.status = "investigating";
    recordStep(state, step);
    await workspace.saveState(caseDir, state);
    log("");
    log(`   📌 Plan: ${plan.themes.length} themes selected`);
    for (const t of plan.themes) {
      log(`      ${t.index}. ${t.name} [${t.priority}]`);
    }
    log("");
  } else {
    plan = state.plan!;
    log(`   📌 Plan loaded: ${plan.themes.length} themes, ${state.completedThemes.length} done`);
    log("");
  }

  if (state.status === "investigating") {
    log("🔎 Phase 2: Investigation");
    log("");
    const pendingThemes = plan.themes.filter((t) => !state.completedThemes.includes(t.index));

    if (CONFIG.parallelThemes) {
      await runThemesParallel(plan, pendingThemes, state);
    } else {
      await runThemesSequential(plan, pendingThemes, state);
    }

    state.status = "reporting";
    await workspace.saveState(caseDir, state);
    log("");
  }

  if (state.status === "reporting") {
    log("📊 Phase 3: Report");
    log("");
    const { step } = await withRetry("reporter", () =>
      runReporter(caseId, caseDir, CONFIG.model, CONFIG.maxBudgetPerStep),
    );
    recordStep(state, step);
    state.status = "tech-review";
    await workspace.saveState(caseDir, state);
    log("");
  }

  if (state.status === "tech-review") {
    log("🔧 Phase 4: Tech Review");
    log("");
    const { step } = await withRetry("tech-reviewer", () =>
      runTechReviewer(caseId, caseDir, CONFIG.model, CONFIG.maxBudgetPerStep),
    );
    recordStep(state, step);
    state.status = "complete";
    await workspace.saveState(caseDir, state);
    log("");
  }

  printSummary(state);
}

async function runThemesSequential(
  plan: PlannerHandoff,
  themes: PlannerHandoff["themes"],
  state: InvestigationState,
): Promise<void> {
  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    const nextThemeIndex = i + 1 < themes.length ? themes[i + 1].index : 0;

    log(`  📌 Theme ${theme.index}/${plan.themes.length}: ${theme.name} [${theme.priority}]`);

    const inputs: InvestigatorInputs = {
      caseId: state.caseId,
      caseDir: state.caseDir,
      dossierPath: plan.dossierPath,
      planPath: plan.planPath,
      themeIndex: theme.index,
      themeName: theme.name,
      themeDocument: theme.themeDocument,
      outputPath: theme.outputPath,
      nextThemeIndex,
    };

    const { step } = await withRetry(`investigator-${theme.index}`, () =>
      runInvestigator(inputs, CONFIG.model, CONFIG.maxBudgetPerStep),
    );
    recordStep(state, step);
    state.completedThemes.push(theme.index);
    await workspace.saveState(state.caseDir, state);
    log("");
  }
}

async function runThemesParallel(
  plan: PlannerHandoff,
  themes: PlannerHandoff["themes"],
  state: InvestigationState,
): Promise<void> {
  const [first, ...rest] = themes;

  if (first) {
    log(`  📌 Theme ${first.index}: ${first.name} [sequential baseline]`);
    const inputs: InvestigatorInputs = {
      caseId: state.caseId,
      caseDir: state.caseDir,
      dossierPath: plan.dossierPath,
      planPath: plan.planPath,
      themeIndex: first.index,
      themeName: first.name,
      themeDocument: first.themeDocument,
      outputPath: first.outputPath,
      nextThemeIndex: rest.length > 0 ? rest[0].index : 0,
    };
    const { step } = await withRetry(`investigator-${first.index}`, () =>
      runInvestigator(inputs, CONFIG.model, CONFIG.maxBudgetPerStep),
    );
    recordStep(state, step);
    state.completedThemes.push(first.index);
    await workspace.saveState(state.caseDir, state);
    log("");
  }

  const BATCH_SIZE = 3;
  for (let batchStart = 0; batchStart < rest.length; batchStart += BATCH_SIZE) {
    const batch = rest.slice(batchStart, batchStart + BATCH_SIZE);
    log(`  ⚡ Parallel batch: themes ${batch.map((t) => t.index).join(", ")}`);

    const results = await Promise.allSettled(
      batch.map((theme, i) => {
        const globalIdx = batchStart + i;
        const nextIdx = globalIdx + 1 < rest.length ? rest[globalIdx + 1].index : 0;
        const inputs: InvestigatorInputs = {
          caseId: state.caseId,
          caseDir: state.caseDir,
          dossierPath: plan.dossierPath,
          planPath: plan.planPath,
          themeIndex: theme.index,
          themeName: theme.name,
          themeDocument: theme.themeDocument,
          outputPath: theme.outputPath,
          nextThemeIndex: nextIdx,
        };
        return withRetry(`investigator-${theme.index}`, () =>
          runInvestigator(inputs, CONFIG.model, CONFIG.maxBudgetPerStep),
        );
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        recordStep(state, r.value.step);
        state.completedThemes.push(batch[i].index);
      } else {
        const failStep: StepResult = {
          stepName: `theme-${String(batch[i].index).padStart(2, "0")}-${batch[i].name}`,
          durationMs: 0,
          costUsd: 0,
          success: false,
          error: r.reason?.message || String(r.reason),
          retries: CONFIG.maxRetries,
          numTurns: 0,
        };
        recordStep(state, failStep);
      }
    }
    await workspace.saveState(state.caseDir, state);
    log("");
  }
}

async function withRetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < CONFIG.maxRetries) {
        const delay = Math.min(30_000 * Math.pow(2, attempt - 1), 120_000);
        warn(`  ⚠️  [${name}] attempt ${attempt} failed: ${lastError.message}`);
        warn(`  ⏳ retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }
  throw lastError!;
}

function recordStep(state: InvestigationState, step: StepResult): void {
  state.steps.push(step);
  state.totalCostUsd += step.costUsd;

  const dur = formatDuration(step.durationMs);
  if (step.success) {
    log(`  ✅ ${step.stepName} — ${dur}, $${step.costUsd.toFixed(4)}, ${step.numTurns} turns`);
  } else {
    log(`  ❌ ${step.stepName} — FAILED: ${step.error}`);
  }
}

function printSummary(state: InvestigationState): void {
  const totalMs = Date.now() - state.startTime;

  log("═══════════════════════════════════════════════");
  log("✅ Investigation Complete");
  log("");
  log(`   Case:     ${state.caseId}`);
  log(`   Duration: ${formatDuration(totalMs)}`);
  log(`   Cost:     $${state.totalCostUsd.toFixed(4)}`);
  log(`   Steps:    ${state.steps.length}`);
  log(`   Report:   ${state.caseDir}/report.md`);
  log("");
  log("   Step Breakdown:");
  log("   ─────────────────────────────────────────────");
  for (const step of state.steps) {
    const icon = step.success ? "✅" : "❌";
    const dur = formatDuration(step.durationMs).padStart(6);
    log(`   ${icon} ${step.stepName.padEnd(35)} ${dur}  $${step.costUsd.toFixed(4).padStart(8)}  ${step.numTurns} turns`);
  }
  log("═══════════════════════════════════════════════");
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m${remSec}s`;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
