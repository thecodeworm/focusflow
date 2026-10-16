// Mirrors the serde types in src-tauri/src. Keep in sync.

export type Phase = "focus" | "shortBreak" | "longBreak";
export type Status = "idle" | "running" | "paused";

export interface TimerSnapshot {
  phase: Phase;
  status: Status;
  durationMs: number;
  remainingMs: number;
  completedInCycle: number;
  longBreakInterval: number;
  sessionId: number;
  currentTaskId: number | null;
  seq: number;
}

export interface Completion {
  sessionId: number;
  phase: Phase;
  durationMs: number;
  startedAt: number | null;
  nextPhase: Phase;
  recovered: boolean;
}

export interface Preset {
  id: string;
  name: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}

export type ThemeSetting = "system" | "light" | "dark";
export type Accent = "coral" | "ocean" | "violet" | "forest" | "amber" | "graphite";
export type WidgetSize = "compact" | "standard" | "expanded";
export type RingStyle = "thin" | "regular" | "bold";
export type CloseBehavior = "hide" | "minimize" | "quit";
export type SoundName = "chime" | "bell" | "soft" | "digital";

export interface SavedItem {
  id: string;
  name: string;
  url: string;
  source: "audio" | "youtube";
  label?: string | null;
}

/** A named list of saved music links. */
export interface Collection {
  id: string;
  name: string;
  items: SavedItem[];
}

export interface Shortcuts {
  enabled: boolean;
  toggleTimer: string | null;
  resetTimer: string | null;
  toggleWidget: string | null;
  openDashboard: string | null;
  togglePin: string | null;
}

export type ShortcutAction = Exclude<keyof Shortcuts, "enabled">;

export interface Settings {
  version: number;
  timer: {
    focusMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    longBreakInterval: number;
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
    countSleepTime: boolean;
    associateTasks: boolean;
    presetId: string;
    customPresets: Preset[];
  };
  appearance: {
    theme: ThemeSetting;
    accent: Accent;
    widgetSize: WidgetSize;
    widgetOpacity: number;
    ringStyle: RingStyle;
    animations: boolean;
    compactMode: boolean;
  };
  desktop: {
    alwaysOnTop: boolean;
    allWorkspaces: boolean;
    showOverFullscreen: boolean;
    launchAtLogin: boolean;
    showTray: boolean;
    showTrayTime: boolean;
    closeBehavior: CloseBehavior;
    notifications: boolean;
    showWidgetOnLaunch: boolean;
    showDashboardOnLaunch: boolean;
    pauseVideoWhenHidden: boolean;
    shortcuts: Shortcuts;
  };
  audio: {
    soundEnabled: boolean;
    sound: SoundName;
    soundVolume: number;
    musicVolume: number;
    focusSoundVolume: number;
    loopMusic: boolean;
    /** Legacy flat list; Rust folds it into the "Favorites" collection on load. */
    favorites: SavedItem[];
    collections: Collection[];
  };
}

/** Deep partial used for settings patches. */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K];
};

export interface ShortcutStatus {
  action: ShortcutAction;
  accelerator: string | null;
  ok: boolean;
  error: string | null;
}

export type Platform = "macos" | "windows" | "linux";

export interface Bootstrap {
  settings: Settings;
  timer: TimerSnapshot;
  presets: Preset[];
  platform: Platform;
  playerOrigin: string | null;
  shortcuts: ShortcutStatus[];
  notices: string[];
  version: string;
}

export interface Task {
  id: number;
  title: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface SessionRow {
  id: number;
  phase: string;
  startedAt: number | null;
  endedAt: number;
  durationMs: number;
  taskId: number | null;
  taskTitle: string | null;
}

export interface StatsSummary {
  totalFocusMs: number;
  totalSessions: number;
  taskSessions: number;
  firstSessionAt: number | null;
}

export type Page = "timer" | "music" | "tasks" | "stats" | "settings";

/** Self-update state reported by the Rust updater. */
export interface UpdateStatus {
  current: string;
  /** Version downloaded and waiting for a restart. */
  ready: string | null;
  checking: boolean;
  /** False in development builds. */
  supported: boolean;
}

/** Music status shared from the dashboard to the floating widget. */
export interface MusicStatus {
  source: "none" | "youtube" | "audio";
  playing: boolean;
  title: string;
  focusSound: string | null;
  focusSoundPlaying: boolean;
  error: string | null;
}
