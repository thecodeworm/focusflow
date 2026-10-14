// Converts keyboard events into Tauri global-shortcut accelerator strings and
// renders accelerators for display.
import type { Platform } from "@/types";

export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const CODE_MAP: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Escape: "Escape",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return CODE_MAP[code] ?? null;
}

export type AcceleratorResult = { ok: true; accelerator: string } | { ok: false; reason: string } | { ok: false; pending: true };

/**
 * Builds an accelerator from a keydown. Requires at least one modifier other
 * than Shift, so plain typing can never be captured globally.
 */
export function eventToAccelerator(e: KeyLike, platform: Platform): AcceleratorResult {
  if (["Meta", "Control", "Alt", "Shift", "OS"].includes(e.key)) return { ok: false, pending: true };
  const key = keyFromCode(e.code);
  if (!key) return { ok: false, reason: "That key can't be used in a shortcut." };
  const mods: string[] = [];
  if (platform === "macos") {
    if (e.metaKey) mods.push("Command");
    if (e.ctrlKey) mods.push("Control");
  } else {
    if (e.ctrlKey) mods.push("Control");
    if (e.metaKey) mods.push("Super");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  const hasPrimary = mods.some((m) => m !== "Shift");
  if (!hasPrimary) {
    return { ok: false, reason: platform === "macos" ? "Include ⌘, ⌃ or ⌥." : "Include Ctrl, Alt or Win." };
  }
  return { ok: true, accelerator: [...mods, key].join("+") };
}

const MAC_SYMBOLS: Record<string, string> = {
  Command: "⌘",
  Cmd: "⌘",
  CommandOrControl: "⌘",
  CmdOrCtrl: "⌘",
  Control: "⌃",
  Ctrl: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
  Super: "⌘",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Enter: "↩",
  Space: "Space",
  Escape: "Esc",
  Backspace: "⌫",
};

const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

/** Splits an accelerator into display keycaps for the current platform. */
export function formatAccelerator(accel: string | null, platform: Platform): string[] {
  if (!accel) return [];
  const parts = accel.split("+").filter(Boolean);
  if (platform === "macos") {
    const mapped = parts.map((p) => MAC_SYMBOLS[p] ?? p.toUpperCase());
    const mods = mapped.filter((p) => MAC_ORDER.includes(p)).sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    const keys = mapped.filter((p) => !MAC_ORDER.includes(p));
    return [...mods, ...keys];
  }
  return parts.map((p) => {
    if (p === "CommandOrControl" || p === "CmdOrCtrl" || p === "Control") return "Ctrl";
    if (p === "Super") return "Win";
    return p.length === 1 ? p.toUpperCase() : p;
  });
}
