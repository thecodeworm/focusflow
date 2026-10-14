import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines,
  Bell,
  BellOff,
  Circle,
  CircleDot,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Minus,
  Music2,
  Pause,
  Pin,
  PinOff,
  Play,
  Repeat,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { MusicStatus, TimerSnapshot, WidgetSize } from "@/types";
import { api, on, sendTo } from "@/lib/ipc";
import { formatClock, phaseLabel } from "@/lib/format";
import { remainingFraction } from "@/lib/ring";
import { cn } from "@/lib/utils";
import { useApp, useSettings } from "@/stores/app";
import { useTasks } from "@/stores/tasks";
import { useTimerActions } from "@/hooks/useTimerActions";
import { useLocalShortcuts } from "@/hooks/useLocalShortcuts";
import { useCompletion } from "@/hooks/useCompletion";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { ProgressRing } from "@/components/timer/ProgressRing";
import { TimerControls } from "@/components/timer/TimerControls";
import { SessionDots } from "@/components/timer/SessionDots";
import { PhaseTabs } from "@/components/timer/PhaseTabs";
import { CompletionBadge } from "@/components/timer/CompletionBadge";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

const NEXT_SIZE: Record<WidgetSize, WidgetSize> = { compact: "standard", standard: "expanded", expanded: "compact" };
const SIZE_LABEL: Record<WidgetSize, string> = { compact: "Compact", standard: "Standard", expanded: "Expanded" };

function useMusicStatus(): MusicStatus | null {
  const [status, setStatus] = useState<MusicStatus | null>(null);
  useEffect(() => {
    const un = on("music://status", setStatus);
    void sendTo("main", "music://request", null);
    return () => void un.then((f) => f());
  }, []);
  return status;
}

function useCurrentTaskTitle(id: number | null): string | null {
  const tasks = useTasks((s) => s.tasks);
  const refresh = useTasks((s) => s.refresh);
  useEffect(() => {
    void refresh();
    const un = on("tasks://changed", () => void refresh());
    return () => void un.then((f) => f());
  }, [refresh]);
  if (id == null) return null;
  return tasks.find((t) => t.id === id)?.title ?? null;
}

function HeaderButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "flex size-6 items-center justify-center rounded-md transition-colors duration-150 hover:bg-hover active:bg-press [&_svg]:size-[13px]",
          active ? "text-accent" : "text-fg-3 hover:text-fg",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function PhaseBadge({ timer }: { timer: TimerSnapshot }) {
  const color = timer.phase === "focus" ? "bg-accent" : "bg-break";
  return (
    <span className="pointer-events-none flex items-center gap-1.5 text-[11.5px] font-medium text-fg-2">
      <span className={cn("size-[7px] rounded-full", color, timer.status !== "running" && "opacity-50")} />
      {phaseLabel[timer.phase]}
      {timer.status === "paused" && <span className="text-fg-3">· Paused</span>}
    </span>
  );
}

function Header({ timer, size }: { timer: TimerSnapshot; size: WidgetSize }) {
  const settings = useSettings();
  const update = useUpdateSettings();
  const pinned = settings.desktop.alwaysOnTop;
  return (
    <div data-tauri-drag-region="deep" className="flex h-[34px] shrink-0 items-center justify-between pr-1.5 pl-3.5">
      <PhaseBadge timer={timer} />
      <div className="flex items-center gap-0.5">
        <HeaderButton label={pinned ? "Unpin (stop floating on top)" : "Pin on top"} active={pinned} onClick={() => void api.window.togglePin()}>
          {pinned ? <Pin /> : <PinOff />}
        </HeaderButton>
        <HeaderButton
          label={`${SIZE_LABEL[NEXT_SIZE[size]]} size`}
          onClick={() => void update({ appearance: { widgetSize: NEXT_SIZE[size] } })}
        >
          {size === "expanded" ? <Minimize2 /> : <Maximize2 />}
        </HeaderButton>
        <HeaderButton label="Open dashboard" onClick={() => void api.window.openDashboard()}>
          <LayoutDashboard />
        </HeaderButton>
        <HeaderButton label="Hide floating timer" onClick={() => void api.window.hide("widget")}>
          <Minus />
        </HeaderButton>
      </div>
    </div>
  );
}

function TaskChip({ timer }: { timer: TimerSnapshot }) {
  const title = useCurrentTaskTitle(timer.currentTaskId);
  return (
    <button
      type="button"
      onClick={() => void api.window.openDashboard("tasks")}
      className="group flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors duration-150 hover:bg-hover"
    >
      {title ? <CircleDot className="size-3.5 shrink-0 text-accent" /> : <Circle className="size-3.5 shrink-0 text-fg-3" />}
      <span className={cn("truncate", title ? "font-medium text-fg" : "text-fg-3 group-hover:text-fg-2")}>{title ?? "Choose a focus task"}</span>
    </button>
  );
}

function MusicCard({ status }: { status: MusicStatus | null }) {
  const has = status && (status.source !== "none" || status.focusSound);
  const playing = status?.playing || status?.focusSoundPlaying;
  const noise = status?.focusSound ? `${status.focusSound[0]!.toUpperCase()}${status.focusSound.slice(1)} noise` : "";
  const title = status?.source !== "none" ? status?.title : noise;
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-xl bg-sunken px-2.5 dark:bg-black/20">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-2 shadow-soft">
        {status?.source === "none" && status?.focusSound ? <AudioLines className="size-3.5" /> : <Music2 className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        {has ? (
          <>
            <p className="truncate text-[12px] font-medium text-fg">{title || "Music"}</p>
            <p className="truncate text-[11px] text-fg-3">
              {status?.error ? status.error : playing ? "Playing" : "Paused"}
            </p>
          </>
        ) : (
          <p className="truncate text-[12px] text-fg-3">No music playing</p>
        )}
      </div>
      {has && (
        <Tooltip content={playing ? "Pause music" : "Play music"}>
          <button
            type="button"
            aria-label={playing ? "Pause music" : "Play music"}
            onClick={() => void sendTo("main", "music://command", { action: "toggle" })}
            className="flex size-7 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg active:scale-95"
          >
            {playing ? <Pause className="size-3.5" fill="currentColor" strokeWidth={0} /> : <Play className="size-3.5" fill="currentColor" strokeWidth={0} />}
          </button>
        </Tooltip>
      )}
      <Tooltip content="Open Music">
        <button
          type="button"
          aria-label="Open Music"
          onClick={() => void api.window.openDashboard("music")}
          className="flex size-7 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-hover hover:text-fg"
        >
          <LayoutDashboard className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

function QuickSettings() {
  const s = useSettings();
  const update = useUpdateSettings();
  const auto = s.timer.autoStartBreaks && s.timer.autoStartFocus;
  return (
    <div className="flex h-7 items-center justify-between px-1 text-[12px] text-fg-2">
      <label className="flex items-center gap-2">
        <Switch
          checked={auto}
          onCheckedChange={(v) => void update({ timer: { autoStartBreaks: v, autoStartFocus: v } })}
          aria-label="Auto-start sessions"
        />
        <span className="flex items-center gap-1">
          <Repeat className="size-3" /> Auto-start
        </span>
      </label>
      <div className="flex items-center gap-0.5">
        <HeaderButton
          label={s.audio.soundEnabled ? "Mute completion sound" : "Unmute completion sound"}
          onClick={() => void update({ audio: { soundEnabled: !s.audio.soundEnabled } })}
        >
          {s.audio.soundEnabled ? <Volume2 /> : <VolumeX />}
        </HeaderButton>
        <HeaderButton
          label={s.desktop.notifications ? "Turn off notifications" : "Turn on notifications"}
          onClick={() => void update({ desktop: { notifications: !s.desktop.notifications } })}
        >
          {s.desktop.notifications ? <Bell /> : <BellOff />}
        </HeaderButton>
      </div>
    </div>
  );
}

function Compact({ timer }: { timer: TimerSnapshot }) {
  const { toggle } = useTimerActions();
  const update = useUpdateSettings();
  const running = timer.status === "running";
  const fraction = remainingFraction(timer.remainingMs, timer.durationMs);
  const color = timer.phase === "focus" ? "var(--accent)" : "var(--break)";
  return (
    <div data-tauri-drag-region="deep" className="group relative flex h-full flex-col justify-center px-4">
      <div className="pointer-events-none flex items-center justify-between">
        <PhaseBadge timer={timer} />
      </div>
      <div className="pointer-events-none mt-0.5 flex items-center justify-between">
        <span className="tabular text-[30px] leading-none font-semibold tracking-[-0.02em] text-fg">{formatClock(timer.remainingMs)}</span>
        <button
          type="button"
          aria-label={running ? "Pause" : "Start"}
          onClick={toggle}
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full text-accent-fg transition-transform duration-150 active:scale-90"
          style={{ background: color }}
        >
          {running ? <Pause className="size-4" fill="currentColor" strokeWidth={0} /> : <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <HeaderButton label="Standard size" onClick={() => void update({ appearance: { widgetSize: "standard" } })}>
          <Maximize2 />
        </HeaderButton>
        <HeaderButton label="Hide floating timer" onClick={() => void api.window.hide("widget")}>
          <Minus />
        </HeaderButton>
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-[3px] bg-[var(--ring-track)]">
        <div
          className="h-full origin-left"
          style={{
            background: color,
            transform: `scaleX(${fraction})`,
            transition: running ? "transform 1000ms linear" : "transform 250ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

export default function WidgetApp() {
  const timer = useApp((s) => s.timer)!;
  const settings = useSettings();
  const size = settings.appearance.widgetSize;
  const completion = useCompletion();
  const music = useMusicStatus();
  useLocalShortcuts();

  const animate = settings.appearance.animations;
  const ringSize = size === "expanded" ? 176 : 204;
  const doneLabel = completion ? (completion.phase === "focus" ? "Focus complete" : "Break over") : "";

  return (
    <div className="widget-frame flex h-full flex-col overflow-hidden bg-surface text-fg">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={size}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {size === "compact" ? (
            <Compact timer={timer} />
          ) : (
            <>
              <Header timer={timer} size={size} />
              <div data-tauri-drag-region="deep" className="flex min-h-0 flex-1 flex-col items-center px-4 pb-3">
                {/* Pointer-transparent so drags reach the drag region behind it. */}
                <div className="pointer-events-none relative mt-1">
                  <ProgressRing
                    size={ringSize}
                    remainingMs={timer.remainingMs}
                    durationMs={timer.durationMs}
                    status={timer.status}
                    phase={timer.phase}
                    sessionId={timer.sessionId}
                    ringStyle={settings.appearance.ringStyle}
                    animate={animate}
                  >
                    <span className="tabular pointer-events-none text-[44px] leading-none font-semibold tracking-[-0.03em] text-fg">
                      {formatClock(timer.remainingMs)}
                    </span>
                    <SessionDots timer={timer} className="pointer-events-none mt-3" />
                  </ProgressRing>
                  <CompletionBadge show={!!completion} label={doneLabel} />
                </div>
                <TimerControls timer={timer} size="sm" className="mt-3" />
                {size === "standard" ? (
                  <div className="mt-auto flex w-full justify-center pt-1">
                    <TaskChip timer={timer} />
                  </div>
                ) : (
                  <div className="mt-3 flex w-full flex-col gap-2">
                    <div className="flex justify-center">
                      <PhaseTabs timer={timer} short size="sm" />
                    </div>
                    <div className="flex justify-center">
                      <TaskChip timer={timer} />
                    </div>
                    <MusicCard status={music} />
                    <QuickSettings />
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
