import { describe, expect, it } from "vitest";
import type { TimerSnapshot } from "@/types";
import { acceptSnapshot, cycleProgress, sameDisplay } from "./timer-state";

const snap = (over: Partial<TimerSnapshot> = {}): TimerSnapshot => ({
  phase: "focus",
  status: "running",
  durationMs: 1_500_000,
  remainingMs: 1_200_000,
  completedInCycle: 0,
  longBreakInterval: 4,
  sessionId: 1,
  currentTaskId: null,
  seq: 10,
  ...over,
});

describe("acceptSnapshot", () => {
  it("accepts the first snapshot", () => {
    const s = snap();
    expect(acceptSnapshot(null, s)).toBe(s);
  });
  it("drops stale or duplicate snapshots", () => {
    const cur = snap({ seq: 10 });
    expect(acceptSnapshot(cur, snap({ seq: 9, status: "paused" }))).toBe(cur);
    expect(acceptSnapshot(cur, snap({ seq: 10 }))).toBe(cur);
  });
  it("accepts newer snapshots", () => {
    const next = snap({ seq: 11, status: "paused" });
    expect(acceptSnapshot(snap(), next)).toBe(next);
  });
  it("handles rapid start/pause responses arriving out of order", () => {
    let state: TimerSnapshot | null = null;
    const events = [snap({ seq: 1, status: "running" }), snap({ seq: 3, status: "running" }), snap({ seq: 2, status: "paused" })];
    for (const e of events) state = acceptSnapshot(state, e);
    expect(state!.status).toBe("running");
    expect(state!.seq).toBe(3);
  });
});

describe("sameDisplay", () => {
  it("ignores sub-second differences", () => {
    expect(sameDisplay(snap({ remainingMs: 1_200_000 }), snap({ remainingMs: 1_199_500 }))).toBe(true);
    expect(sameDisplay(snap({ remainingMs: 1_200_000 }), snap({ remainingMs: 1_199_000 }))).toBe(false);
  });
  it("detects status changes", () => {
    expect(sameDisplay(snap(), snap({ status: "paused" }))).toBe(false);
  });
});

describe("cycleProgress", () => {
  it("highlights the in-progress focus session", () => {
    expect(cycleProgress(snap({ completedInCycle: 1 }))).toEqual({ done: 1, total: 4, current: 2 });
  });
  it("shows completed sessions during a break", () => {
    expect(cycleProgress(snap({ phase: "longBreak", completedInCycle: 4 }))).toEqual({ done: 4, total: 4, current: 4 });
  });
});
