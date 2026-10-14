import { useState } from "react";
import type { Phase, TimerSnapshot } from "@/types";
import { Segmented } from "@/components/ui/segmented";
import { ConfirmDialog } from "@/components/ui/dialog";
import { phaseLabel, phaseShort } from "@/lib/format";
import { useTimerActions } from "@/hooks/useTimerActions";

export function PhaseTabs({ timer, short = false, size = "md" }: { timer: TimerSnapshot; short?: boolean; size?: "sm" | "md" }) {
  const { setPhase } = useTimerActions();
  const [pending, setPending] = useState<Phase | null>(null);
  const inProgress = timer.status !== "idle" || timer.remainingMs < timer.durationMs;

  const choose = (p: Phase) => {
    if (p === timer.phase) return;
    if (inProgress) setPending(p);
    else void setPhase(p);
  };

  const labels = short ? phaseShort : phaseLabel;
  return (
    <>
      <Segmented<Phase>
        aria-label="Session type"
        size={size}
        value={timer.phase}
        onChange={choose}
        options={(["focus", "shortBreak", "longBreak"] as Phase[]).map((p) => ({ value: p, label: labels[p], title: phaseLabel[p] }))}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Switch to ${pending ? phaseLabel[pending].toLowerCase() : ""}?`}
        description="The current session will end without being recorded."
        confirmLabel="Switch"
        onConfirm={() => {
          if (pending) void setPhase(pending);
          setPending(null);
        }}
      />
    </>
  );
}
