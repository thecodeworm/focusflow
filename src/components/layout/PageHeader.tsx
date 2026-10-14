import { useApp } from "@/stores/app";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const platform = useApp((s) => s.platform);
  return (
    <header data-tauri-drag-region="deep" className={cn("flex shrink-0 items-end justify-between gap-4 px-8 pb-4", platform === "macos" ? "h-[76px]" : "h-[68px]")}>
      <div className="pointer-events-none min-w-0">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
