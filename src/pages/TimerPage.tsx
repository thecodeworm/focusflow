import { useEffect, useMemo } from "react";
import { CircleDot, ListChecks, RefreshCw } from "lucide-react";
import type { Preset } from "@/types";
import { api, errorMessage, on } from "@/lib/ipc";
import { formatClock, formatDuration, phaseLabel } from "@/lib/format";
import { todayTotals } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { useApp, useSettings } from "@/stores/app";
import { useTasks } from "@/stores/tasks";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
import { useTimerActions } from "@/hooks/useTimerActions";
import { useCompletion } from "@/hooks/useCompletion";
import { useNow, useSessions } from "@/hooks/useSessions";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressRing } from "@/components/timer/ProgressRing";
import { TimerControls } from "@/components/timer/TimerControls";
import { SessionDots } from "@/components/timer/SessionDots";
import { PhaseTabs } from "@/components/timer/PhaseTabs";
import { CompletionBadge } from "@/components/timer/CompletionBadge";
import { Card } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

function TaskCard() {
  const timer = useApp((s) => s.timer)!;
  const tasks = useTasks((s) => s.tasks);
  const refresh = useTasks((s) => s.refresh);
  const { setTask } = useTimerActions();
  useEffect(() => {
    void refresh();
    const un = on("tasks://changed", () => void refresh());
    return () => void un.then((f) => f());
  }, [refresh]);

  const open = tasks.filter((t) => !t.done);
  const options = [{ value: "none", label: "No task" }, ...open.map((t) => ({ value: String(t.id), label: t.title }))];
  const current = timer.currentTaskId != null && open.some((t) => t.id === timer.currentTaskId) ? String(timer.currentTaskId) : "none";

  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">
        <CircleDot className="size-3.5" /> Focusing on
      </div>
      {open.length === 0 ? (
        <div className="text-[12.5px] text-fg-2">
          <p>No open tasks.</p>
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => useUi.getState().setPage("tasks")}>
            <ListChecks /> Add a task
          </Button>
        </div>
      ) : (
        <Select
          aria-label="Current focus task"
          className="w-full"
          value={current}
          onValueChange={(v) => void setTask(v === "none" ? null : Number(v))}
          options={options}
        />
      )}
    </Card>
  );
}

function PresetCard() {
  const settings = useSettings();
  const presets = useApp((s) => s.presets);
  const all: Preset[] = [...presets, ...settings.timer.customPresets];
  const t = settings.timer;
  const matches = (p: Preset) =>
    p.focusMinutes === t.focusMinutes && p.shortBreakMinutes === t.shortBreakMinutes && p.longBreakMinutes === t.longBreakMinutes && p.longBreakInterval === t.longBreakInterval;

  const apply = async (id: string) => {
    try {
      useApp.getState().setSettings(await api.settings.applyPreset(id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-2.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">Rhythm</div>
      <div className="flex flex-col gap-1">
        {all.map((p) => {
          const active = matches(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => void apply(p.id)}
              className={cn(
                "flex h-9 items-center justify-between rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150",
                active ? "bg-accent/10 text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
              )}
            >
              <span className="truncate font-medium">{p.name}</span>
              <span className={cn("tabular shrink-0 text-[12px]", active ? "text-accent" : "text-fg-3")}>
                {p.focusMinutes}/{p.shortBreakMinutes}/{p.longBreakMinutes}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => useUi.getState().setPage("settings")} className="mt-2 px-2.5 text-[12px] text-fg-3 hover:text-fg-2">
        Custom durations…
      </button>
    </Card>
  );
}

export function TimerPage() {
  const timer = useApp((s) => s.timer)!;
  const settings = useSettings();
  const { restart } = useTimerActions();
  const completion = useCompletion();
  const { sessions } = useSessions(1);
  const now = useNow();
  const today = useMemo(() => (sessions ? todayTotals(sessions, now) : null), [sessions, now]);

  const subtitle = today
    ? today.sessions === 0
      ? "No sessions yet today"
      : `Today · ${today.sessions} session${today.sessions === 1 ? "" : "s"} · ${formatDuration(today.focusMs)} focused`
    : " ";

  const statusLine =
    timer.status === "running" ? "In progress" : timer.status === "paused" ? "Paused" : timer.phase === "focus" ? "Ready when you are" : "Take a breather";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Timer" subtitle={subtitle} />
      <div className="page-scroll scroll-area flex min-h-0 flex-1 gap-6 px-8 pb-8">
        <Card className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-6 py-8">
          <PhaseTabs timer={timer} />
          <div className="relative">
            <ProgressRing
              size={268}
              remainingMs={timer.remainingMs}
              durationMs={timer.durationMs}
              status={timer.status}
              phase={timer.phase}
              sessionId={timer.sessionId}
              ringStyle={settings.appearance.ringStyle}
              animate={settings.appearance.animations}
            >
              <span className="text-[12.5px] font-medium text-fg-2">{phaseLabel[timer.phase]}</span>
              <span className="tabular mt-1 text-[60px] leading-none font-semibold tracking-[-0.035em] text-fg">{formatClock(timer.remainingMs)}</span>
              <span className="mt-2 text-[12px] text-fg-3">{statusLine}</span>
              <SessionDots timer={timer} className="mt-3" />
            </ProgressRing>
            <CompletionBadge show={!!completion} label={completion?.phase === "focus" ? "Focus complete" : "Break over"} size={56} />
          </div>
          <TimerControls timer={timer} size="lg" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void restart()}
            disabled={timer.status === "idle" && timer.remainingMs === timer.durationMs}
            className="absolute right-3 bottom-3"
          >
            <RefreshCw /> Restart session
          </Button>
        </Card>
        <div className="flex w-[244px] shrink-0 flex-col gap-4">
          <TaskCard />
          <PresetCard />
          <p className="px-1 text-[11.5px] leading-relaxed text-fg-3">
            <kbd className="font-sans font-medium text-fg-2">Space</kbd> start/pause · <kbd className="font-sans font-medium text-fg-2">R</kbd> reset ·{" "}
            <kbd className="font-sans font-medium text-fg-2">S</kbd> skip
          </p>
        </div>
      </div>
    </div>
  );
}
