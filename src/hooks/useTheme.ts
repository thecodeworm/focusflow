import { useEffect } from "react";
import type { Settings } from "@/types";

/** Applies theme, accent and motion preferences to the document root. */
export function useTheme(settings: Settings | null) {
  const theme = settings?.appearance.theme ?? "system";
  const accent = settings?.appearance.accent ?? "coral";
  const animations = settings?.appearance.animations ?? true;
  const compact = settings?.appearance.compactMode ?? false;

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
    };
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.motion = animations ? "on" : "off";
  }, [animations]);

  useEffect(() => {
    document.documentElement.dataset.density = compact ? "compact" : "comfortable";
  }, [compact]);
}
