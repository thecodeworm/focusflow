import { ArrowDownCircle, BarChart3, Check, ListChecks, Loader2, Music2, RefreshCw, Settings2, Timer, PictureInPicture2 } from "lucide-react";
import { motion } from "motion/react";
import type { Page } from "@/types";
import { cn } from "@/lib/utils";
import { formatClock, phaseLabel } from "@/lib/format";
import { api } from "@/lib/ipc";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { useMusic } from "@/stores/music";
import { useUpdates } from "@/hooks/useUpdates";

const NAV: { id: Page; label: string; icon: typeof Timer }[] = [
  { id: "timer", label: "Timer", icon: Timer },
  { id: "music", label: "Music", icon: Music2 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function MiniStatus() {
  const timer = useApp((s) => s.timer)!;
  const running = timer.status === "running";
  return (
    <button
      type="button"
      onClick={() => useUi.getState().setPage("timer")}
      className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-soft transition-colors hover:bg-hover"
    >
      <span className={cn("size-2 shrink-0 rounded-full", timer.phase === "focus" ? "bg-accent" : "bg-break", !running && "opacity-40")} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-fg-2">
          {phaseLabel[timer.phase]}
          {timer.status === "paused" ? " · Paused" : timer.status === "idle" ? " · Ready" : ""}
        </span>
        <span className="tabular block text-[15px] leading-tight font-semibold text-fg">{formatClock(timer.remainingMs)}</span>
      </span>
    </button>
  );
}

/** Sits above the timer card: a restart button once an update is ready, otherwise a quiet "check" link. */
function UpdateStatusChip() {
  const { status, upToDate, check, apply } = useUpdates();
  if (!status?.supported) return null;
  if (status.ready) {
    return (
      <button
        type="button"
        onClick={apply}
        className="flex w-full items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-left transition-colors hover:bg-accent/15"
      >
        <ArrowDownCircle className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-fg">Update ready</span>
          <span className="block text-[11.5px] text-fg-2">Restart to get {status.ready}</span>
        </span>
      </button>
    );
  }
  const Icon = status.checking ? Loader2 : upToDate ? Check : RefreshCw;
  return (
    <button
      type="button"
      onClick={() => void check()}
      disabled={status.checking}
      className="flex h-7 items-center justify-center gap-1.5 rounded-lg text-[11.5px] text-fg-3 transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none"
    >
      <Icon className={cn("size-3", status.checking && "animate-spin")} />
      {status.checking ? "Checking for updates…" : upToDate ? `Up to date · ${status.current}` : "Check for updates"}
    </button>
  );
}

export function Sidebar() {
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  const platform = useApp((s) => s.platform);
  const musicPlaying = useMusic((s) => s.phase === "playing" || s.noisePlaying);

  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-line bg-bg/60">
      {/* Title-bar area: draggable, leaves room for the macOS traffic lights. */}
      <div data-tauri-drag-region="deep" className={cn("flex shrink-0 items-end px-4", platform === "macos" ? "h-[60px] pb-2" : "h-[52px] pb-2")}>
        {platform !== "macos" && (
          <span className="pointer-events-none flex items-center gap-2 text-[13px] font-semibold text-fg">
            <img src="/icon.png" alt="" className="size-5 rounded-[5px]" /> Ringlet
          </span>
        )}
      </div>
      <nav className="flex flex-col gap-0.5 px-2.5" aria-label="Sections">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150",
                active ? "text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-0 rounded-lg bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_0.5px_var(--border)] dark:bg-elevated"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              )}
              <Icon className={cn("relative size-4", active ? "text-accent" : "")} strokeWidth={active ? 2.2 : 2} />
              <span className="relative">{label}</span>
              {id === "music" && musicPlaying && <span className="relative ml-auto size-1.5 rounded-full bg-accent" aria-label="Playing" />}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 p-3">
        <UpdateStatusChip />
        <MiniStatus />
        <button
          type="button"
          onClick={() => void api.window.toggle("widget")}
          className="flex h-8 items-center justify-center gap-2 rounded-lg text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        >
          <PictureInPicture2 className="size-3.5" /> Floating timer
        </button>
      </div>
    </aside>
  );
}
