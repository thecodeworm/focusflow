import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

/** iOS/macOS-style segmented control with a sliding indicator. */
export function Segmented<T extends string>({ value, onChange, options, size = "md", className, ...rest }: Props<T>) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={rest["aria-label"]}
      className={cn("relative inline-flex rounded-[10px] bg-sunken p-[3px] dark:bg-black/25", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-0 flex flex-1 items-center justify-center gap-1.5 rounded-[7px] font-medium whitespace-nowrap transition-colors duration-150",
              size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3 text-[12.5px]",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-elevated"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
