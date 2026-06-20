import { FileOutputAgent } from "./base-agent.js";
import type { IWorkspace } from "../io/workspace.js";
import type { StepResult } from "../types.js";

export class TechReviewerAgent extends FileOutputAgent {
  readonly templateName = "tech-reviewer";
  readonly stepName = "tech-reviewer";
  readonly agentName = "tech-reviewer";

  constructor(
    workspace: IWorkspace,
    private readonly caseId: string,
    private readonly caseDir: string,
  ) {
    super(workspace);
  }

  get outputPath(): string {
    return `${this.caseDir}/tech-report-summary.md`;
  }

  getTemplateVars(): Record<string, string> {
    return { CASE_DIR: this.caseDir };
  }

  async buildUserMessage(): Promise<string> {
    const techReportPath = `${this.caseDir}/tech-report.md`;
    let techReport = "";
    if (await this.workspace.fileExists(techReportPath)) {
      techReport = await this.workspace.readFile(techReportPath);
    }

    return `## Tech Report Review

**Case ID:** ${this.caseId}
**Date:** ${this.todayDate()}
**Output path:** ${this.caseDir}/tech-report-summary.md

### Tech Report Content

${techReport || "No tech report found — write a summary noting that no technical issues were reported."}`;
  }
}

export async function runTechReviewer(
  workspace: IWorkspace,
  caseId: string,
  caseDir: string,
  model: string,
): Promise<{ step: StepResult }> {
  return new TechReviewerAgent(workspace, caseId, caseDir).run(model);
}
