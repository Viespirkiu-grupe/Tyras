import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "../../agent-loop.js";
import { MockWorkspace } from "../../io/mock-workspace.js";

const mockRunAgent = vi.fn();

vi.mock("../../agent-loop.js", () => ({
  runAgent: (...args: any[]) => mockRunAgent(...args),
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

function makeWorkspace() {
  const ws = new MockWorkspace();
  ws.prompts.set("test", "System {{CASE_ID}} {{CASE_DIR}}");
  return ws;
}

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
});

describe("BaseAgent", () => {
  it("passes correct AgentOptions to runAgent", async () => {
    const agent = new TestAgent(makeWorkspace());
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
    const agent = new TestAgent(makeWorkspace());
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

    const agent = new FailingAgent(makeWorkspace());
    await expect(agent.run("sonnet")).rejects.toThrow("validation failed");
  });

  it("todayDate returns YYYY-MM-DD format", () => {
    const agent = new TestAgent(makeWorkspace());
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
    expect(new NoMcpAgent(makeWorkspace()).enableMcp).toBe(false);
  });

  it("buildSystemPrompt uses fillVars with template vars", () => {
    const agent = new TestAgent(makeWorkspace());
    const prompt = agent.buildSystemPrompt();
    expect(prompt).toBe("System c-1 investigations/c-1");
  });
});

describe("FileOutputAgent", () => {
  it("passes when output file exists", async () => {
    const ws = makeWorkspace();
    await ws.writeFile("investigations/c-1/output.md", "content");
    const agent = new TestFileAgent(ws);
    const { step } = await agent.run("sonnet");
    expect(step.success).toBe(true);
  });

  it("throws with descriptive error when output file missing", async () => {
    const agent = new TestFileAgent(makeWorkspace());

    await expect(agent.run("sonnet")).rejects.toThrow(
      /file-agent finished \(3 turns, .+\) but output file missing: investigations\/c-1\/output\.md/,
    );
  });
});
