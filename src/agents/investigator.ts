import { FileOutputAgent } from "./base-agent.js";
import type { InvestigatorInputs, StepResult } from "../types.js";

export class InvestigatorAgent extends FileOutputAgent {
  readonly templateName = "investigator";
  override readonly enableMcp = true;

  constructor(private readonly inputs: InvestigatorInputs) {
    super();
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
    const priorFindingsBlock =
      this.inputs.priorFindings.length > 0
        ? this.inputs.priorFindings
            .map((f) => `### Prior findings: ${f.path}\n\n${f.content}`)
            .join("\n\n---\n\n")
        : "(no prior theme findings yet — you are the first theme)";

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

## Prior Theme Findings

${priorFindingsBlock}

---

## Theme Document: ${this.inputs.themeName}

Source: ${this.inputs.themeDocument}

${this.inputs.themeDocContent}

---

All context is provided above. Do NOT re-read these files. Proceed directly to running theme-specific MCP queries and writing your findings.`;
  }
}

export async function runInvestigator(
  inputs: InvestigatorInputs,
  model: string,
): Promise<{ step: StepResult }> {
  return new InvestigatorAgent(inputs).run(model);
}
