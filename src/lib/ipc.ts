// Typed wrappers around Ringlet's Rust commands and events.
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Bootstrap,
  Completion,
  MusicStatus,
  Page,
  Phase,
  SessionRow,
  Settings,
  SettingsPatch,
  ShortcutStatus,
  StatsSummary,
  Task,
  TimerSnapshot,
} from "@/types";

export type WindowLabel = "main" | "widget";

export const api = {
  bootstrap: () => invoke<Bootstrap>("get_bootstrap"),

  timer: {
    toggle: () => invoke<TimerSnapshot>("timer_toggle"),
    start: () => invoke<TimerSnapshot>("timer_start"),
    pause: () => invoke<TimerSnapshot>("timer_pause"),
    reset: () => invoke<TimerSnapshot>("timer_reset"),
    restart: () => invoke<TimerSnapshot>("timer_restart"),
    skip: () => invoke<TimerSnapshot>("timer_skip"),
    setPhase: (phase: Phase) => invoke<TimerSnapshot>("timer_set_phase", { phase }),
    setTask: (taskId: number | null) => invoke<TimerSnapshot>("timer_set_task", { taskId }),
  },

  settings: {
    update: (patch: SettingsPatch) => invoke<Settings>("update_settings", { patch }),
    reset: () => invoke<Settings>("reset_settings"),
    applyPreset: (id: string) => invoke<Settings>("apply_preset", { id }),
    savePreset: (name: string) => invoke<Settings>("save_preset", { name }),
    deletePreset: (id: string) => invoke<Settings>("delete_preset", { id }),
    exportFile: () => invoke<boolean>("export_settings"),
    importFile: () => invoke<Settings | null>("import_settings"),
  },

  tasks: {
    list: () => invoke<Task[]>("tasks_list"),
    add: (title: string) => invoke<Task>("task_add", { title }),
    update: (id: number, patch: { title?: string; done?: boolean }) =>
      invoke<void>("task_update", { id, title: patch.title ?? null, done: patch.done ?? null }),
    remove: (id: number) => invoke<void>("task_delete", { id }),
    clearCompleted: () => invoke<void>("tasks_clear_completed"),
  },

  stats: {
    sessions: (since: number) => invoke<SessionRow[]>("stats_sessions", { since }),
    summary: () => invoke<StatsSummary>("stats_summary"),
    clear: () => invoke<void>("stats_clear"),
  },

  window: {
    show: (label: WindowLabel) => invoke<void>("window_show", { label }),
    hide: (label: WindowLabel) => invoke<void>("window_hide", { label }),
    toggle: (label: WindowLabel) => invoke<void>("window_toggle", { label }),
    openDashboard: (page?: Page) => invoke<void>("open_dashboard", { page: page ?? null }),
    togglePin: () => invoke<Settings>("toggle_pin"),
    quit: () => invoke<void>("quit_app"),
  },

  sound: {
    preview: (sound: string, volume: number) => invoke<void>("preview_sound", { sound, volume }),
  },

  notifications: {
    permission: () => invoke<string>("notification_permission"),
    request: () => invoke<string>("request_notification_permission"),
    test: () => invoke<void>("test_notification"),
  },

  openExternal: (url: string) => invoke<void>("open_external", { url }),
};

export interface EventMap {
  "timer://state": TimerSnapshot;
  "timer://completed": Completion;
  "settings://changed": Settings;
  "shortcuts://status": ShortcutStatus[];
  "tasks://changed": null;
  "stats://changed": null;
  "app://error": string;
  "nav://goto": Page;
  "window://visible": boolean;
  "system://wake": null;
  "music://status": MusicStatus;
  "music://request": null;
  "music://command": MusicCommand;
}

export type MusicCommand = { action: "toggle" } | { action: "toggleFocusSound" };

export function on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): Promise<UnlistenFn> {
  return listen<EventMap[K]>(event, (e) => cb(e.payload));
}

export function sendTo<K extends keyof EventMap>(target: WindowLabel, event: K, payload: EventMap[K]) {
  return emitTo(target, event, payload);
}

/** Converts a thrown command error into a readable sentence. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
