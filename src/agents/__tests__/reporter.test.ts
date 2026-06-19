import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";
import { MockWorkspace } from "../../io/mock-workspace.js";

const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  runAgent: (...args: any[]) => mockRunAgent(...args),
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

function makeWorkspace() {
  const ws = new MockWorkspace();
  ws.prompts.set("reporter", "reporter prompt {{CASE_ID}} {{CASE_DIR}}");
  return ws;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
});

describe("ReporterAgent", () => {
  it("outputPath is caseDir/report.md", () => {
    const agent = new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1");
    expect(agent.outputPath).toBe("investigations/case-1/report.md");
  });

  it("enableMcp is false", () => {
    expect(new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1").enableMcp).toBe(false);
  });

  it("getTemplateVars returns CASE_ID and CASE_DIR", () => {
    const agent = new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1");
    expect(agent.getTemplateVars()).toEqual({
      CASE_ID: "case-1",
      CASE_DIR: "investigations/case-1",
    });
  });

  it("buildUserMessage lists theme files", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/theme-01-contracts.md", "...");
    await ws.writeFile("investigations/case-1/theme-02-persons.md", "...");
    const agent = new ReporterAgent(ws, "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("- investigations/case-1/theme-01-contracts.md");
    expect(msg).toContain("- investigations/case-1/theme-02-persons.md");
  });

  it("buildUserMessage includes dossier and plan paths", async () => {
    const agent = new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toContain("investigations/case-1/dossier.md");
    expect(msg).toContain("investigations/case-1/plan.md");
  });

  it("buildUserMessage includes date", async () => {
    const agent = new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1");
    const msg = await agent.buildUserMessage();
    expect(msg).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it("run succeeds when output file exists", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/report.md", "report content");
    const { step } = await new ReporterAgent(ws, "case-1", "investigations/case-1").run("sonnet");
    expect(step.success).toBe(true);
    expect(step.stepName).toBe("reporter");
  });

  it("run throws when output file missing", async () => {
    await expect(
      new ReporterAgent(makeWorkspace(), "case-1", "investigations/case-1").run("sonnet"),
    ).rejects.toThrow(/output file missing/);
  });

  it("runReporter wrapper produces same result", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/report.md", "report content");
    const { step } = await runReporter(ws, "case-1", "investigations/case-1", "sonnet");
    expect(step.stepName).toBe("reporter");
  });
});
