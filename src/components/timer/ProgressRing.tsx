import { memo, useEffect, useRef, useState } from "react";
import type { Phase, RingStyle, Status } from "@/types";
import { dashOffset, remainingFraction, ringGeometry, strokeFor } from "@/lib/ring";
import { cn } from "@/lib/utils";

interface Props {
  size: number;
  remainingMs: number;
  durationMs: number;
  status: Status;
  phase: Phase;
  sessionId: number;
  ringStyle: RingStyle;
  animate: boolean;
  children?: React.ReactNode;
  className?: string;
}

/**
 * SVG progress ring showing the *remaining* time. While running, each tick
 * animates linearly toward where the ring will be at the next tick, so motion
 * is continuous with one update per second and no requestAnimationFrame loop.
 * When paused or idle nothing animates.
 */
export const ProgressRing = memo(function ProgressRing({
  size,
  remainingMs,
  durationMs,
  status,
  phase,
  sessionId,
  ringStyle,
  animate,
  children,
  className,
}: Props) {
  const stroke = Math.max(3, Math.round(size * strokeFor[ringStyle]));
  const g = ringGeometry(size, stroke);
  const running = status === "running";
  const lead = running && animate ? 1000 : 0;
  const fraction = remainingFraction(remainingMs - lead, durationMs);
  const offset = dashOffset(fraction, g.circumference);

  // A new session refills the ring with a short ease instead of a 1s sweep.
  const lastSession = useRef(sessionId);
  const [refill, setRefill] = useState(false);
  useEffect(() => {
    if (lastSession.current !== sessionId) {
      lastSession.current = sessionId;
      setRefill(true);
      const t = window.setTimeout(() => setRefill(false), 650);
      return () => window.clearTimeout(t);
    }
  }, [sessionId]);

  const transition = !animate
    ? "none"
    : refill
      ? "stroke-dashoffset 600ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 300ms ease"
      : running
        ? "stroke-dashoffset 1000ms linear, stroke 300ms ease"
        : "stroke-dashoffset 250ms ease-out, stroke 300ms ease";

  const color = phase === "focus" ? "var(--accent)" : "var(--break)";

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={g.radius} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={g.radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={g.circumference}
          strokeDashoffset={offset}
          opacity={fraction <= 0.001 ? 0 : 1}
          style={{ transition }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
});
