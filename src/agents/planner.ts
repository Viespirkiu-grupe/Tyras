import { BaseAgent } from "./base-agent.js";
import type { AgentResult } from "../agent-loop.js";
import type { IWorkspace } from "../io/workspace.js";
import type { PlannerHandoff, StepResult } from "../types.js";

export interface PlannerResult {
  handoff: PlannerHandoff;
  step: StepResult;
}

export class PlannerAgent extends BaseAgent<PlannerResult> {
  readonly templateName = "planner";
  readonly stepName = "planner";
  readonly agentName = "planner";
  override readonly enableMcp = true;

  private _handoff: PlannerHandoff | null = null;

  constructor(
    workspace: IWorkspace,
    private readonly casePrompt: string,
    private readonly caseId: string,
  ) {
    super(workspace);
  }

  private get caseDir(): string {
    return `investigations/${this.caseId}`;
  }

  getTemplateVars(): Record<string, string> {
    return { CASE_ID: this.caseId, CASE_DIR: this.caseDir };
  }

  buildUserMessage(): string {
    return `## Investigation Case

**Case ID:** ${this.caseId}
**Date:** ${this.todayDate()}

${this.casePrompt}

Begin by reading the theme index at docs/index/mcp-investigator-prompt.md, then proceed with entity lookups and investigation planning.`;
  }

  protected override async validateOutput(result: AgentResult): Promise<void> {
    const handoff = PlannerAgent.parseHandoff(result.text);
    if (!handoff) {
      throw new Error("Planner did not return a valid handoff JSON block");
    }
    this._handoff = handoff;
  }

  protected override async buildResult(
    _result: AgentResult,
    step: StepResult,
  ): Promise<PlannerResult> {
    return { handoff: this._handoff!, step };
  }

  static parseHandoff(text: string): PlannerHandoff | null {
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
}

export async function runPlanner(
  workspace: IWorkspace,
  casePrompt: string,
  caseId: string,
  model: string,
): Promise<{ handoff: PlannerHandoff; step: StepResult }> {
  return new PlannerAgent(workspace, casePrompt, caseId).run(model);
}
