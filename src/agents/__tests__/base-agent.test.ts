import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runAgent: (...args: any[]) => mockRunAgent(...args),
}));

vi.mock("../../io/loader.js", () => ({
  loadPromptTemplate: vi.fn().mockReturnValue("System {{CASE_ID}} {{CASE_DIR}}"),
  fillVars: vi.fn((template: string, vars: Record<string, string>) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`),
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFileExists = vi.fn();

vi.mock("../../io/workspace.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileExists: (...args: any[]) => mockFileExists(...args),
  readFile: vi.fn().mockResolvedValue(""),
  listThemeFiles: vi.fn().mockResolvedValue([]),
}));

import { BaseAgent, FileOutputAgent } from "../base-agent.js";
import type { StepResult } from "../../types.js";

const MOCK_RESULT: AgentResult = {
  text: "agent output",
  costUsd: 0.05,
  durationMs: 12345,
  numTurns: 3,
  sessionId: "test-session",
  tokenUsage: {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreationTokens: 100,
  },
};

class TestAgent extends BaseAgent {
  readonly templateName = "test";
  readonly stepName = "test-step";
  readonly agentName = "test-agent";
  override readonly enableMcp = true;

  getTemplateVars() {
    return { CASE_ID: "c-1", CASE_DIR: "investigations/c-1" };
  }
  buildUserMessage() {
    return "test message";
  }
}

class TestFileAgent extends FileOutputAgent {
  readonly templateName = "test";
  readonly stepName = "file-step";
  readonly agentName = "file-agent";
  readonly outputPath = "investigations/c-1/output.md";

  getTemplateVars() {
    return { CASE_ID: "c-1", CASE_DIR: "investigations/c-1" };
  }
  buildUserMessage() {
    return "file agent message";
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRunAgent.mockResolvedValue(MOCK_RESULT);
  mockFileExists.mockResolvedValue(true);
});

describe("BaseAgent", () => {
  it("passes correct AgentOptions to runAgent", async () => {
    const agent = new TestAgent();
    await agent.run("sonnet");

    expect(mockRunAgent).toHaveBeenCalledWith({
      systemPrompt: "System c-1 investigations/c-1",
      userMessage: "test message",
      model: "sonnet",
      agentName: "test-agent",
      enableMcp: true,
    });
  });

  it("builds correct StepResult from AgentResult", async () => {
    const agent = new TestAgent();
    const { step } = await agent.run("sonnet");

    expect(step).toEqual({
      stepName: "test-step",
      durationMs: 12345,
      duration: expect.any(String),
      costUsd: 0.05,
      success: true,
      retries: 0,
      numTurns: 3,
      tokenUsage: MOCK_RESULT.tokenUsage,
    });
  });

  it("propagates validateOutput errors", async () => {
    class FailingAgent extends TestAgent {
      protected override async validateOutput(): Promise<void> {
        throw new Error("validation failed");
      }
    }

    const agent = new FailingAgent();
    await expect(agent.run("sonnet")).rejects.toThrow("validation failed");
  });

  it("todayDate returns YYYY-MM-DD format", () => {
    const agent = new TestAgent();
    const date = agent["todayDate"]();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("enableMcp defaults to false", () => {
    class NoMcpAgent extends BaseAgent {
      readonly templateName = "test";
      readonly stepName = "s";
      readonly agentName = "a";
      getTemplateVars() { return {}; }
      buildUserMessage() { return ""; }
    }
    expect(new NoMcpAgent().enableMcp).toBe(false);
  });

  it("buildSystemPrompt uses fillVars with template vars", () => {
    const agent = new TestAgent();
    const prompt = agent.buildSystemPrompt();
    expect(prompt).toBe("System c-1 investigations/c-1");
  });
});

describe("FileOutputAgent", () => {
  it("passes when output file exists", async () => {
    mockFileExists.mockResolvedValue(true);
    const agent = new TestFileAgent();
    const { step } = await agent.run("sonnet");
    expect(step.success).toBe(true);
  });

  it("throws with descriptive error when output file missing", async () => {
    mockFileExists.mockResolvedValue(false);
    const agent = new TestFileAgent();

    await expect(agent.run("sonnet")).rejects.toThrow(
      /file-agent finished \(3 turns, .+\) but output file missing: investigations\/c-1\/output\.md/,
    );
  });
});
