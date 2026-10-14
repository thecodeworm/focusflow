import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Platform } from "@/types";
import { eventToAccelerator, formatAccelerator } from "@/lib/accelerator";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  platform: Platform;
  disabled?: boolean;
  onChange: (accel: string | null) => void;
  label: string;
}

export function ShortcutRecorder({ value, platform, disabled, onChange, label }: Props) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setRecording(false);
        setHint(null);
        return;
      }
      const r = eventToAccelerator(e, platform);
      if (r.ok) {
        setRecording(false);
        setHint(null);
        onChange(r.accelerator);
      } else if (!("pending" in r)) {
        setHint(r.reason);
      }
    };
    const stop = () => setRecording(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", stop);
    };
  }, [recording, platform, onChange]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        aria-label={`Record shortcut for ${label}`}
        onClick={() => {
          setHint(null);
          setRecording((r) => !r);
        }}
        className={cn(
          "flex h-8 min-w-[132px] items-center justify-center rounded-[9px] border px-2 text-[12px] transition-colors duration-150 disabled:opacity-45",
          recording ? "border-accent bg-accent/8 text-accent" : "border-line bg-surface shadow-soft hover:bg-hover",
        )}
      >
        {recording ? (hint ?? "Press keys… (Esc to cancel)") : <Kbd keys={formatAccelerator(value, platform)} />}
      </button>
      <button
        type="button"
        aria-label={`Clear shortcut for ${label}`}
        disabled={disabled || !value}
        onClick={() => onChange(null)}
        className="flex size-7 items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg disabled:opacity-0"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
