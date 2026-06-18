import { runAgent } from "../agent-loop.js";
import { formatDuration } from "../io/format.js";
import { loadPromptTemplate } from "../io/loader.js";
import type { StepResult } from "../types.js";
import { listThemeFiles, fileExists } from "../io/workspace.js";

const systemPrompt = loadPromptTemplate("reporter");

export async function runReporter(
  caseId: string,
  caseDir: string,
  model: string,
): Promise<{ step: StepResult }> {
  const themeFiles = await listThemeFiles(caseDir);
  const themeFileList = themeFiles.map((f) => `- ${caseDir}/${f}`).join("\n");

  const userMessage = `## Report Writing Assignment

**Case ID:** ${caseId}
**Date:** ${new Date().toISOString().split("T")[0]}
**Report output path:** ${caseDir}/report.md

### Source documents to read (in order):

1. **Dossier:** ${caseDir}/dossier.md
2. **Plan:** ${caseDir}/plan.md
3. **Theme findings (read in order):**
${themeFileList}

Read all source documents first, then write the report incrementally:
- Use the Write tool for the first section (header + Executive Summary)
- Use the Edit tool to append each subsequent section

This ensures partial progress is saved even if something fails mid-way.`;

  const reportPath = `${caseDir}/report.md`;

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model,
    agentName: "reporter",
    enableMcp: false,
  });

  if (!(await fileExists(reportPath))) {
    throw new Error(
      `reporter finished (${result.numTurns} turns, ${formatDuration(result.durationMs)}) but output file missing: ${reportPath}`,
    );
  }

  const step: StepResult = {
    stepName: "reporter",
    durationMs: result.durationMs,
    duration: formatDuration(result.durationMs),
    costUsd: result.costUsd,
    success: true,
    retries: 0,
    numTurns: result.numTurns,
  };

  return { step };
}
