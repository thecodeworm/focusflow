import type { Phase } from "@/types";

/**
 * mm:ss for a countdown. Partial seconds round *up* so the display shows
 * 25:00 at the start and only reaches 00:00 when the session is over. This
 * matches the menu-bar title rendered by Rust.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "1h 25m", "45m", "0m" */
export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export const phaseLabel: Record<Phase, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

export const phaseShort: Record<Phase, string> = {
  focus: "Focus",
  shortBreak: "Short",
  longBreak: "Long",
};

export function isBreak(p: Phase): boolean {
  return p !== "focus";
}
