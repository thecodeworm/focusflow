import type { TimerSnapshot } from "@/types";

/**
 * Snapshots arrive both as command responses and as broadcast events, so they
 * can race. Only accept a snapshot newer than the one we have.
 */
export function acceptSnapshot(prev: TimerSnapshot | null, next: TimerSnapshot): TimerSnapshot | null {
  if (!prev) return next;
  if (next.seq <= prev.seq) return prev;
  return next;
}

/** Whether two snapshots render identically (avoids needless re-renders). */
export function sameDisplay(a: TimerSnapshot | null, b: TimerSnapshot | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.phase === b.phase &&
    a.status === b.status &&
    a.durationMs === b.durationMs &&
    Math.ceil(a.remainingMs / 1000) === Math.ceil(b.remainingMs / 1000) &&
    a.completedInCycle === b.completedInCycle &&
    a.longBreakInterval === b.longBreakInterval &&
    a.currentTaskId === b.currentTaskId &&
    a.sessionId === b.sessionId
  );
}

/** Position within the long-break cycle for the "session x of n" dots. */
export function cycleProgress(t: TimerSnapshot): { done: number; total: number; current: number } {
  const total = Math.max(1, t.longBreakInterval);
  const done = Math.min(total, t.completedInCycle);
  // During focus the in-progress session is the next dot.
  const current = t.phase === "focus" ? Math.min(total, done + 1) : done;
  return { done, total, current };
}
