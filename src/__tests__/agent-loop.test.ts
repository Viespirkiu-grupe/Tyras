import { describe, it, expect } from "vitest";
import { parseResetTime, QuotaExhaustedError } from "../agent-loop.js";

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
