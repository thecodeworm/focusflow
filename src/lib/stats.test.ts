import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionRow } from "@/types";
import { addLocalDays, currentStreak, dayKey, lastNDays, startOfLocalDay, taskBreakdown, todayTotals } from "./stats";

let id = 0;
const s = (endedAt: number, over: Partial<SessionRow> = {}): SessionRow => ({
  id: ++id,
  phase: "focus",
  startedAt: endedAt - 1_500_000,
  endedAt,
  durationMs: 1_500_000,
  taskId: null,
  taskTitle: null,
  ...over,
});

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe("day boundaries", () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("buckets by local day, not UTC", () => {
    // 23:30 local is already "tomorrow" in UTC.
    const late = at(2026, 3, 10, 23, 30);
    expect(new Date(late).getUTCDate()).toBe(11);
    expect(dayKey(late)).toBe("2026-03-10");
  });

  it("handles DST transitions when stepping days", () => {
    // US DST starts 2026-03-08: that day has 23 hours.
    const start = startOfLocalDay(at(2026, 3, 8));
    const next = addLocalDays(start, 1);
    expect(next - start).toBe(23 * 3_600_000);
    expect(dayKey(next)).toBe("2026-03-09");
  });

  it("builds a 7-day chart ending today", () => {
    const now = at(2026, 3, 10, 9);
    const days = lastNDays([s(at(2026, 3, 10, 8)), s(at(2026, 3, 10, 8, 30)), s(at(2026, 3, 4, 20)), s(at(2026, 3, 3, 20))], now, 7);
    expect(days).toHaveLength(7);
    expect(days[0]!.key).toBe("2026-03-04");
    expect(days[6]!.key).toBe("2026-03-10");
    expect(days[6]!.sessions).toBe(2);
    expect(days[0]!.focusMs).toBe(1_500_000);
    expect(days.reduce((a, d) => a + d.sessions, 0)).toBe(3);
  });

  it("totals today only", () => {
    const now = at(2026, 3, 10, 18);
    const t = todayTotals([s(at(2026, 3, 10, 0, 1)), s(at(2026, 3, 9, 23, 59)), s(at(2026, 3, 10, 17), { phase: "shortBreak" })], now);
    expect(t).toEqual({ focusMs: 1_500_000, sessions: 1 });
  });
});

describe("streaks", () => {
  it("counts consecutive days ending today", () => {
    const now = at(2026, 5, 20, 15);
    expect(currentStreak([s(at(2026, 5, 20)), s(at(2026, 5, 19)), s(at(2026, 5, 18)), s(at(2026, 5, 16))], now)).toBe(3);
  });
  it("keeps yesterday's streak alive until today ends", () => {
    const now = at(2026, 5, 20, 9);
    expect(currentStreak([s(at(2026, 5, 19)), s(at(2026, 5, 18))], now)).toBe(2);
  });
  it("is zero after a missed day", () => {
    const now = at(2026, 5, 20, 9);
    expect(currentStreak([s(at(2026, 5, 18))], now)).toBe(0);
    expect(currentStreak([], now)).toBe(0);
  });
});

describe("task breakdown", () => {
  it("groups sessions by task", () => {
    const rows = taskBreakdown([
      s(1, { taskId: 1, taskTitle: "Write" }),
      s(2, { taskId: 1, taskTitle: "Write" }),
      s(3, { taskId: 2, taskTitle: "Read" }),
      s(4),
    ]);
    expect(rows.map((r) => [r.title, r.sessions])).toEqual([["Write", 2], ["Read", 1]]);
  });
});
