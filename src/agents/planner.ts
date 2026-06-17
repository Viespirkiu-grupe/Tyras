import { runAgent } from "../agent-loop.js";
import { formatDuration } from "../io/format.js";
import { loadPromptTemplate, fillVars } from "../io/loader.js";
import type { PlannerHandoff, StepResult } from "../types.js";

const promptTemplate = loadPromptTemplate("planner");

export async function runPlanner(
  casePrompt: string,
  caseId: string,
  model: string,
): Promise<{ handoff: PlannerHandoff; step: StepResult }> {
  const caseDir = `investigations/${caseId}`;
  const systemPrompt = fillVars(promptTemplate, { CASE_ID: caseId, CASE_DIR: caseDir });

  const userMessage = `## Investigation Case

**Case ID:** ${caseId}
**Date:** ${new Date().toISOString().split("T")[0]}

${casePrompt}

Begin by reading the theme index at docs/index/mcp-investigator-prompt.md, then proceed with entity lookups and investigation planning.`;

  const result = await runAgent({
    systemPrompt,
    userMessage,
    model,
    agentName: "planner",
    enableMcp: true,
  });

  const handoff = parseHandoff(result.text);
  if (!handoff) {
    throw new Error("Planner did not return a valid handoff JSON block");
  }

  const step: StepResult = {
    stepName: "planner",
    durationMs: result.durationMs,
    duration: formatDuration(result.durationMs),
    costUsd: result.costUsd,
    success: true,
    retries: 0,
    numTurns: result.numTurns,
  };

  return { handoff, step };
}

function parseHandoff(text: string): PlannerHandoff | null {
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[1]);
    if (!data.caseId || !data.themes || !Array.isArray(data.themes)) return null;
    return data as PlannerHandoff;
  } catch {
    return null;
  }
}
