import { useState } from "react";
import { Slider } from "@/components/ui/slider";

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function SeekBar({ position, duration, onSeek }: { position: number; duration: number; onSeek: (s: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? position;
  return (
    <div className="flex w-full items-center gap-3">
      <span className="tabular w-11 text-right text-[11.5px] text-fg-3">{fmt(shown)}</span>
      <Slider
        aria-label="Seek"
        min={0}
        max={Math.max(1, duration)}
        step={1}
        value={[Math.min(shown, duration)]}
        onValueChange={([v]) => setDrag(v ?? 0)}
        onValueCommit={([v]) => {
          onSeek(v ?? 0);
          setDrag(null);
        }}
      />
      <span className="tabular w-11 text-[11.5px] text-fg-3">{fmt(duration)}</span>
    </div>
  );
}
