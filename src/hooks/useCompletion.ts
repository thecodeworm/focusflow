import { useEffect, useState } from "react";
import type { Completion } from "@/types";
import { on } from "@/lib/ipc";

/** True for a short moment after a session completes. */
export function useCompletion(ms = 1800): Completion | null {
  const [c, setC] = useState<Completion | null>(null);
  useEffect(() => {
    let timer = 0;
    const un = on("timer://completed", (payload) => {
      if (payload.recovered) return;
      setC(payload);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setC(null), ms);
    });
    return () => {
      window.clearTimeout(timer);
      void un.then((f) => f());
    };
  }, [ms]);
  return c;
}
