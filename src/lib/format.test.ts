import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatHours } from "./format";

describe("formatClock", () => {
  it("shows full minutes at the start of a session", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
  });
  it("rounds partial seconds up so 00:00 only shows at the end", () => {
    expect(formatClock(1_499_996)).toBe("25:00");
    expect(formatClock(1_498_996)).toBe("24:59");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
  });
  it("never shows negative time", () => {
    expect(formatClock(-500)).toBe("00:00");
  });
  it("supports sessions longer than an hour", () => {
    expect(formatClock(180 * 60_000)).toBe("180:00");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(25 * 60_000)).toBe("25m");
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(85 * 60_000)).toBe("1h 25m");
  });
  it("formats hours", () => {
    expect(formatHours(90 * 60_000)).toBe("1.5h");
    expect(formatHours(12 * 3_600_000)).toBe("12h");
  });
});
