import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleDot, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import type { Task } from "@/types";
import { api, errorMessage, on } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useApp } from "@/stores/app";
import { useTasks } from "@/stores/tasks";
import { toast } from "@/stores/toast";
import { useTimerActions } from "@/hooks/useTimerActions";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";

async function attempt(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

function TaskRow({ task, current }: { task: Task; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const { setTask } = useTimerActions();

  const save = () => {
    const t = title.trim();
    setEditing(false);
    if (t && t !== task.title) void attempt(api.tasks.update(task.id, { title: t }));
    else setTitle(task.title);
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
      className={cn("group flex items-center gap-3 px-3.5 py-2", current && "bg-accent/6")}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        onClick={() => void attempt(api.tasks.update(task.id, { done: !task.done }))}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          task.done ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:border-accent",
        )}
      >
        {task.done && <Check className="size-3" strokeWidth={3} />}
      </button>
      {editing ? (
        <Input
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setTitle(task.title);
              setEditing(false);
            }
          }}
          aria-label="Task title"
          className="h-7 flex-1"
        />
      ) : (
        <span
          onDoubleClick={() => !task.done && setEditing(true)}
          className={cn("min-w-0 flex-1 truncate text-[13.5px]", task.done ? "text-fg-3 line-through" : "text-fg")}
        >
          {task.title}
        </span>
      )}
      {current && !editing && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
          <CircleDot className="size-3" /> Focusing
        </span>
      )}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          {!task.done && (
            <Tooltip content={current ? "Stop focusing on this" : "Focus on this task"}>
              <Button size="icon-sm" variant="ghost" aria-label={current ? "Clear focus task" : "Focus on this task"} onClick={() => void setTask(current ? null : task.id)}>
                {current ? <X /> : <Target />}
              </Button>
            </Tooltip>
          )}
          {!task.done && (
            <Tooltip content="Rename">
              <Button size="icon-sm" variant="ghost" aria-label="Rename task" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Delete">
            <Button size="icon-sm" variant="ghost" aria-label="Delete task" onClick={() => void attempt(api.tasks.remove(task.id))}>
              <Trash2 />
            </Button>
          </Tooltip>
        </div>
      )}
    </motion.li>
  );
}

export function TasksPage() {
  const tasks = useTasks((s) => s.tasks);
  const loaded = useTasks((s) => s.loaded);
  const refresh = useTasks((s) => s.refresh);
  const currentId = useApp((s) => s.timer?.currentTaskId ?? null);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
    const un = on("tasks://changed", () => void refresh());
    return () => void un.then((f) => f());
  }, [refresh]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    try {
      const task = await api.tasks.add(t);
      setDraft("");
      // The first task you add becomes your focus if nothing is selected.
      if (currentId == null) await api.timer.setTask(task.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Tasks"
        subtitle={open.length ? `${open.length} open · double-click a task to rename it` : "Keep it short — what will you focus on?"}
        actions={
          done.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void attempt(api.tasks.clearCompleted())}>
              Clear completed
            </Button>
          )
        }
      />
      <div className="page-scroll scroll-area flex min-h-0 flex-1 flex-col gap-5 px-8 pb-8">
        <form onSubmit={add} className="flex gap-2">
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
            <Input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task and press Enter" aria-label="New task" maxLength={200} className="h-9 pl-8" />
          </div>
          <Button type="submit" variant="primary" size="lg" className="h-9" disabled={!draft.trim()}>
            Add
          </Button>
        </form>

        {loaded && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <Target className="size-6 text-fg-3" />
            <p className="mt-2 text-[13.5px] font-medium text-fg">No tasks yet</p>
            <p className="mt-1 max-w-[320px] text-[12.5px] text-fg-2">
              Add what you're working on. Completed focus sessions are linked to the selected task in your statistics.
            </p>
          </div>
        )}

        {open.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
            <AnimatePresence initial={false}>
              {open.map((t) => (
                <TaskRow key={t.id} task={t} current={t.id === currentId} />
              ))}
            </AnimatePresence>
          </ul>
        )}

        {done.length > 0 && (
          <section>
            <h3 className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">Completed</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
              <AnimatePresence initial={false}>
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} current={false} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
