import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runAgent: (...args: any[]) => mockRunAgent(...args),
}));

vi.mock("../../io/loader.js", () => ({
  loadPromptTemplate: vi.fn().mockReturnValue("tech-reviewer prompt {{CASE_DIR}}"),
  fillVars: vi.fn((template: string, vars: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`),
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFileExists = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadFile = vi.fn();

vi.mock("../../io/workspace.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileExists: (...args: any[]) => mockFileExists(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readFile: (...args: any[]) => mockReadFile(...args),
  listThemeFiles: vi.fn().mockResolvedValue([]),
}));

import { TechReviewerAgent, runTechReviewer } from "../tech-reviewer.js";

const MOCK_RESULT: AgentResult = {
  text: "tech review output",
  costUsd: 0.04,
  durationMs: 15000,
  numTurns: 2,
  sessionId: "tr-session",
  tokenUsage: { inputTokens: 800, outputTokens: 400, cacheReadTokens: 100, cacheCreationTokens: 50 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
  mockFileExists.mockResolvedValue(true);
  mockReadFile.mockResolvedValue("existing tech report content");
});

describe("TechReviewerAgent", () => {
  it("outputPath is caseDir/tech-report-summary.md", () => {
    const agent = new TechReviewerAgent("case-1", "investigations/case-1");
    expect(agent.outputPath).toBe("investigations/case-1/tech-report-summary.md");
  });

  it("enableMcp is false", () => {
    expect(new TechReviewerAgent("case-1", "investigations/case-1").enableMcp).toBe(false);
  });

  it("getTemplateVars returns CASE_DIR only (no CASE_ID)", () => {
    const agent = new TechReviewerAgent("case-1", "investigations/case-1");
    expect(agent.getTemplateVars()).toEqual({ CASE_DIR: "investigations/case-1" });
    expect(agent.getTemplateVars()).not.toHaveProperty("CASE_ID");
  });

  it("buildUserMessage includes tech-report content when file exists", async () => {
    const agent = new TechReviewerAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("existing tech report content");
    expect(msg).not.toContain("No tech report found");
  });

  it("buildUserMessage uses fallback text when tech-report.md missing", async () => {
    mockFileExists.mockResolvedValue(false);
    const agent = new TechReviewerAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("No tech report found");
  });

  it("buildUserMessage includes date and case ID", async () => {
    const agent = new TechReviewerAgent("case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("**Case ID:** case-1");
    expect(msg).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("run succeeds when output file exists", async () => {
    const { step } = await new TechReviewerAgent("case-1", "investigations/case-1").run("sonnet");
    expect(step.success).toBe(true);
    expect(step.stepName).toBe("tech-reviewer");
  });

  it("run throws when output file missing", async () => {
    mockFileExists.mockImplementation(async (...args: unknown[]) => {
      const path = args[0] as string;
      if (path.endsWith("tech-report-summary.md")) return false;
      return true;
    });
    await expect(
      new TechReviewerAgent("case-1", "investigations/case-1").run("sonnet"),
    ).rejects.toThrow(/output file missing/);
  });

  it("runTechReviewer wrapper produces same result", async () => {
    const { step } = await runTechReviewer("case-1", "investigations/case-1", "sonnet");
    expect(step.stepName).toBe("tech-reviewer");
  });
});
