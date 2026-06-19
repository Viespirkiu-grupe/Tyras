import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runAgent: (...args: any[]) => mockRunAgent(...args),
}));

vi.mock("../../io/loader.js", () => ({
  loadPromptTemplate: vi.fn().mockReturnValue("planner prompt {{CASE_ID}} {{CASE_DIR}}"),
  fillVars: vi.fn((template: string, vars: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`),
  ),
}));

vi.mock("../../io/workspace.js", () => ({
  fileExists: vi.fn().mockResolvedValue(true),
  readFile: vi.fn().mockResolvedValue(""),
  listThemeFiles: vi.fn().mockResolvedValue([]),
}));

import { PlannerAgent, runPlanner } from "../planner.js";

const VALID_HANDOFF = {
  caseId: "case-1",
  dossierPath: "investigations/case-1/dossier.md",
  planPath: "investigations/case-1/plan.md",
  themes: [
    { index: 1, name: "contracts", themeDocument: "docs/themes/contracts.md", outputPath: "investigations/case-1/theme-01-contracts.md", priority: "High" },
  ],
};

const VALID_HANDOFF_TEXT = "Some text\n```json\n" + JSON.stringify(VALID_HANDOFF, null, 2) + "\n```\nMore text";

const MOCK_RESULT: AgentResult = {
  text: VALID_HANDOFF_TEXT,
  costUsd: 0.12,
  durationMs: 30000,
  numTurns: 5,
  sessionId: "planner-session",
  tokenUsage: { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 500, cacheCreationTokens: 200 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
});

describe("PlannerAgent", () => {
  it("enableMcp is true", () => {
    expect(new PlannerAgent("prompt", "case-1").enableMcp).toBe(true);
  });

  it("getTemplateVars returns CASE_ID and computed CASE_DIR", () => {
    const agent = new PlannerAgent("prompt", "case-1");
    expect(agent.getTemplateVars()).toEqual({
      CASE_ID: "case-1",
      CASE_DIR: "investigations/case-1",
    });
  });

  it("buildUserMessage includes caseId, date, and casePrompt", () => {
    const agent = new PlannerAgent("Investigate company X", "case-1");
    const msg = agent.buildUserMessage();
    expect(msg).toContain("**Case ID:** case-1");
    expect(msg).toContain("Investigate company X");
    expect(msg).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("buildUserMessage includes instruction to read theme index", () => {
    const agent = new PlannerAgent("prompt", "case-1");
    const msg = agent.buildUserMessage();
    expect(msg).toContain("docs/index/mcp-investigator-prompt.md");
  });

  it("run returns handoff and step on success", async () => {
    const result = await new PlannerAgent("prompt", "case-1").run("sonnet");
    expect(result.handoff.caseId).toBe("case-1");
    expect(result.handoff.themes).toHaveLength(1);
    expect(result.step.stepName).toBe("planner");
    expect(result.step.success).toBe(true);
  });

  it("run throws when handoff parsing fails", async () => {
    mockRunAgent.mockResolvedValue({ ...MOCK_RESULT, text: "no json here" });
    await expect(new PlannerAgent("prompt", "case-1").run("sonnet")).rejects.toThrow(
      "Planner did not return a valid handoff JSON block",
    );
  });

  it("runPlanner wrapper produces same result", async () => {
    const result = await runPlanner("prompt", "case-1", "sonnet");
    expect(result.handoff.caseId).toBe("case-1");
    expect(result.step.stepName).toBe("planner");
  });
});

describe("PlannerAgent.parseHandoff", () => {
  it("extracts valid JSON from markdown code block", () => {
    const result = PlannerAgent.parseHandoff(VALID_HANDOFF_TEXT);
    expect(result).toEqual(VALID_HANDOFF);
  });

  it("returns null for missing code block", () => {
    expect(PlannerAgent.parseHandoff("no code block")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(PlannerAgent.parseHandoff("```json\n{invalid}\n```")).toBeNull();
  });

  it("returns null when caseId is missing", () => {
    const text = '```json\n{"themes": []}\n```';
    expect(PlannerAgent.parseHandoff(text)).toBeNull();
  });

  it("returns null when themes is not an array", () => {
    const text = '```json\n{"caseId": "c-1", "themes": "not-array"}\n```';
    expect(PlannerAgent.parseHandoff(text)).toBeNull();
  });
});
