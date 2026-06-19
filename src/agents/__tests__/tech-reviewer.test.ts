import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";
import { MockWorkspace } from "../../io/mock-workspace.js";

const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  runAgent: (...args: any[]) => mockRunAgent(...args),
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

function makeWorkspace() {
  const ws = new MockWorkspace();
  ws.prompts.set("tech-reviewer", "tech-reviewer prompt {{CASE_DIR}}");
  return ws;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
});

describe("TechReviewerAgent", () => {
  it("outputPath is caseDir/tech-report-summary.md", () => {
    const agent = new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1");
    expect(agent.outputPath).toBe("investigations/case-1/tech-report-summary.md");
  });

  it("enableMcp is false", () => {
    expect(new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1").enableMcp).toBe(false);
  });

  it("getTemplateVars returns CASE_DIR only (no CASE_ID)", () => {
    const agent = new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1");
    expect(agent.getTemplateVars()).toEqual({ CASE_DIR: "investigations/case-1" });
    expect(agent.getTemplateVars()).not.toHaveProperty("CASE_ID");
  });

  it("buildUserMessage includes tech-report content when file exists", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/tech-report.md", "existing tech report content");
    const agent = new TechReviewerAgent(ws, "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("existing tech report content");
    expect(msg).not.toContain("No tech report found");
  });

  it("buildUserMessage uses fallback text when tech-report.md missing", async () => {
    const agent = new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("No tech report found");
  });

  it("buildUserMessage includes date and case ID", async () => {
    const agent = new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("**Case ID:** case-1");
    expect(msg).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("run succeeds when output file exists", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/tech-report-summary.md", "summary");
    const { step } = await new TechReviewerAgent(ws, "case-1", "investigations/case-1").run("sonnet");
    expect(step.success).toBe(true);
    expect(step.stepName).toBe("tech-reviewer");
  });

  it("run throws when output file missing", async () => {
    await expect(
      new TechReviewerAgent(makeWorkspace(), "case-1", "investigations/case-1").run("sonnet"),
    ).rejects.toThrow(/output file missing/);
  });

  it("runTechReviewer wrapper produces same result", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/tech-report-summary.md", "summary");
    const { step } = await runTechReviewer(ws, "case-1", "investigations/case-1", "sonnet");
    expect(step.stepName).toBe("tech-reviewer");
  });
});
