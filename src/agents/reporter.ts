import { FileOutputAgent } from "./base-agent.js";
import { listThemeFiles } from "../io/workspace.js";
import type { StepResult } from "../types.js";

export class ReporterAgent extends FileOutputAgent {
  readonly templateName = "reporter";
  readonly stepName = "reporter";
  readonly agentName = "reporter";

  constructor(
    private readonly caseId: string,
    private readonly caseDir: string,
  ) {
    super();
  }

  get outputPath(): string {
    return `${this.caseDir}/report.md`;
  }

  getTemplateVars(): Record<string, string> {
    return { CASE_ID: this.caseId, CASE_DIR: this.caseDir };
  }

  async buildUserMessage(): Promise<string> {
    const themeFiles = await listThemeFiles(this.caseDir);
    const themeFileList = themeFiles.map((f) => `- ${this.caseDir}/${f}`).join("\n");

    return `## Report Writing Assignment

**Case ID:** ${this.caseId}
**Date:** ${this.todayDate()}
**Report output path:** ${this.caseDir}/report.md

### Source documents to read (in order):

1. **Dossier:** ${this.caseDir}/dossier.md
2. **Plan:** ${this.caseDir}/plan.md
3. **Theme findings (read in order):**
${themeFileList}

Read all source documents first, then write the report incrementally:
- Use the Write tool for the first section (header + Executive Summary)
- Use the Edit tool to append each subsequent section

This ensures partial progress is saved even if something fails mid-way.`;
  }
}

export async function runReporter(
  caseId: string,
  caseDir: string,
  model: string,
): Promise<{ step: StepResult }> {
  return new ReporterAgent(caseId, caseDir).run(model);
}
