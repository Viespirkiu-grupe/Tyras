import { runAgent } from "../agent-loop.js";
import { formatDuration } from "../io/format.js";
import { loadPromptTemplate } from "../io/loader.js";
import type { InvestigatorInputs, StepResult } from "../types.js";

const systemPrompt = loadPromptTemplate("investigator");

export async function runInvestigator(
  inputs: InvestigatorInputs,
  model: string,
): Promise<{ step: StepResult }> {
  const priorFindingsBlock = inputs.priorFindings.length > 0
    ? inputs.priorFindings.map((f) =>
        `### Prior findings: ${f.path}\n\n${f.content}`
      ).join("\n\n---\n\n")
    : "(no prior theme findings yet — you are the first theme)";

  const userMessage = `## Theme Investigation Assignment

**Case ID:** ${inputs.caseId}
**Date:** ${new Date().toISOString().split("T")[0]}
**Theme index:** ${inputs.themeIndex}
**Theme name:** ${inputs.themeName}
**Output path:** ${inputs.outputPath}
**Dossier path:** ${inputs.dossierPath}
**Plan path:** ${inputs.planPath}
**Next theme index:** ${inputs.nextThemeIndex} ${inputs.nextThemeIndex === 0 ? "(you are the LAST theme)" : ""}

---

## Shared Dossier

${inputs.dossierContent}

---

## Prior Theme Findings

${priorFindingsBlock}

---

## Theme Document: ${inputs.themeName}

Source: ${inputs.themeDocument}

${inputs.themeDocContent}

---

All context is provided above. Do NOT re-read these files. Proceed directly to running theme-specific MCP queries and writing your findings.`;

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model,
    agentName: `investigator-${inputs.themeIndex}`,
    enableMcp: true,
  });

  const step: StepResult = {
    stepName: `theme-${String(inputs.themeIndex).padStart(2, "0")}-${inputs.themeName}`,
    durationMs: result.durationMs,
    duration: formatDuration(result.durationMs),
    costUsd: result.costUsd,
    success: true,
    retries: 0,
    numTurns: result.numTurns,
  };

  return { step };
}
