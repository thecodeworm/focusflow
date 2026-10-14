import { useMemo } from "react";
import type { Phase, TimerSnapshot } from "@/types";
import { api, errorMessage } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import { toast } from "@/stores/toast";

async function run(p: Promise<TimerSnapshot>) {
  try {
    useApp.getState().setTimer(await p);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

/** Timer commands. The Rust side serialises them, so rapid clicks are safe. */
export function useTimerActions() {
  return useMemo(
    () => ({
      toggle: () => run(api.timer.toggle()),
      reset: () => run(api.timer.reset()),
      restart: () => run(api.timer.restart()),
      skip: () => run(api.timer.skip()),
      setPhase: (p: Phase) => run(api.timer.setPhase(p)),
      setTask: (id: number | null) => run(api.timer.setTask(id)),
    }),
    [],
  );
}
