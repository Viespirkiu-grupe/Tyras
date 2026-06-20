import * as readline from "readline";
import { execSync } from "child_process";
import { runPlanner } from "./agents/planner.js";
import { runInvestigator } from "./agents/investigator.js";
import { runReporter } from "./agents/reporter.js";
import { runTechReviewer } from "./agents/tech-reviewer.js";
import { preflightMcp, QuotaExhaustedError, probeQuota, parseResetTime } from "./agent-loop.js";
import { Workspace } from "./io/workspace.js";
import type { IWorkspace } from "./io/workspace.js";
import { initLogger, log, warn, error } from "./io/logger.js";
import { CONFIG } from "./config.js";
import { formatDuration, formatDateTime } from "./io/format.js";
import type { InvestigationState, InvestigatorInputs, StepResult, PlannerHandoff } from "./types.js";

const CASE_MD_TEMPLATE = `# Case Description

Describe the case here. Include:
- Named organizations and their JAR codes (if known)
- Named individuals
- Contract types, amounts, time periods
- Alleged fraud patterns
- Any specific concerns or leads
`;

export async function investigate(caseId: string, ws?: IWorkspace): Promise<void> {
  const workspace = ws ?? new Workspace();
  const caseDir = await workspace.createCaseDir(caseId);
  const caseMd = workspace.caseMdPath(caseDir);

  if (!(await workspace.fileExists(caseMd))) {
    await workspace.writeFile(caseMd, CASE_MD_TEMPLATE);
    console.log(`\n  📂 Created: ${caseMd}`);
    console.log(`  ✏️  Write your case description in this file, then run again:`);
    console.log(`     npm run investigate ${caseId}\n`);
    return;
  }

  console.log("\n  🔌 Checking MCP connection...");
  await preflightMcp();
  console.log("  ✅ MCP connection verified.\n");

  const casePrompt = await workspace.readFile(caseMd);
  const saved = (await workspace.loadState(caseDir)) as InvestigationState | null;

  if (saved) {
    initLogger(caseDir);
    log("");
    log("🚀 Tyras Investigation Orchestrator (resuming)");
    log(`   Model: ${CONFIG.model}  Parallel: ${CONFIG.parallelThemes}`);
    log(`   Case:  ${caseId}`);
    log(`   Status: ${saved.status}, ${saved.completedThemes.length} themes done`);
    log("");
    await runPipeline(workspace, caseId, caseDir, casePrompt, saved);
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
  log(`   Model: ${CONFIG.model}  Parallel: ${CONFIG.parallelThemes}`);
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
    startDateTime: formatDateTime(new Date()),
  };

  await runPipeline(workspace, caseId, caseDir, casePrompt, state);
}

async function runPipeline(
  workspace: IWorkspace,
  caseId: string,
  caseDir: string,
  casePrompt: string,
  state: InvestigationState,
): Promise<void> {
  let plan: PlannerHandoff;
  if (state.status === "planning") {
    log("📋 Phase 1: Planning");
    log("");
    await ensureQuotaAvailable("planner");
    const { handoff, step } = await withRetry("planner", () =>
      runPlanner(workspace, casePrompt, caseId, CONFIG.model),
    );
    plan = handoff;
    state.plan = plan;
    state.status = "investigating";
    recordStep(state, step);
    formatDocuments(caseDir);
    await workspace.saveState(caseDir, state);
    log("");
    log(`   📌 Plan: ${plan.themes.length} themes selected`);
    for (const t of plan.themes) {
      log(`      Theme ${t.themeCode}: ${t.themeName} [${t.priority}]`);
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
    const pendingThemes = plan.themes.filter((t) => !state.completedThemes.includes(t.themeCode));

    if (CONFIG.parallelThemes) {
      await runThemesParallel(workspace, plan, pendingThemes, state);
    } else {
      await runThemesSequential(workspace, plan, pendingThemes, state);
    }

    state.status = "reporting";
    await workspace.saveState(caseDir, state);
    log("");
  }

  if (state.status === "reporting") {
    log("📊 Phase 3: Report");
    log("");
    await ensureQuotaAvailable("reporter");
    const { step } = await withRetry("reporter", () =>
      runReporter(workspace, caseId, caseDir, CONFIG.model),
    );
    recordStep(state, step);
    formatDocuments(caseDir);
    state.status = "tech-review";
    await workspace.saveState(caseDir, state);
    log("");
  }

  if (state.status === "tech-review") {
    log("🔧 Phase 4: Tech Review");
    log("");
    await ensureQuotaAvailable("tech-reviewer");
    const { step } = await withRetry("tech-reviewer", () =>
      runTechReviewer(workspace, caseId, caseDir, CONFIG.model),
    );
    recordStep(state, step);
    formatDocuments(caseDir);
    state.status = "complete";
    await workspace.saveState(caseDir, state);
    log("");
  }

  printSummary(state);
}

async function buildInvestigatorInputs(
  workspace: IWorkspace,
  plan: PlannerHandoff,
  theme: PlannerHandoff["themes"][number],
  state: InvestigationState,
): Promise<InvestigatorInputs> {
  const dossierContent = await workspace.readFile(plan.dossierPath);
  const themeDocContent = await workspace.readFile(theme.themeDocument);

  return {
    caseId: state.caseId,
    caseDir: state.caseDir,
    dossierPath: plan.dossierPath,
    planPath: plan.planPath,
    themeCode: theme.themeCode,
    themeName: theme.themeName,
    themeDocument: theme.themeDocument,
    outputPath: theme.outputPath,
    dossierContent,
    themeDocContent,
  };
}

async function runThemesSequential(
  workspace: IWorkspace,
  plan: PlannerHandoff,
  themes: PlannerHandoff["themes"],
  state: InvestigationState,
): Promise<void> {
  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    const done = state.completedThemes.length;
    const total = plan.themes.length;

    log(`  📌 Theme ${theme.themeCode} (${done + 1}/${total}): ${theme.themeName} [${theme.priority}]`);

    await ensureQuotaAvailable(`investigator-${theme.themeCode}`);

    const inputs = await buildInvestigatorInputs(workspace, plan, theme, state);

    const { step } = await withRetry(`investigator-${theme.themeCode}`, () =>
      runInvestigator(workspace, inputs, CONFIG.model),
    );
    recordStep(state, step);
    formatDocuments(state.caseDir);
    state.completedThemes.push(theme.themeCode);
    await workspace.saveState(state.caseDir, state);
    log("");
  }
}

async function runThemesParallel(
  workspace: IWorkspace,
  plan: PlannerHandoff,
  themes: PlannerHandoff["themes"],
  state: InvestigationState,
): Promise<void> {
  const [first, ...rest] = themes;

  if (first) {
    const done = state.completedThemes.length;
    const total = plan.themes.length;
    log(`  📌 Theme ${first.themeCode} (${done + 1}/${total}): ${first.themeName} [sequential baseline]`);
    const inputs = await buildInvestigatorInputs(workspace, plan, first, state);
    const { step } = await withRetry(`investigator-${first.themeCode}`, () =>
      runInvestigator(workspace, inputs, CONFIG.model),
    );
    recordStep(state, step);
    formatDocuments(state.caseDir);
    state.completedThemes.push(first.themeCode);
    await workspace.saveState(state.caseDir, state);
    log("");
  }

  const BATCH_SIZE = 3;
  for (let batchStart = 0; batchStart < rest.length; batchStart += BATCH_SIZE) {
    const batch = rest.slice(batchStart, batchStart + BATCH_SIZE);

    await ensureQuotaAvailable(`batch-${batch.map((t) => t.themeCode).join(",")}`);

    log(`  ⚡ Parallel batch: themes ${batch.map((t) => t.themeCode).join(", ")}`);

    const batchInputs = await Promise.all(
      batch.map((theme) => buildInvestigatorInputs(workspace, plan, theme, state)),
    );

    const results = await Promise.allSettled(
      batchInputs.map((inputs) =>
        withRetry(`investigator-${inputs.themeCode}`, () =>
          runInvestigator(workspace, inputs, CONFIG.model),
        ),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        recordStep(state, r.value.step);
        state.completedThemes.push(batch[i].themeCode);
      } else {
        const failStep: StepResult = {
          stepName: `theme-${String(batch[i].themeCode).padStart(2, "0")}-${batch[i].themeName}`,
          durationMs: 0,
          duration: "0s",
          costUsd: 0,
          success: false,
          error: r.reason?.message || String(r.reason),
          retries: CONFIG.maxRetries,
          numTurns: 0,
        };
        recordStep(state, failStep);
      }
    }
    formatDocuments(state.caseDir);
    await workspace.saveState(state.caseDir, state);
    log("");
  }
}

let _quotaWaitPromise: Promise<void> | null = null;

async function waitForQuotaReset(
  stepName: string,
  initialError: QuotaExhaustedError,
): Promise<void> {
  const resetMs = parseResetTime(initialError.stderr);
  if (resetMs && resetMs > 0) {
    const waitMs = resetMs + 60_000;
    log(`  ⏳ [${stepName}] quota resets in ${formatDuration(resetMs)}. Sleeping ${formatDuration(waitMs)}...`);
    await sleep(waitMs);
    return;
  }

  const startWait = Date.now();
  let probeCount = 0;

  while (Date.now() - startWait < CONFIG.quotaMaxWaitMs) {
    probeCount++;
    const intervalMin = Math.round(CONFIG.quotaProbeIntervalMs / 60_000);
    log(`  ⏳ [${stepName}] waiting ${intervalMin}min then probing... (probe #${probeCount})`);
    await sleep(CONFIG.quotaProbeIntervalMs);

    const probe = await probeQuota(CONFIG.model);
    if (probe.available) {
      log(`  ✅ [${stepName}] quota available after ${formatDuration(Date.now() - startWait)}`);
      return;
    }

    if (probe.retryAfterMs && probe.retryAfterMs > 0) {
      const waitMs = probe.retryAfterMs + 60_000;
      log(`  ⏳ [${stepName}] API says retry in ${formatDuration(probe.retryAfterMs)}. Sleeping ${formatDuration(waitMs)}...`);
      await sleep(waitMs);
      return;
    }

    log(`  ⏳ [${stepName}] still rate-limited. Waited ${formatDuration(Date.now() - startWait)} total.`);
  }

  throw new Error(
    `[${stepName}] quota not restored after ${formatDuration(CONFIG.quotaMaxWaitMs)}. Giving up.`,
  );
}

async function waitForQuotaResetShared(
  stepName: string,
  initialError: QuotaExhaustedError,
): Promise<void> {
  if (_quotaWaitPromise) {
    log(`  ⏳ [${stepName}] joining existing quota wait...`);
    await _quotaWaitPromise;
    return;
  }
  _quotaWaitPromise = waitForQuotaReset(stepName, initialError);
  try {
    await _quotaWaitPromise;
  } finally {
    _quotaWaitPromise = null;
  }
}

async function ensureQuotaAvailable(stepName: string): Promise<void> {
  const probe = await probeQuota(CONFIG.model);
  if (!probe.available) {
    warn(`  ⚠️  [${stepName}] quota not available before step. Waiting for reset...`);
    const syntheticErr = new QuotaExhaustedError(stepName, 0, 0, probe.stderr);
    await waitForQuotaReset(stepName, syntheticErr);
  }
}

export async function withRetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof QuotaExhaustedError) {
        warn(`  ⚠️  [${name}] quota exhausted. Switching to probe-wait mode.`);
        await waitForQuotaResetShared(name, err);
        continue;
      }

      attempt++;
      if (attempt >= CONFIG.maxRetries) throw lastError;
      const delay = Math.min(30_000 * Math.pow(2, attempt - 1), 120_000);
      warn(`  ⚠️  [${name}] attempt ${attempt} failed: ${lastError.message}`);
      warn(`  ⏳ retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
}

export function recordStep(state: InvestigationState, step: StepResult): void {
  state.steps.push(step);
  state.totalCostUsd += step.costUsd;

  const dur = formatDuration(step.durationMs);
  if (step.success) {
    const tkn = step.tokenUsage;
    const tknInfo = tkn ? `, ${fmtK(tkn.inputTokens + tkn.cacheReadTokens + tkn.cacheCreationTokens)} in, ${fmtK(tkn.outputTokens)} out` : "";
    log(`  ✅ ${step.stepName} — ${dur}, ${step.numTurns} turns${tknInfo}`);
  } else {
    log(`  ❌ ${step.stepName} — FAILED: ${step.error}`);
  }
}

export function printSummary(state: InvestigationState): void {
  const totalMs = Date.now() - state.startTime;

  log("═══════════════════════════════════════════════");
  log("✅ Investigation Complete");
  log("");
  log(`   Case:     ${state.caseId}`);
  log(`   Duration: ${formatDuration(totalMs)}`);
  log(`   Steps:    ${state.steps.length}`);
  log(`   Report:   ${state.caseDir}/report.md`);
  log("");
  log("   Step Breakdown:");
  log("   ─────────────────────────────────────────────");
  let grandIn = 0, grandOut = 0, grandCacheR = 0, grandCacheW = 0;
  for (const step of state.steps) {
    const icon = step.success ? "✅" : "❌";
    const dur = formatDuration(step.durationMs).padStart(6);
    const tkn = step.tokenUsage;
    const tknCol = tkn
      ? `  ${fmtK(tkn.inputTokens + tkn.cacheReadTokens + tkn.cacheCreationTokens).padStart(6)} in ${fmtK(tkn.outputTokens).padStart(5)} out`
      : "";
    log(`   ${icon} ${step.stepName.padEnd(35)} ${dur}  ${String(step.numTurns).padStart(3)} turns${tknCol}`);
    if (tkn) {
      grandIn += tkn.inputTokens;
      grandOut += tkn.outputTokens;
      grandCacheR += tkn.cacheReadTokens;
      grandCacheW += tkn.cacheCreationTokens;
    }
  }
  if (grandIn + grandOut > 0) {
    log("   ─────────────────────────────────────────────");
    log(`   Tokens total: ${fmtK(grandIn + grandCacheR + grandCacheW)} in (${fmtK(grandCacheR)} cached), ${fmtK(grandOut)} out`);
  }
  log("═══════════════════════════════════════════════");
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

function formatDocuments(caseDir: string): void {
  try {
    execSync(`npx prettier --write "${caseDir}/**/*.md"`, { stdio: "ignore" });
  } catch {
    warn("  ⚠️  Prettier formatting failed — continuing");
  }
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
