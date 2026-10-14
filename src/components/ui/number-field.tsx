import { useDraft } from "@/hooks/useDraft";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  "aria-label": string;
  className?: string;
}

/** Compact stepper used for durations. Commits on blur/Enter or +/- clicks. */
export function NumberField({ value, min, max, step = 1, suffix, onChange, className, ...rest }: Props) {
  const [draft, setDraft] = useDraft(String(value));

  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={cn("inline-flex h-8 items-center rounded-[9px] border border-line bg-surface shadow-soft", className)}>
      <button
        type="button"
        aria-label={`Decrease ${rest["aria-label"]}`}
        disabled={value <= min}
        onClick={() => commit(String(value - step))}
        className="flex h-full w-7 items-center justify-center rounded-l-[9px] text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-35"
      >
        <Minus className="size-3.5" />
      </button>
      <div className="flex items-baseline">
        <input
          aria-label={rest["aria-label"]}
          inputMode="numeric"
          className="tabular w-8 bg-transparent text-center text-[13px] font-medium text-fg outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "ArrowUp") { e.preventDefault(); commit(String(value + step)); }
            if (e.key === "ArrowDown") { e.preventDefault(); commit(String(value - step)); }
          }}
        />
        {suffix && <span className="-ml-0.5 pr-0.5 text-[11.5px] text-fg-3">{suffix}</span>}
      </div>
      <button
        type="button"
        aria-label={`Increase ${rest["aria-label"]}`}
        disabled={value >= max}
        onClick={() => commit(String(value + step))}
        className="flex h-full w-7 items-center justify-center rounded-r-[9px] text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-35"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
