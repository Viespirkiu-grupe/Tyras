export interface ThemeEntry {
  index: number;
  name: string;
  themeDocument: string;
  outputPath: string;
  priority: "High" | "Medium" | "Low";
}

export interface PlannerHandoff {
  caseId: string;
  dossierPath: string;
  planPath: string;
  themes: ThemeEntry[];
}

export interface InvestigatorInputs {
  caseId: string;
  caseDir: string;
  dossierPath: string;
  planPath: string;
  themeIndex: number;
  themeName: string;
  themeDocument: string;
  outputPath: string;
  nextThemeIndex: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface StepResult {
  stepName: string;
  durationMs: number;
  costUsd: number;
  success: boolean;
  error?: string;
  retries: number;
  numTurns: number;
}

// @TODO: investigation state must be stored when updated to resume from the hard fail. You can store it in investigations/<investigation>/investigation-state.json if that makes sense, or decide better
export interface InvestigationState {
  caseId: string;
  caseDir: string;
  status: "planning" | "investigating" | "reporting" | "complete" | "failed";
  plan?: PlannerHandoff;
  completedThemes: number[];
  steps: StepResult[];
  totalCostUsd: number;
  startTime: number;
}

// @TODO:
//  I just added tech-reviewer.md that is the very final agent that summerizes tech report - this agent does not need any context - just tech report!
//  Maybe you can even pass it to promot to save agent back and forth reading call? Do what is the best