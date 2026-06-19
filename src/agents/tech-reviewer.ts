import { runAgent } from "../agent-loop.js";
import { formatDuration } from "../io/format.js";
import { loadPromptTemplate, fillVars } from "../io/loader.js";
import type { StepResult } from "../types.js";
import { readFile, fileExists } from "../io/workspace.js";

const promptTemplate = loadPromptTemplate("tech-reviewer");

export async function runTechReviewer(
  caseId: string,
  caseDir: string,
  model: string,
): Promise<{ step: StepResult }> {
  const systemPrompt = fillVars(promptTemplate, { CASE_DIR: caseDir });

  const techReportPath = `${caseDir}/tech-report.md`;
  let techReport = "";
  if (await fileExists(techReportPath)) {
    techReport = await readFile(techReportPath);
  }

  const userMessage = `## Tech Report Review

**Case ID:** ${caseId}
**Date:** ${new Date().toISOString().split("T")[0]}
**Output path:** ${caseDir}/tech-report-summary.md

### Tech Report Content

${techReport || "No tech report found — write a summary noting that no technical issues were reported."}`;

  const outputPath = `${caseDir}/tech-report-summary.md`;

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model,
    agentName: "tech-reviewer",
    enableMcp: false,
  });

  if (!(await fileExists(outputPath))) {
    throw new Error(
      `tech-reviewer finished (${result.numTurns} turns, ${formatDuration(result.durationMs)}) but output file missing: ${outputPath}`,
    );
  }

  const step: StepResult = {
    stepName: "tech-reviewer",
    durationMs: result.durationMs,
    duration: formatDuration(result.durationMs),
    costUsd: result.costUsd,
    success: true,
    retries: 0,
    numTurns: result.numTurns,
    tokenUsage: result.tokenUsage,
  };

  return { step };
}
