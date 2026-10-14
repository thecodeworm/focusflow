import { useMemo } from "react";
import { CalendarDays, Clock, Flame, Target } from "lucide-react";
import { formatDuration, formatHours } from "@/lib/format";
import { currentStreak, lastNDays, taskBreakdown, todayTotals, type DayBucket } from "@/lib/stats";
import { useNow, useSessions } from "@/hooks/useSessions";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/section";
import { cn } from "@/lib/utils";

function Tile({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-fg-2">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="tabular mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-fg">{value}</div>
      {hint && <div className="mt-1.5 text-[11.5px] text-fg-3">{hint}</div>}
    </Card>
  );
}

function WeekChart({ days }: { days: DayBucket[] }) {
  const max = Math.max(...days.map((d) => d.focusMs), 25 * 60_000);
  const total = days.reduce((a, d) => a + d.focusMs, 0);
  const H = 150;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-fg">Last 7 days</h3>
        <span className="text-[12px] text-fg-2">{formatDuration(total)} focused</span>
      </div>
      <div className="mt-5 flex items-end gap-3" style={{ height: H + 36 }} role="img" aria-label={`Focus time over the last 7 days: ${days.map((d) => `${d.label} ${formatDuration(d.focusMs)}`).join(", ")}`}>
        {days.map((d, i) => {
          const h = d.focusMs === 0 ? 3 : Math.max(6, Math.round((d.focusMs / max) * H));
          const today = i === days.length - 1;
          return (
            <div key={d.key} className="group flex flex-1 flex-col items-center justify-end gap-2">
              <span className="tabular text-[11px] text-fg-2 opacity-0 transition-opacity group-hover:opacity-100">{d.focusMs ? formatDuration(d.focusMs) : ""}</span>
              <div
                className={cn("w-full max-w-[44px] rounded-md transition-[height] duration-300", today ? "bg-accent" : d.focusMs ? "bg-fg-3/45" : "bg-line")}
                style={{ height: h }}
                title={`${d.label}: ${formatDuration(d.focusMs)} · ${d.sessions} session${d.sessions === 1 ? "" : "s"}`}
              />
              <span className={cn("text-[11.5px]", today ? "font-semibold text-fg" : "text-fg-3")}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function StatsPage() {
  const { sessions, summary } = useSessions(400);
  const now = useNow();
  const data = useMemo(() => {
    if (!sessions) return null;
    return {
      today: todayTotals(sessions, now),
      week: lastNDays(sessions, now, 7),
      streak: currentStreak(sessions, now),
      tasks: taskBreakdown(sessions).slice(0, 8),
    };
  }, [sessions, now]);

  if (!data || !summary) return <div className="flex-1" />;
  const maxTask = Math.max(1, ...data.tasks.map((t) => t.sessions));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Statistics" subtitle="Completed focus sessions only — reset or skipped sessions don't count" />
      <div className="page-scroll scroll-area flex min-h-0 flex-1 flex-col gap-4 px-8 pb-8">
        <div className="grid grid-cols-4 gap-3">
          <Tile icon={Clock} label="Today" value={formatDuration(data.today.focusMs)} hint="focus time" />
          <Tile icon={Target} label="Sessions today" value={String(data.today.sessions)} hint="pomodoros" />
          <Tile icon={Flame} label="Streak" value={`${data.streak} day${data.streak === 1 ? "" : "s"}`} hint="in a row" />
          <Tile icon={CalendarDays} label="All time" value={formatHours(summary.totalFocusMs)} hint={`${summary.totalSessions} sessions`} />
        </div>
        <WeekChart days={data.week} />
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-fg">Sessions by task</h3>
            <span className="text-[12px] text-fg-2">{summary.taskSessions} of {summary.totalSessions} linked to a task</span>
          </div>
          {data.tasks.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-fg-3">Select a focus task before starting a session to see it here.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {data.tasks.map((t) => (
                <li key={t.key} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-[12.5px]">
                  <span className="truncate text-fg">{t.title}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${(t.sessions / maxTask) * 100}%` }} />
                  </div>
                  <span className="tabular text-fg-2">
                    {t.sessions} · {formatDuration(t.focusMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
