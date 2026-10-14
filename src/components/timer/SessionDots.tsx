import type { TimerSnapshot } from "@/types";
import { cycleProgress } from "@/lib/timer-state";
import { cn } from "@/lib/utils";

export function SessionDots({ timer, className }: { timer: TimerSnapshot; className?: string }) {
  const { done, total, current } = cycleProgress(timer);
  const n = Math.min(total, 12);
  return (
    <div className={cn("flex items-center gap-[5px]", className)} aria-label={`${done} of ${total} focus sessions completed before the long break`} role="img">
      {Array.from({ length: n }, (_, i) => {
        const filled = i < done;
        const active = !filled && i === current - 1 && timer.phase === "focus" && timer.status !== "idle";
        return (
          <span
            key={i}
            className={cn(
              "size-[6px] rounded-full transition-colors duration-300",
              filled ? "bg-accent" : active ? "bg-accent/40" : "bg-line-strong",
            )}
          />
        );
      })}
    </div>
  );
}
