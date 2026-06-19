import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runAgent: (...args: any[]) => mockRunAgent(...args),
}));

vi.mock("../../io/loader.js", () => ({
  loadPromptTemplate: vi.fn().mockReturnValue("reporter prompt {{CASE_ID}} {{CASE_DIR}}"),
  fillVars: vi.fn((template: string, vars: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`),
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFileExists = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListThemeFiles = vi.fn();

vi.mock("../../io/workspace.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileExists: (...args: any[]) => mockFileExists(...args),
  readFile: vi.fn().mockResolvedValue(""),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listThemeFiles: (...args: any[]) => mockListThemeFiles(...args),
}));

import { ReporterAgent, runReporter } from "../reporter.js";

const MOCK_RESULT: AgentResult = {
  text: "report output",
  costUsd: 0.10,
  durationMs: 25000,
  numTurns: 6,
  sessionId: "reporter-session",
  tokenUsage: { inputTokens: 3000, outputTokens: 1500, cacheReadTokens: 600, cacheCreationTokens: 300 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
  mockFileExists.mockResolvedValue(true);
  mockListThemeFiles.mockResolvedValue(["theme-01-contracts.md", "theme-02-persons.md"]);
});

describe("ReporterAgent", () => {
  it("outputPath is caseDir/report.md", () => {
    const agent = new ReporterAgent("case-1", "investigations/case-1");
    expect(agent.outputPath).toBe("investigations/case-1/report.md");
  });

  it("enableMcp is false", () => {
    expect(new ReporterAgent("case-1", "investigations/case-1").enableMcp).toBe(false);
  });

  it("getTemplateVars returns CASE_ID and CASE_DIR", () => {
    const agent = new ReporterAgent("case-1", "investigations/case-1");
    expect(agent.getTemplateVars()).toEqual({
      CASE_ID: "case-1",
      CASE_DIR: "investigations/case-1",
    });
  });

  it("buildUserMessage lists theme files", async () => {
    const agent = new ReporterAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("- investigations/case-1/theme-01-contracts.md");
    expect(msg).toContain("- investigations/case-1/theme-02-persons.md");
  });

  it("buildUserMessage includes dossier and plan paths", async () => {
    const agent = new ReporterAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("investigations/case-1/dossier.md");
    expect(msg).toContain("investigations/case-1/plan.md");
  });

  it("buildUserMessage includes date", async () => {
    const agent = new ReporterAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("run succeeds when output file exists", async () => {
    const { step } = await new ReporterAgent("case-1", "investigations/case-1").run("sonnet");
    expect(step.success).toBe(true);
    expect(step.stepName).toBe("reporter");
  });

  it("run throws when output file missing", async () => {
    mockFileExists.mockResolvedValue(false);
    await expect(
      new ReporterAgent("case-1", "investigations/case-1").run("sonnet"),
    ).rejects.toThrow(/output file missing/);
  });

  it("runReporter wrapper produces same result", async () => {
    const { step } = await runReporter("case-1", "investigations/case-1", "sonnet");
    expect(step.stepName).toBe("reporter");
  });
});
