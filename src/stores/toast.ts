import { create } from "zustand";

export type ToastTone = "info" | "error" | "success";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone, ms?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (message, tone = "info", ms) => {
    // Collapse duplicates (e.g. repeated network errors).
    if (get().toasts.some((t) => t.message === message)) return;
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    const timeout = ms ?? (tone === "error" ? 7000 : 4500);
    window.setTimeout(() => get().dismiss(id), timeout);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (m: string) => useToasts.getState().push(m, "info"),
  success: (m: string) => useToasts.getState().push(m, "success"),
  error: (m: string) => useToasts.getState().push(m, "error"),
};
