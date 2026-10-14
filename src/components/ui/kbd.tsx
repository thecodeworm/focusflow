import { cn } from "@/lib/utils";

export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  if (keys.length === 0) return <span className={cn("text-[12px] text-fg-3", className)}>Not set</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[5px] border border-line bg-surface px-1 font-sans text-[11px] font-medium text-fg-2 shadow-[0_1px_0_var(--border)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
