import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { TimerSnapshot } from "@/types";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTimerActions } from "@/hooks/useTimerActions";

interface Props {
  timer: TimerSnapshot;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const dims = {
  sm: { main: 44, icon: 18, side: 32, sideIcon: 15 },
  md: { main: 52, icon: 20, side: 36, sideIcon: 16 },
  lg: { main: 64, icon: 24, side: 44, sideIcon: 18 },
};

export function TimerControls({ timer, size = "md", className }: Props) {
  const { toggle, reset, skip } = useTimerActions();
  const d = dims[size];
  const running = timer.status === "running";
  const pristine = timer.status === "idle" && timer.remainingMs === timer.durationMs;
  const primaryLabel = running ? "Pause" : timer.status === "paused" ? "Resume" : "Start";

  const side = "flex items-center justify-center rounded-full text-fg-2 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-fg active:scale-90 disabled:opacity-35 disabled:pointer-events-none";

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <Tooltip content="Reset session">
        <button type="button" aria-label="Reset session" onClick={reset} disabled={pristine} className={side} style={{ width: d.side, height: d.side }}>
          <RotateCcw style={{ width: d.sideIcon, height: d.sideIcon }} />
        </button>
      </Tooltip>
      <button
        type="button"
        aria-label={primaryLabel}
        onClick={toggle}
        className={cn(
          "relative flex items-center justify-center rounded-full text-accent-fg shadow-[0_6px_16px_-6px_var(--accent)] transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.94]",
          timer.phase === "focus" ? "bg-accent hover:bg-accent-hover" : "bg-break hover:opacity-90 shadow-[0_6px_16px_-6px_var(--break)]",
        )}
        style={{ width: d.main, height: d.main }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={running ? "pause" : "play"}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.14 }}
            className="flex"
          >
            {running ? (
              <Pause fill="currentColor" strokeWidth={0} style={{ width: d.icon, height: d.icon }} />
            ) : (
              <Play fill="currentColor" strokeWidth={0} style={{ width: d.icon, height: d.icon, marginLeft: d.icon * 0.1 }} />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      <Tooltip content="Skip to next session">
        <button type="button" aria-label="Skip session" onClick={skip} className={side} style={{ width: d.side, height: d.side }}>
          <SkipForward style={{ width: d.sideIcon, height: d.sideIcon }} />
        </button>
      </Tooltip>
    </div>
  );
}
