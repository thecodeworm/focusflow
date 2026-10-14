import { lazy, Suspense, useEffect } from "react";
import { MotionConfig } from "motion/react";
import { api, errorMessage, on } from "@/lib/ipc";
import { useApp, type WindowKind } from "@/stores/app";
import { toast } from "@/stores/toast";
import { useTheme } from "@/hooks/useTheme";
import { TooltipProvider } from "@/components/ui/tooltip";

// Each window only loads the code it needs.
const DashboardApp = lazy(() => import("./DashboardApp"));
const WidgetApp = lazy(() => import("./WidgetApp"));

function useBoot(kind: WindowKind) {
  useEffect(() => {
    useApp.setState({ kind });
    const unlisten: Promise<() => void>[] = [];
    let cancelled = false;

    // Subscribe first so nothing is missed between bootstrap and listen.
    unlisten.push(on("timer://state", (t) => useApp.getState().setTimer(t)));
    unlisten.push(on("settings://changed", (s) => useApp.getState().setSettings(s)));
    unlisten.push(on("shortcuts://status", (shortcuts) => useApp.setState({ shortcuts })));
    unlisten.push(on("window://visible", (visible) => useApp.setState({ visible })));
    if (kind === "main") {
      unlisten.push(on("app://error", (m) => toast.error(m)));
    }

    api
      .bootstrap()
      .then((b) => {
        if (cancelled) return;
        useApp.setState({
          ready: true,
          settings: b.settings,
          presets: b.presets,
          platform: b.platform,
          playerOrigin: b.playerOrigin,
          shortcuts: b.shortcuts,
          version: b.version,
        });
        useApp.getState().setTimer(b.timer);
        document.documentElement.dataset.platform = b.platform;
        for (const n of b.notices) toast.info(n);
      })
      .catch((e) => {
        if (!cancelled) useApp.setState({ bootError: errorMessage(e) });
      });

    return () => {
      cancelled = true;
      unlisten.forEach((p) => void p.then((f) => f()));
    };
  }, [kind]);
}

export function Root({ kind }: { kind: WindowKind }) {
  useBoot(kind);
  const ready = useApp((s) => s.ready);
  const bootError = useApp((s) => s.bootError);
  const settings = useApp((s) => s.settings);
  useTheme(settings);

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-fg-2">
        <div>
          <p className="font-medium text-fg">FocusFlow couldn't start this window.</p>
          <p className="mt-1">{bootError.includes("invoke") ? "FocusFlow needs to run as a desktop app (npm run app:dev)." : bootError}</p>
        </div>
      </div>
    );
  }
  // No splash screen: the window stays blank for the few ms boot takes.
  if (!ready || !settings) return null;

  return (
    <MotionConfig reducedMotion={settings.appearance.animations ? "user" : "always"}>
      <TooltipProvider>
        <Suspense fallback={null}>{kind === "widget" ? <WidgetApp /> : <DashboardApp />}</Suspense>
      </TooltipProvider>
    </MotionConfig>
  );
}
