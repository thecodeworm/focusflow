import { useEffect, useRef } from "react";
import { useDraft } from "@/hooks/useDraft";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  muted?: boolean;
  onChange: (v: number) => void;
  /** Called (debounced) when the user settles on a value, for persistence. */
  onCommit?: (v: number) => void;
  onToggleMute?: () => void;
  label: string;
  className?: string;
}

export function VolumeControl({ value, muted, onChange, onCommit, onToggleMute, label, className }: Props) {
  const [local, setLocal] = useDraft(value);
  const t = useRef(0);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const Icon = muted || local === 0 ? VolumeX : local < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        onClick={onToggleMute}
        disabled={!onToggleMute}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-hover hover:text-fg disabled:hover:bg-transparent"
      >
        <Icon className="size-4" />
      </button>
      <Slider
        aria-label={`${label} volume`}
        min={0}
        max={1}
        step={0.01}
        value={[local]}
        onValueChange={([v]) => {
          const n = v ?? 0;
          setLocal(n);
          onChange(n);
          window.clearTimeout(t.current);
          t.current = window.setTimeout(() => onCommit?.(n), 400);
        }}
        className="w-24"
      />
    </div>
  );
}
