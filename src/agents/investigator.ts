import { runAgent } from "../agent-loop.js";
import { loadPrompt } from "../prompts/loader.js";
import type { InvestigatorInputs, StepResult } from "../types.js";

const systemPrompt = loadPrompt("investigator");

export async function runInvestigator(
  inputs: InvestigatorInputs,
  model: string,
  maxBudgetUsd?: number,
): Promise<{ step: StepResult }> {
  const userMessage = `## Theme Investigation Assignment

**Case ID:** ${inputs.caseId}
**Date:** ${new Date().toISOString().split("T")[0]}
**Theme index:** ${inputs.themeIndex}
**Theme name:** ${inputs.themeName}
**Theme document:** ${inputs.themeDocument}
**Output path:** ${inputs.outputPath}
**Dossier path:** ${inputs.dossierPath}
**Plan path:** ${inputs.planPath}
**Next theme index:** ${inputs.nextThemeIndex} ${inputs.nextThemeIndex === 0 ? "(you are the LAST theme)" : ""}

Start by reading the dossier, then any prior theme findings files in the investigation directory, then your theme document. After that, run theme-specific MCP queries and write your findings.`;

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model,
    agentName: `investigator-${inputs.themeIndex}`,
    enableMcp: true,
    maxBudgetUsd,
  });

  const step: StepResult = {
    stepName: `theme-${String(inputs.themeIndex).padStart(2, "0")}-${inputs.themeName}`,
    durationMs: result.durationMs,
    costUsd: result.costUsd,
    success: true,
    retries: 0,
    numTurns: result.numTurns,
  };

  return { step };
}
