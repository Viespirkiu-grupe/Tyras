import { describe, it, expect } from "vitest";
import { formatDuration, formatDateTime } from "../io/format.js";

describe("formatDuration", () => {
  it("formats sub-minute durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(500)).toBe("1s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("formats minutes with remaining seconds", () => {
    expect(formatDuration(60_000)).toBe("1m0s");
    expect(formatDuration(90_000)).toBe("1m30s");
    expect(formatDuration(125_000)).toBe("2m5s");
  });

  it("formats large durations", () => {
    expect(formatDuration(3_600_000)).toBe("60m0s");
    expect(formatDuration(7_200_000)).toBe("120m0s");
  });

  it("rounds milliseconds to nearest second", () => {
    expect(formatDuration(1499)).toBe("1s");
    expect(formatDuration(1500)).toBe("2s");
  });
});

describe("formatDateTime", () => {
  it("formats date with zero-padded fields", () => {
    const date = new Date(2026, 0, 5, 3, 7, 9);
    expect(formatDateTime(date)).toBe("2026-01-05 03:07:09");
  });

  it("formats date with double-digit fields", () => {
    const date = new Date(2026, 11, 25, 14, 30, 59);
    expect(formatDateTime(date)).toBe("2026-12-25 14:30:59");
  });
});
