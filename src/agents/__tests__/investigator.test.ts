import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";
import type { InvestigatorInputs } from "../../types.js";
import { MockWorkspace } from "../../io/mock-workspace.js";

const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  runAgent: (...args: any[]) => mockRunAgent(...args),
}));

import { InvestigatorAgent, runInvestigator } from "../investigator.js";

function makeWorkspace() {
  const ws = new MockWorkspace();
  ws.prompts.set("investigator", "investigator prompt {{CASE_ID}} {{CASE_DIR}}");
  return ws;
}

function makeInputs(overrides: Partial<InvestigatorInputs> = {}): InvestigatorInputs {
  return {
    caseId: "case-1",
    caseDir: "investigations/case-1",
    dossierPath: "investigations/case-1/dossier.md",
    planPath: "investigations/case-1/plan.md",
    themeIndex: 3,
    themeName: "contracts",
    themeDocument: "docs/themes/contracts.md",
    outputPath: "investigations/case-1/theme-03-contracts.md",
    nextThemeIndex: 4,
    dossierContent: "Dossier content here",
    themeDocContent: "Theme doc content",
    ...overrides,
  };
}

const MOCK_RESULT: AgentResult = {
  text: "investigator output",
  costUsd: 0.08,
  durationMs: 20000,
  numTurns: 4,
  sessionId: "inv-session",
  tokenUsage: { inputTokens: 1500, outputTokens: 800, cacheReadTokens: 300, cacheCreationTokens: 150 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
});

describe("InvestigatorAgent", () => {
  it("stepName is dynamic: theme-03-contracts format", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs());
    expect(agent.stepName).toBe("theme-03-contracts");
  });

  it("stepName pads single-digit index", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs({ themeIndex: 1 }));
    expect(agent.stepName).toBe("theme-01-contracts");
  });

  it("agentName is dynamic: investigator-3 format", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs());
    expect(agent.agentName).toBe("investigator-3");
  });

  it("enableMcp is true", () => {
    expect(new InvestigatorAgent(makeWorkspace(), makeInputs()).enableMcp).toBe(true);
  });

  it("getTemplateVars returns CASE_ID and CASE_DIR from inputs", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs());
    expect(agent.getTemplateVars()).toEqual({
      CASE_ID: "case-1",
      CASE_DIR: "investigations/case-1",
    });
  });

  it("buildUserMessage includes dossier content as shared context", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs({ dossierContent: "Entity summary here" }));
    const msg = agent.buildUserMessage();
    expect(msg).toContain("## Shared Dossier");
    expect(msg).toContain("Entity summary here");
  });

  it("buildUserMessage instructs to use Read for prior theme details", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs());
    const msg = agent.buildUserMessage();
    expect(msg).toContain("use the Read tool");
  });

  it("buildUserMessage marks last theme when nextThemeIndex is 0", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs({ nextThemeIndex: 0 }));
    const msg = agent.buildUserMessage();
    expect(msg).toContain("(you are the LAST theme)");
  });

  it("buildUserMessage does not mark last theme for non-zero nextThemeIndex", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs({ nextThemeIndex: 4 }));
    const msg = agent.buildUserMessage();
    expect(msg).not.toContain("(you are the LAST theme)");
  });

  it("outputPath comes from inputs", () => {
    const agent = new InvestigatorAgent(makeWorkspace(), makeInputs());
    expect(agent.outputPath).toBe("investigations/case-1/theme-03-contracts.md");
  });

  it("run succeeds when output file exists", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/theme-03-contracts.md", "findings");
    const { step } = await new InvestigatorAgent(ws, makeInputs()).run("sonnet");
    expect(step.success).toBe(true);
    expect(step.stepName).toBe("theme-03-contracts");
  });

  it("run throws when output file missing", async () => {
    await expect(new InvestigatorAgent(makeWorkspace(), makeInputs()).run("sonnet")).rejects.toThrow(
      /output file missing/,
    );
  });

  it("runInvestigator wrapper produces same result", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/case-1/theme-03-contracts.md", "findings");
    const { step } = await runInvestigator(ws, makeInputs(), "sonnet");
    expect(step.stepName).toBe("theme-03-contracts");
  });
});
