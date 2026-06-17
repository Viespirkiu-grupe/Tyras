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

export interface InvestigationState {
  caseId: string;
  caseDir: string;
  status: "planning" | "investigating" | "reporting" | "tech-review" | "complete" | "failed";
  plan?: PlannerHandoff;
  completedThemes: number[];
  steps: StepResult[];
  totalCostUsd: number;
  startTime: number;
}
