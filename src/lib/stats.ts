// Statistics are computed from raw UTC session timestamps using the *current*
// local time zone, so day boundaries and DST transitions are always correct
// for where the user is now.
import type { SessionRow } from "@/types";

export interface DayBucket {
  key: string;
  start: number;
  end: number;
  label: string;
  focusMs: number;
  sessions: number;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `n` calendar days from `ts` (DST-safe). */
export function addLocalDays(ts: number, n: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const focusOnly = (s: SessionRow) => s.phase === "focus";

export function lastNDays(sessions: SessionRow[], now: number, n: number): DayBucket[] {
  const today = startOfLocalDay(now);
  const buckets: DayBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addLocalDays(today, -i);
    const end = addLocalDays(today, -i + 1);
    buckets.push({
      key: dayKey(start),
      start,
      end,
      label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }),
      focusMs: 0,
      sessions: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const s of sessions) {
    if (!focusOnly(s)) continue;
    const b = byKey.get(dayKey(s.endedAt));
    if (b) {
      b.focusMs += s.durationMs;
      b.sessions += 1;
    }
  }
  return buckets;
}

export function todayTotals(sessions: SessionRow[], now: number) {
  const start = startOfLocalDay(now);
  const end = addLocalDays(start, 1);
  let focusMs = 0;
  let count = 0;
  for (const s of sessions) {
    if (focusOnly(s) && s.endedAt >= start && s.endedAt < end) {
      focusMs += s.durationMs;
      count += 1;
    }
  }
  return { focusMs, sessions: count };
}

/**
 * Consecutive local days with at least one completed focus session, ending
 * today — or yesterday, since today's streak isn't broken until midnight.
 */
export function currentStreak(sessions: SessionRow[], now: number): number {
  const days = new Set(sessions.filter(focusOnly).map((s) => dayKey(s.endedAt)));
  let cursor = startOfLocalDay(now);
  if (!days.has(dayKey(cursor))) cursor = addLocalDays(cursor, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}

export interface TaskStat {
  key: string;
  title: string;
  sessions: number;
  focusMs: number;
}

export function taskBreakdown(sessions: SessionRow[]): TaskStat[] {
  const map = new Map<string, TaskStat>();
  for (const s of sessions) {
    if (!focusOnly(s) || s.taskId == null) continue;
    const key = String(s.taskId);
    const cur = map.get(key) ?? { key, title: s.taskTitle ?? "Deleted task", sessions: 0, focusMs: 0 };
    cur.sessions += 1;
    cur.focusMs += s.durationMs;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.focusMs - a.focusMs);
}
