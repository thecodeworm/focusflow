import { useEffect } from "react";
import { useTimerActions } from "./useTimerActions";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest("[role=dialog],[role=alertdialog],[role=listbox],[role=menu]");
}

/** In-window keys: Space start/pause, R reset, S skip (ignored while typing). */
export function useLocalShortcuts(enabled = true) {
  const { toggle, reset, skip } = useTimerActions();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target)) return;
      // Let focused buttons handle Space themselves.
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName === "BUTTON") return;
      if (e.code === "Space") {
        e.preventDefault();
        void toggle();
      } else if (e.key === "r" || e.key === "R") {
        void reset();
      } else if (e.key === "s" || e.key === "S") {
        void skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, toggle, reset, skip]);
}
