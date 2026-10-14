import { useEffect, useState } from "react";
import type { SessionRow, StatsSummary } from "@/types";
import { api, errorMessage, on } from "@/lib/ipc";
import { addLocalDays, startOfLocalDay } from "@/lib/stats";
import { toast } from "@/stores/toast";

/** Completed sessions from the last `days` local days, kept fresh. */
export function useSessions(days: number) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const un = on("stats://changed", () => setVersion((v) => v + 1));
    return () => void un.then((f) => f());
  }, []);

  useEffect(() => {
    let alive = true;
    const since = addLocalDays(startOfLocalDay(Date.now()), -days);
    Promise.all([api.stats.sessions(since), api.stats.summary()])
      .then(([rows, sum]) => {
        if (!alive) return;
        setSessions(rows);
        setSummary(sum);
      })
      .catch((e) => toast.error(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [days, version]);

  return { sessions, summary };
}

/** Current time, refreshed every `ms` so day boundaries roll over. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    const wake = on("system://wake", () => setNow(Date.now()));
    return () => {
      window.clearInterval(t);
      void wake.then((f) => f());
    };
  }, [ms]);
  return now;
}
