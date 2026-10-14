import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Page } from "@/types";
import { on } from "@/lib/ipc";
import { useUi } from "@/stores/ui";
import { useMusic } from "@/stores/music";
import { useLocalShortcuts } from "@/hooks/useLocalShortcuts";
import { useMusicSync } from "@/hooks/useMusicSync";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/layout/Toaster";
import { YouTubeStage } from "@/components/music/YouTubeStage";
import { TimerPage } from "@/pages/TimerPage";
import { MusicPage } from "@/pages/MusicPage";
import { TasksPage } from "@/pages/TasksPage";
import { StatsPage } from "@/pages/StatsPage";
import { SettingsPage } from "@/pages/SettingsPage";

const PAGES: Record<Page, () => React.ReactNode> = {
  timer: () => <TimerPage />,
  music: () => <MusicPage />,
  tasks: () => <TasksPage />,
  stats: () => <StatsPage />,
  settings: () => <SettingsPage />,
};

export default function DashboardApp() {
  const page = useUi((s) => s.page);
  const ytDocked = useMusic((s) => s.source?.kind === "youtube") && page !== "music";
  useMusicSync();
  useLocalShortcuts(page === "timer");

  useEffect(() => {
    const un = on("nav://goto", (p) => {
      if (p in PAGES) useUi.getState().setPage(p);
    });
    return () => void un.then((f) => f());
  }, []);

  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col bg-bg" data-docked={ytDocked || undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            className="flex min-h-0 flex-1 flex-col"
            // Opacity only: the Music page measures its player slot on mount,
            // so pages must not move while entering.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {PAGES[page]()}
          </motion.div>
        </AnimatePresence>
      </main>
      <YouTubeStage />
      <Toaster />
    </div>
  );
}
