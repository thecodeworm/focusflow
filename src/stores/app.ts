import { create } from "zustand";
import type { Platform, Preset, Settings, ShortcutStatus, TimerSnapshot } from "@/types";
import { acceptSnapshot, sameDisplay } from "@/lib/timer-state";

export type WindowKind = "main" | "widget";

interface AppStore {
  ready: boolean;
  bootError: string | null;
  kind: WindowKind;
  settings: Settings | null;
  timer: TimerSnapshot | null;
  presets: Preset[];
  platform: Platform;
  playerOrigin: string | null;
  shortcuts: ShortcutStatus[];
  version: string;
  visible: boolean;
  setTimer: (t: TimerSnapshot) => void;
  setSettings: (s: Settings) => void;
}

export const useApp = create<AppStore>()((set, get) => ({
  ready: false,
  bootError: null,
  kind: "main",
  settings: null,
  timer: null,
  presets: [],
  platform: "macos",
  playerOrigin: null,
  shortcuts: [],
  version: "",
  visible: true,
  setTimer: (t) => {
    const prev = get().timer;
    const next = acceptSnapshot(prev, t);
    if (next === prev) return;
    // Keep the newer seq, but skip the React update if nothing visible changed.
    if (sameDisplay(prev, next)) {
      useApp.setState({ timer: next }, false);
      return;
    }
    set({ timer: next });
  },
  setSettings: (s) => set({ settings: s }),
}));

/** Non-null settings selector for components rendered after boot. */
export function useSettings(): Settings {
  return useApp((s) => s.settings!);
}
