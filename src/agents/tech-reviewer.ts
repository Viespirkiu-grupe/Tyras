import { FileOutputAgent } from "./base-agent.js";
import { readFile, fileExists } from "../io/workspace.js";
import type { StepResult } from "../types.js";

export class TechReviewerAgent extends FileOutputAgent {
  readonly templateName = "tech-reviewer";
  readonly stepName = "tech-reviewer";
  readonly agentName = "tech-reviewer";

  constructor(
    private readonly caseId: string,
    private readonly caseDir: string,
  ) {
    super();
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
    if (await fileExists(techReportPath)) {
      techReport = await readFile(techReportPath);
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
  caseId: string,
  caseDir: string,
  model: string,
): Promise<{ step: StepResult }> {
  return new TechReviewerAgent(caseId, caseDir).run(model);
}
