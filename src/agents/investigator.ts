import { FileOutputAgent } from "./base-agent.js";
import type { IWorkspace } from "../io/workspace.js";
import type { InvestigatorInputs, StepResult } from "../types.js";

export class InvestigatorAgent extends FileOutputAgent {
  readonly templateName = "investigator";
  override readonly enableMcp = true;

  constructor(
    workspace: IWorkspace,
    private readonly inputs: InvestigatorInputs,
  ) {
    super(workspace);
  }

  get stepName(): string {
    return `theme-${String(this.inputs.themeIndex).padStart(2, "0")}-${this.inputs.themeName}`;
  }

  get agentName(): string {
    return `investigator-${this.inputs.themeIndex}`;
  }

  get outputPath(): string {
    return this.inputs.outputPath;
  }

  getTemplateVars(): Record<string, string> {
    return { CASE_ID: this.inputs.caseId, CASE_DIR: this.inputs.caseDir };
  }

  buildUserMessage(): string {
    return `## Theme Investigation Assignment

**Case ID:** ${this.inputs.caseId}
**Date:** ${this.todayDate()}
**Theme index:** ${this.inputs.themeIndex}
**Theme name:** ${this.inputs.themeName}
**Output path:** ${this.inputs.outputPath}
**Dossier path:** ${this.inputs.dossierPath}
**Plan path:** ${this.inputs.planPath}
**Next theme index:** ${this.inputs.nextThemeIndex} ${this.inputs.nextThemeIndex === 0 ? "(you are the LAST theme)" : ""}

---

## Shared Dossier

${this.inputs.dossierContent}

---

## Theme Document: ${this.inputs.themeName}

Source: ${this.inputs.themeDocument}

${this.inputs.themeDocContent}

---

The dossier above contains summaries of all prior theme findings. If you need full details from a specific prior theme, use the Read tool on its file. Proceed directly to running theme-specific MCP queries and writing your findings.`;
  }
}

export async function runInvestigator(
  workspace: IWorkspace,
  inputs: InvestigatorInputs,
  model: string,
): Promise<{ step: StepResult }> {
  return new InvestigatorAgent(workspace, inputs).run(model);
}
