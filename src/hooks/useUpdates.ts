import { useEffect, useState } from "react";
import type { UpdateStatus } from "@/types";
import { api, errorMessage, on } from "@/lib/ipc";
import { toast } from "@/stores/toast";

/** Live self-update state, plus a manual check that remembers its result. */
export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  // True after a manual check found nothing new.
  const [upToDate, setUpToDate] = useState(false);

  useEffect(() => {
    let live = true;
    api.updates.status().then((s) => live && setStatus(s), () => {});
    const un = on("updates://status", (s) => setStatus(s));
    return () => {
      live = false;
      void un.then((f) => f());
    };
  }, []);

  const check = async () => {
    setUpToDate(false);
    setStatus((s) => s && { ...s, checking: true });
    try {
      const s = await api.updates.check();
      setStatus(s);
      setUpToDate(!s.ready);
    } catch (e) {
      toast.error(errorMessage(e));
      api.updates.status().then(setStatus, () => {});
    }
  };

  return { status, upToDate, check, apply: () => void api.updates.apply() };
}
