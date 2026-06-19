import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { parseResetTime, QuotaExhaustedError, probeQuota } from "../agent-loop.js";

function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.kill = vi.fn();
  return proc;
}

let spawnMock: ReturnType<typeof vi.fn>;

vi.mock("child_process", () => ({
  spawn: (...args: any[]) => spawnMock(...args),
  execSync: vi.fn(),
}));

beforeEach(() => {
  spawnMock = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseResetTime", () => {
  it("returns null for empty string", () => {
    expect(parseResetTime("")).toBeNull();
  });

  it("returns null for unrelated stderr", () => {
    expect(parseResetTime("some random error output")).toBeNull();
  });

  it("parses retry-after in seconds", () => {
    expect(parseResetTime("Retry-After: 120")).toBe(120_000);
  });

  it("parses retry after with dash separator", () => {
    expect(parseResetTime("retry-after: 60")).toBe(60_000);
  });

  it("parses retry after with space separator", () => {
    expect(parseResetTime("retry after 30")).toBe(30_000);
  });

  it("parses reset in seconds", () => {
    expect(parseResetTime("resets in 45 seconds")).toBe(45_000);
  });

  it("parses reset in minutes", () => {
    expect(parseResetTime("resets in 5 minutes")).toBe(300_000);
  });

  it("parses reset in hours", () => {
    expect(parseResetTime("resets in 2 hours")).toBe(7_200_000);
  });

  it("parses abbreviated time units (s)", () => {
    expect(parseResetTime("reset in 90 s")).toBe(90_000);
  });

  it("parses abbreviated time units (m)", () => {
    expect(parseResetTime("reset in 10 m")).toBe(600_000);
  });

  it("parses abbreviated time units (h)", () => {
    expect(parseResetTime("reset in 1 h")).toBe(3_600_000);
  });

  it("returns null for zero retry-after", () => {
    expect(parseResetTime("Retry-After: 0")).toBeNull();
  });

  it("returns null for unreasonably large retry-after (>= 86400)", () => {
    expect(parseResetTime("Retry-After: 86400")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseResetTime("RETRY-AFTER: 60")).toBe(60_000);
    expect(parseResetTime("RESETS IN 5 MINUTES")).toBe(300_000);
  });

  it("prefers retry-after over reset-in when both present", () => {
    const stderr = "Retry-After: 30\nresets in 5 minutes";
    expect(parseResetTime(stderr)).toBe(30_000);
  });

  it("parses reset in sec", () => {
    expect(parseResetTime("reset in 45 sec")).toBe(45_000);
  });

  it("parses reset in min", () => {
    expect(parseResetTime("reset in 10 min")).toBe(600_000);
  });
});

describe("QuotaExhaustedError", () => {
  it("has correct name and properties", () => {
    const err = new QuotaExhaustedError("planner", 1, 3000, "rate limited");
    expect(err.name).toBe("QuotaExhaustedError");
    expect(err.numTurns).toBe(1);
    expect(err.durationMs).toBe(3000);
    expect(err.stderr).toBe("rate limited");
    expect(err instanceof Error).toBe(true);
  });

  it("includes agent name in message", () => {
    const err = new QuotaExhaustedError("investigator-3", 1, 2000, "");
    expect(err.message).toContain("investigator-3");
  });

  it("includes stderr hint when non-empty", () => {
    const err = new QuotaExhaustedError("planner", 1, 3000, "rate limit exceeded");
    expect(err.message).toContain("rate limit exceeded");
  });

  it("truncates long stderr to 300 chars", () => {
    const longStderr = "x".repeat(500);
    const err = new QuotaExhaustedError("planner", 1, 3000, longStderr);
    expect(err.message.length).toBeLessThan(longStderr.length);
  });
});

describe("probeQuota", () => {
  it("reports available when probe succeeds with fast response (the bug fix)", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stdout.emit("data", Buffer.from(JSON.stringify({
      num_turns: 1,
      duration_ms: 1500,
      result: "OK",
    })));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(true);
    expect(result.retryAfterMs).toBeNull();
  });

  it("reports available when probe takes longer than 5s", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stdout.emit("data", Buffer.from(JSON.stringify({
      num_turns: 1,
      duration_ms: 8000,
      result: "OK",
    })));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(true);
  });

  it("reports unavailable when turns is 0", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stdout.emit("data", Buffer.from(JSON.stringify({
      num_turns: 0,
      duration_ms: 100,
    })));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(false);
  });

  it("reports unavailable on non-zero exit code", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stderr.emit("data", Buffer.from("rate limited"));
    proc.emit("close", 1);

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.stderr).toContain("rate limited");
  });

  it("parses retryAfterMs from stderr on failure", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stderr.emit("data", Buffer.from("Retry-After: 120"));
    proc.emit("close", 1);

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.retryAfterMs).toBe(120_000);
  });

  it("reports unavailable on non-JSON output", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stdout.emit("data", Buffer.from("not json at all"));
    proc.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(false);
  });

  it("reports unavailable on spawn error", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.emit("error", new Error("ENOENT"));

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.stderr).toContain("failed to spawn");
  });

  it("sends correct args to claude CLI", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("opus");

    proc.stdout.emit("data", Buffer.from(JSON.stringify({ num_turns: 1, duration_ms: 1000 })));
    proc.emit("close", 0);

    await promise;

    expect(spawnMock).toHaveBeenCalledWith("claude", expect.arrayContaining([
      "-p",
      "--output-format", "json",
      "--model", "opus",
      "--no-session-persistence",
    ]), expect.any(Object));
  });

  it("writes 'Reply OK' to stdin", async () => {
    const proc = createMockProcess();
    spawnMock.mockReturnValue(proc);

    const promise = probeQuota("sonnet");

    proc.stdout.emit("data", Buffer.from(JSON.stringify({ num_turns: 1, duration_ms: 1000 })));
    proc.emit("close", 0);

    await promise;

    expect(proc.stdin.write).toHaveBeenCalledWith("Reply OK");
    expect(proc.stdin.end).toHaveBeenCalled();
  });
});
