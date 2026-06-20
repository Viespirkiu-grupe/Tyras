import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockWorkspace } from "../io/mock-workspace.js";
import type { InvestigationState, StepResult, PlannerHandoff } from "../types.js";

const mockRunPlanner = vi.fn();
const mockRunInvestigator = vi.fn();
const mockRunReporter = vi.fn();
const mockRunTechReviewer = vi.fn();
const mockPreflightMcp = vi.fn();
const mockProbeQuota = vi.fn();

vi.mock("../agents/planner.js", () => ({
  runPlanner: (...args: any[]) => mockRunPlanner(...args),
}));

vi.mock("../agents/investigator.js", () => ({
  runInvestigator: (...args: any[]) => mockRunInvestigator(...args),
}));

vi.mock("../agents/reporter.js", () => ({
  runReporter: (...args: any[]) => mockRunReporter(...args),
}));

vi.mock("../agents/tech-reviewer.js", () => ({
  runTechReviewer: (...args: any[]) => mockRunTechReviewer(...args),
}));

vi.mock("../agent-loop.js", () => ({
  preflightMcp: (...args: any[]) => mockPreflightMcp(...args),
  probeQuota: (...args: any[]) => mockProbeQuota(...args),
  QuotaExhaustedError: class QuotaExhaustedError extends Error {
    numTurns: number;
    durationMs: number;
    stderr: string;
    constructor(name: string, turns: number, dur: number, stderr: string) {
      super(`[${name}] quota exhausted`);
      this.name = "QuotaExhaustedError";
      this.numTurns = turns;
      this.durationMs = dur;
      this.stderr = stderr;
    }
  },
  parseResetTime: vi.fn().mockReturnValue(null),
}));

vi.mock("../io/logger.js", () => ({
  initLogger: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { investigate, recordStep, printSummary, withRetry } from "../orchestrator.js";

const HANDOFF: PlannerHandoff = {
  caseId: "test-case",
  dossierPath: "investigations/test-case/dossier.md",
  planPath: "investigations/test-case/plan.md",
  themes: [
    { index: 1, name: "contracts", themeDocument: "docs/themes/01.md", outputPath: "investigations/test-case/theme-01-contracts.md", priority: "High" },
    { index: 2, name: "persons", themeDocument: "docs/themes/02.md", outputPath: "investigations/test-case/theme-02-persons.md", priority: "Medium" },
  ],
};

function makeStep(overrides: Partial<StepResult> = {}): StepResult {
  return {
    stepName: "test-step",
    durationMs: 10000,
    duration: "10s",
    costUsd: 0.05,
    success: true,
    retries: 0,
    numTurns: 3,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreationTokens: 100 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreflightMcp.mockResolvedValue(undefined);
  mockProbeQuota.mockResolvedValue({ available: true, retryAfterMs: null, stderr: "" });
  mockRunPlanner.mockResolvedValue({ handoff: HANDOFF, step: makeStep({ stepName: "planner" }) });
  mockRunInvestigator.mockResolvedValue({ step: makeStep({ stepName: "investigator" }) });
  mockRunReporter.mockResolvedValue({ step: makeStep({ stepName: "reporter" }) });
  mockRunTechReviewer.mockResolvedValue({ step: makeStep({ stepName: "tech-reviewer" }) });
});

describe("investigate", () => {
  it("creates case.md template when file does not exist", async () => {
    const ws = new MockWorkspace();
    await investigate("new-case", ws);

    expect(ws.files.has("investigations/new-case/case.md")).toBe(true);
    const content = ws.files.get("investigations/new-case/case.md")!;
    expect(content).toContain("Describe the case here");
    expect(mockPreflightMcp).not.toHaveBeenCalled();
  });

  it("does not run pipeline when case.md is template (no saved state)", async () => {
    const ws = new MockWorkspace();
    await investigate("new-case", ws);
    expect(mockRunPlanner).not.toHaveBeenCalled();
  });

  it("runs full pipeline when case.md exists and state is saved (resume)", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");
    await ws.writeFile("investigations/test-case/dossier.md", "dossier");
    await ws.writeFile("docs/themes/01.md", "theme 1");
    await ws.writeFile("docs/themes/02.md", "theme 2");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    expect(mockPreflightMcp).toHaveBeenCalled();
    expect(mockRunPlanner).toHaveBeenCalled();
    expect(mockRunInvestigator).toHaveBeenCalledTimes(2);
    expect(mockRunReporter).toHaveBeenCalled();
    expect(mockRunTechReviewer).toHaveBeenCalled();
  });

  it("resumes from investigating phase with completed themes", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");
    await ws.writeFile("investigations/test-case/dossier.md", "dossier");
    await ws.writeFile("docs/themes/01.md", "theme 1");
    await ws.writeFile("docs/themes/02.md", "theme 2");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "investigating",
      plan: HANDOFF,
      completedThemes: [1],
      steps: [makeStep({ stepName: "planner" }), makeStep({ stepName: "theme-01" })],
      totalCostUsd: 0.10,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    expect(mockRunPlanner).not.toHaveBeenCalled();
    expect(mockRunInvestigator).toHaveBeenCalledTimes(1);
    expect(mockRunReporter).toHaveBeenCalled();
    expect(mockRunTechReviewer).toHaveBeenCalled();
  });

  it("resumes from reporting phase", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "reporting",
      plan: HANDOFF,
      completedThemes: [1, 2],
      steps: [],
      totalCostUsd: 0.20,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    expect(mockRunPlanner).not.toHaveBeenCalled();
    expect(mockRunInvestigator).not.toHaveBeenCalled();
    expect(mockRunReporter).toHaveBeenCalled();
    expect(mockRunTechReviewer).toHaveBeenCalled();
  });

  it("resumes from tech-review phase", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "tech-review",
      plan: HANDOFF,
      completedThemes: [1, 2],
      steps: [],
      totalCostUsd: 0.30,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    expect(mockRunPlanner).not.toHaveBeenCalled();
    expect(mockRunInvestigator).not.toHaveBeenCalled();
    expect(mockRunReporter).not.toHaveBeenCalled();
    expect(mockRunTechReviewer).toHaveBeenCalled();
  });

  it("passes workspace to agent runners", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");
    await ws.writeFile("investigations/test-case/dossier.md", "dossier");
    await ws.writeFile("docs/themes/01.md", "theme 1");
    await ws.writeFile("docs/themes/02.md", "theme 2");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    expect(mockRunPlanner.mock.calls[0][0]).toBe(ws);
    expect(mockRunInvestigator.mock.calls[0][0]).toBe(ws);
    expect(mockRunReporter.mock.calls[0][0]).toBe(ws);
    expect(mockRunTechReviewer.mock.calls[0][0]).toBe(ws);
  });

  it("saves state after each phase transition", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");
    await ws.writeFile("investigations/test-case/dossier.md", "dossier");
    await ws.writeFile("docs/themes/01.md", "theme 1");
    await ws.writeFile("docs/themes/02.md", "theme 2");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);

    const finalState = await ws.loadState("investigations/test-case") as InvestigationState;
    expect(finalState.status).toBe("complete");
    expect(finalState.completedThemes).toEqual([1, 2]);
  });

  it("preflightMcp is called before pipeline", async () => {
    const ws = new MockWorkspace();
    await ws.writeFile("investigations/test-case/case.md", "Investigate fraud");
    await ws.writeFile("investigations/test-case/dossier.md", "dossier");
    await ws.writeFile("docs/themes/01.md", "theme 1");
    await ws.writeFile("docs/themes/02.md", "theme 2");

    const savedState: InvestigationState = {
      caseId: "test-case",
      caseDir: "investigations/test-case",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };
    await ws.saveState("investigations/test-case", savedState);

    await investigate("test-case", ws);
    expect(mockPreflightMcp).toHaveBeenCalledTimes(1);
  });
});

describe("recordStep", () => {
  it("pushes step to state.steps and adds cost", () => {
    const state: InvestigationState = {
      caseId: "c-1",
      caseDir: "investigations/c-1",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };

    const step = makeStep({ costUsd: 0.12 });
    recordStep(state, step);

    expect(state.steps).toHaveLength(1);
    expect(state.totalCostUsd).toBeCloseTo(0.12);
  });

  it("accumulates cost across multiple steps", () => {
    const state: InvestigationState = {
      caseId: "c-1",
      caseDir: "investigations/c-1",
      status: "planning",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };

    recordStep(state, makeStep({ costUsd: 0.10 }));
    recordStep(state, makeStep({ costUsd: 0.20 }));
    recordStep(state, makeStep({ costUsd: 0.05 }));

    expect(state.steps).toHaveLength(3);
    expect(state.totalCostUsd).toBeCloseTo(0.35);
  });
});

describe("printSummary", () => {
  it("does not throw for empty steps", () => {
    const state: InvestigationState = {
      caseId: "c-1",
      caseDir: "investigations/c-1",
      status: "complete",
      completedThemes: [],
      steps: [],
      totalCostUsd: 0,
      startTime: Date.now(),
      startDateTime: "2026-06-19 10:00:00",
    };

    expect(() => printSummary(state)).not.toThrow();
  });

  it("does not throw with mixed success/failure steps", () => {
    const state: InvestigationState = {
      caseId: "c-1",
      caseDir: "investigations/c-1",
      status: "complete",
      completedThemes: [1],
      steps: [
        makeStep({ stepName: "planner", success: true }),
        makeStep({ stepName: "theme-01", success: false, error: "timeout" }),
      ],
      totalCostUsd: 0.15,
      startTime: Date.now() - 60000,
      startDateTime: "2026-06-19 10:00:00",
    };

    expect(() => printSummary(state)).not.toThrow();
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry("test", async () => 42);
    expect(result).toBe(42);
  });

  it("retries on non-quota errors up to maxRetries", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    };

    const promise = withRetry("test", fn);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await promise;
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it("throws after maxRetries exhausted", async () => {
    vi.useFakeTimers();
    const fn = async () => { throw new Error("always fails"); };
    const promise = withRetry("test", fn).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("always fails");
    vi.useRealTimers();
  });

  it("quota errors do not consume regular retry budget", async () => {
    vi.useFakeTimers();
    const { QuotaExhaustedError: MockQEE } = await import("../agent-loop.js");
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw new MockQEE("test", 0, 0, "");
      if (calls <= 3) throw new Error("transient");
      return "ok";
    };

    mockProbeQuota.mockResolvedValue({ available: true, retryAfterMs: null, stderr: "" });

    const promise = withRetry("test", fn);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
    expect(calls).toBe(4);
    vi.useRealTimers();
  });
});
