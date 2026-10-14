import { useEffect, useRef } from "react";
import type { MusicStatus } from "@/types";
import { api, on, sendTo } from "@/lib/ipc";
import { music, useMusic } from "@/stores/music";
import { useApp } from "@/stores/app";

function summary(): MusicStatus {
  const m = useMusic.getState();
  return {
    source: m.source?.kind ?? "none",
    playing: m.phase === "playing" || m.phase === "buffering",
    title: m.source?.kind === "youtube" ? m.title || "YouTube" : m.title,
    focusSound: m.noise,
    focusSoundPlaying: m.noisePlaying,
    error: m.phase === "error" ? m.error : m.phase === "blocked" ? "Press play in the dashboard" : null,
  };
}

/**
 * Dashboard-side glue: shares a music summary with the widget, executes the
 * widget's music commands, and pauses YouTube while the dashboard is hidden
 * (YouTube's embed policy expects the player to be visible).
 */
export function useMusicSync() {
  const last = useRef("");

  useEffect(() => {
    const push = () => {
      const s = summary();
      const key = JSON.stringify(s);
      if (key === last.current) return;
      last.current = key;
      void sendTo("widget", "music://status", s);
    };
    const unsub = useMusic.subscribe(push);
    const unReq = on("music://request", () => {
      last.current = "";
      push();
    });
    const unCmd = on("music://command", (cmd) => {
      const m = useMusic.getState();
      if (cmd.action === "toggleFocusSound") {
        if (m.noise) void music.toggleNoise(m.noise);
        return;
      }
      if (m.source) {
        const playing = m.phase === "playing" || m.phase === "buffering";
        // Resuming a video needs the player on screen: bring the dashboard up.
        if (!playing && m.source.kind === "youtube" && !useApp.getState().visible) {
          void api.window.openDashboard("music");
        }
        music.toggle();
      } else if (m.noise) {
        void music.toggleNoise(m.noise);
      }
    });
    return () => {
      unsub();
      void unReq.then((f) => f());
      void unCmd.then((f) => f());
    };
  }, []);

  const visible = useApp((s) => s.visible);
  useEffect(() => {
    music.onVisibility(visible);
  }, [visible]);
}
