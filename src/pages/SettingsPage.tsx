import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, Check, Download, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import type { Accent, CloseBehavior, RingStyle, ShortcutAction, SoundName, ThemeSetting, WidgetSize } from "@/types";
import { api, errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useApp, useSettings } from "@/stores/app";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { useDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/layout/PageHeader";
import { Row, RowGroup, SectionTitle } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ShortcutRecorder } from "@/components/settings/ShortcutRecorder";

type Tab = "timer" | "appearance" | "desktop" | "audio" | "data";

function TimerTab() {
  const s = useSettings();
  const update = useUpdateSettings();
  const [presetName, setPresetName] = useState("");
  const t = s.timer;

  const savePreset = async () => {
    try {
      useApp.getState().setSettings(await api.settings.savePreset(presetName));
      setPresetName("");
      toast.success("Preset saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <section>
        <SectionTitle>Durations</SectionTitle>
        <RowGroup>
          <Row label="Focus" description="Length of each focus session.">
            <NumberField aria-label="Focus minutes" value={t.focusMinutes} min={1} max={180} suffix="min" onChange={(v) => void update({ timer: { focusMinutes: v, presetId: "custom" } })} />
          </Row>
          <Row label="Short break">
            <NumberField aria-label="Short break minutes" value={t.shortBreakMinutes} min={1} max={60} suffix="min" onChange={(v) => void update({ timer: { shortBreakMinutes: v, presetId: "custom" } })} />
          </Row>
          <Row label="Long break">
            <NumberField aria-label="Long break minutes" value={t.longBreakMinutes} min={1} max={90} suffix="min" onChange={(v) => void update({ timer: { longBreakMinutes: v, presetId: "custom" } })} />
          </Row>
          <Row label="Long break every" description="Number of completed focus sessions before a long break.">
            <NumberField aria-label="Long break interval" value={t.longBreakInterval} min={1} max={12} onChange={(v) => void update({ timer: { longBreakInterval: v, presetId: "custom" } })} />
          </Row>
        </RowGroup>
        <p className="mt-2 px-1 text-[11.5px] text-fg-3">A session already in progress keeps its length; changes apply from the next session.</p>
      </section>

      <section>
        <SectionTitle>Custom presets</SectionTitle>
        <RowGroup>
          {t.customPresets.map((p) => (
            <Row key={p.id} label={p.name} description={`${p.focusMinutes} / ${p.shortBreakMinutes} / ${p.longBreakMinutes} min · long break every ${p.longBreakInterval}`}>
              <Button size="sm" variant="secondary" onClick={() => void api.settings.applyPreset(p.id).then((n) => useApp.getState().setSettings(n)).catch((e) => toast.error(errorMessage(e)))}>
                Apply
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete preset ${p.name}`} onClick={() => void api.settings.deletePreset(p.id).then((n) => useApp.getState().setSettings(n)).catch((e) => toast.error(errorMessage(e)))}>
                <Trash2 />
              </Button>
            </Row>
          ))}
          <form
            className="flex items-center gap-2 px-4 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void savePreset();
            }}
          >
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Save current durations as…" aria-label="Preset name" maxLength={40} />
            <Button type="submit" size="md" disabled={!presetName.trim()}>
              Save preset
            </Button>
          </form>
        </RowGroup>
      </section>

      <section>
        <SectionTitle>Flow</SectionTitle>
        <RowGroup>
          <Row label="Start breaks automatically" description="Begin the break as soon as a focus session ends.">
            <Switch checked={t.autoStartBreaks} onCheckedChange={(v) => void update({ timer: { autoStartBreaks: v } })} aria-label="Start breaks automatically" />
          </Row>
          <Row label="Start focus automatically" description="Begin the next focus session when a break ends.">
            <Switch checked={t.autoStartFocus} onCheckedChange={(v) => void update({ timer: { autoStartFocus: v } })} aria-label="Start focus automatically" />
          </Row>
          <Row label="Count time asleep" description="When the computer sleeps during a running session, keep counting down. Turn off to pause the countdown while asleep.">
            <Switch checked={t.countSleepTime} onCheckedChange={(v) => void update({ timer: { countSleepTime: v } })} aria-label="Count time asleep" />
          </Row>
          <Row label="Link sessions to the focus task" description="Completed sessions are attributed to the selected task in Statistics.">
            <Switch checked={t.associateTasks} onCheckedChange={(v) => void update({ timer: { associateTasks: v } })} aria-label="Link sessions to task" />
          </Row>
        </RowGroup>
      </section>
    </>
  );
}

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: "coral", label: "Coral", color: "#FF725E" },
  { value: "ocean", label: "Ocean", color: "#3D7BF2" },
  { value: "violet", label: "Violet", color: "#7A68EC" },
  { value: "forest", label: "Forest", color: "#2F9467" },
  { value: "amber", label: "Amber", color: "#E38A2B" },
  { value: "graphite", label: "Graphite", color: "#3F3F44" },
];

function AppearanceTab() {
  const s = useSettings();
  const update = useUpdateSettings();
  const a = s.appearance;
  const [opacity, setOpacity] = useDraft(a.widgetOpacity);

  return (
    <>
      <section>
        <SectionTitle>Theme</SectionTitle>
        <RowGroup>
          <Row label="Appearance">
            <Segmented<ThemeSetting>
              aria-label="Appearance"
              value={a.theme}
              onChange={(v) => void update({ appearance: { theme: v } })}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Row>
          <Row label="Accent color">
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={a.accent === c.value}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => void update({ appearance: { accent: c.value } })}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow duration-150",
                    a.accent === c.value ? "ring-2 ring-[var(--text-3)]" : "hover:ring-2 hover:ring-line-strong",
                  )}
                  style={{ background: c.color }}
                >
                  {a.accent === c.value && <Check className="size-3 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Animations" description="Smooth transitions throughout Ringlet. The system's Reduce Motion setting is always respected.">
            <Switch checked={a.animations} onCheckedChange={(v) => void update({ appearance: { animations: v } })} aria-label="Animations" />
          </Row>
          <Row label="Compact dashboard" description="Tighter spacing in this window.">
            <Switch checked={a.compactMode} onCheckedChange={(v) => void update({ appearance: { compactMode: v } })} aria-label="Compact dashboard" />
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>Floating timer</SectionTitle>
        <RowGroup>
          <Row label="Size" description="Compact shows just the countdown; Expanded adds your task, music and quick settings.">
            <Segmented<WidgetSize>
              aria-label="Widget size"
              value={a.widgetSize}
              onChange={(v) => void update({ appearance: { widgetSize: v } })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "standard", label: "Standard" },
                { value: "expanded", label: "Expanded" },
              ]}
            />
          </Row>
          <Row label="Opacity">
            <div className="flex items-center gap-3">
              <Slider
                aria-label="Widget opacity"
                className="w-36"
                min={0.4}
                max={1}
                step={0.05}
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v ?? 1)}
                onValueCommit={([v]) => void update({ appearance: { widgetOpacity: v ?? 1 } })}
              />
              <span className="tabular w-9 text-right text-[12px] text-fg-2">{Math.round(opacity * 100)}%</span>
            </div>
          </Row>
          <Row label="Progress ring">
            <Segmented<RingStyle>
              aria-label="Progress ring style"
              value={a.ringStyle}
              onChange={(v) => void update({ appearance: { ringStyle: v } })}
              options={[
                { value: "thin", label: "Thin" },
                { value: "regular", label: "Regular" },
                { value: "bold", label: "Bold" },
              ]}
            />
          </Row>
        </RowGroup>
      </section>
    </>
  );
}

const SHORTCUTS: { action: ShortcutAction; label: string }[] = [
  { action: "toggleTimer", label: "Start / pause timer" },
  { action: "resetTimer", label: "Reset current session" },
  { action: "toggleWidget", label: "Show / hide floating timer" },
  { action: "openDashboard", label: "Open dashboard" },
  { action: "togglePin", label: "Toggle always on top" },
];

function NotificationRow() {
  const s = useSettings();
  const update = useUpdateSettings();
  const [perm, setPerm] = useState<string | null>(null);
  useEffect(() => {
    void api.notifications.permission().then(setPerm).catch(() => setPerm("unknown"));
  }, []);
  const test = async () => {
    try {
      const p = await api.notifications.request();
      setPerm(p);
      await api.notifications.test();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const denied = perm === "denied";
  return (
    <Row
      label="Desktop notifications"
      description={
        denied ? (
          <span className="flex items-center gap-1 text-danger">
            <AlertTriangle className="size-3" /> Notifications are blocked. Allow Ringlet in your system's notification settings.
          </span>
        ) : (
          "Notify when a session ends. If nothing appears, check your system's notification settings for Ringlet."
        )
      }
    >
      <Button size="sm" variant="ghost" onClick={() => void test()} disabled={!s.desktop.notifications}>
        <BellRing /> Test
      </Button>
      <Switch checked={s.desktop.notifications} onCheckedChange={(v) => void update({ desktop: { notifications: v } })} aria-label="Desktop notifications" />
    </Row>
  );
}

function DesktopTab() {
  const s = useSettings();
  const platform = useApp((st) => st.platform);
  const status = useApp((st) => st.shortcuts);
  const update = useUpdateSettings();
  const d = s.desktop;
  const mac = platform === "macos";

  return (
    <>
      <section>
        <SectionTitle>Window</SectionTitle>
        <RowGroup>
          <Row label="Keep floating timer on top" description="Stays above other app windows. System overlays such as the lock screen can still cover it.">
            <Switch checked={d.alwaysOnTop} onCheckedChange={(v) => void update({ desktop: { alwaysOnTop: v } })} aria-label="Always on top" />
          </Row>
          {mac && (
            <Row
              label="Show over full-screen apps"
              description="Keep the floating timer visible over apps in full-screen Spaces, without taking focus from them."
            >
              <Switch checked={d.showOverFullscreen} onCheckedChange={(v) => void update({ desktop: { showOverFullscreen: v } })} aria-label="Show over full-screen apps" />
            </Row>
          )}
          {mac && !d.showOverFullscreen && (
            <Row label="Show on all Spaces" description="Follow you when switching desktops (Spaces).">
              <Switch checked={d.allWorkspaces} onCheckedChange={(v) => void update({ desktop: { allWorkspaces: v } })} aria-label="Show on all Spaces" />
            </Row>
          )}
          <Row label="When closing the dashboard">
            <Select<CloseBehavior>
              aria-label="Close behavior"
              value={d.closeBehavior}
              onValueChange={(v) => void update({ desktop: { closeBehavior: v } })}
              options={[
                { value: "hide", label: mac ? "Hide to menu bar" : "Hide to tray" },
                { value: "minimize", label: mac ? "Minimize to Dock" : "Minimize to taskbar" },
                { value: "quit", label: "Quit Ringlet" },
              ]}
            />
          </Row>
          <Row label="Show floating timer at launch">
            <Switch checked={d.showWidgetOnLaunch} onCheckedChange={(v) => void update({ desktop: { showWidgetOnLaunch: v } })} aria-label="Show floating timer at launch" />
          </Row>
          <Row label="Open dashboard at launch" description="Skipped when Ringlet starts at login.">
            <Switch checked={d.showDashboardOnLaunch} onCheckedChange={(v) => void update({ desktop: { showDashboardOnLaunch: v } })} aria-label="Open dashboard at launch" />
          </Row>
          <Row label="Launch at login">
            <Switch checked={d.launchAtLogin} onCheckedChange={(v) => void update({ desktop: { launchAtLogin: v } })} aria-label="Launch at login" />
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>{mac ? "Menu bar" : "System tray"}</SectionTitle>
        <RowGroup>
          <Row
            label={mac ? "Show in menu bar" : "Show in system tray"}
            description={mac ? undefined : "If hidden, closing the dashboard minimizes it instead."}
          >
            <Switch checked={d.showTray} onCheckedChange={(v) => void update({ desktop: { showTray: v } })} aria-label="Show tray icon" />
          </Row>
          <Row label={mac ? "Show remaining time in menu bar" : "Show remaining time in tray tooltip"}>
            <Switch checked={d.showTrayTime} disabled={!d.showTray} onCheckedChange={(v) => void update({ desktop: { showTrayTime: v } })} aria-label="Show remaining time" />
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>Notifications</SectionTitle>
        <RowGroup>
          <NotificationRow />
          <Row label="Pause videos when the dashboard is hidden" description="YouTube expects its player to be visible while playing. Direct audio and focus sounds keep playing.">
            <Switch checked={d.pauseVideoWhenHidden} onCheckedChange={(v) => void update({ desktop: { pauseVideoWhenHidden: v } })} aria-label="Pause videos when hidden" />
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle
          action={
            <label className="flex items-center gap-2 text-[12px] text-fg-2">
              Enabled
              <Switch checked={d.shortcuts.enabled} onCheckedChange={(v) => void update({ desktop: { shortcuts: { ...d.shortcuts, enabled: v } } })} aria-label="Enable global shortcuts" />
            </label>
          }
        >
          Global shortcuts
        </SectionTitle>
        <RowGroup>
          {SHORTCUTS.map(({ action, label }) => {
            const st = status.find((x) => x.action === action);
            return (
              <Row
                key={action}
                label={label}
                description={st?.error ? <span className="text-danger">{st.error}</span> : undefined}
              >
                <ShortcutRecorder
                  label={label}
                  platform={platform}
                  value={d.shortcuts[action]}
                  disabled={!d.shortcuts.enabled}
                  onChange={(accel) => void update({ desktop: { shortcuts: { ...d.shortcuts, [action]: accel } } })}
                />
              </Row>
            );
          })}
        </RowGroup>
        <p className="mt-2 px-1 text-[11.5px] text-fg-3">Shortcuts work system-wide, even when Ringlet is in the background. Use at least one modifier key.</p>
      </section>
    </>
  );
}

const SOUNDS: { value: SoundName; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "soft", label: "Soft" },
  { value: "digital", label: "Digital" },
];

function AudioTab() {
  const s = useSettings();
  const update = useUpdateSettings();
  const a = s.audio;
  const [vol, setVol] = useDraft(a.soundVolume);
  const [musicVol, setMusicVol] = useDraft(a.musicVolume);
  return (
    <>
      <section>
        <SectionTitle>Session sounds</SectionTitle>
        <RowGroup>
          <Row label="Play a sound when a session ends">
            <Switch checked={a.soundEnabled} onCheckedChange={(v) => void update({ audio: { soundEnabled: v } })} aria-label="Completion sound" />
          </Row>
          <Row label="Sound">
            <Button size="icon-sm" variant="ghost" aria-label="Preview sound" onClick={() => void api.sound.preview(a.sound, vol)}>
              <Play fill="currentColor" strokeWidth={0} />
            </Button>
            <Select<SoundName> aria-label="Completion sound" value={a.sound} onValueChange={(v) => { void update({ audio: { sound: v } }); void api.sound.preview(v, vol); }} options={SOUNDS} />
          </Row>
          <Row label="Volume">
            <Slider
              aria-label="Notification volume"
              className="w-40"
              min={0}
              max={1}
              step={0.05}
              value={[vol]}
              onValueChange={([v]) => setVol(v ?? 0)}
              onValueCommit={([v]) => {
                void update({ audio: { soundVolume: v ?? 0 } });
                void api.sound.preview(a.sound, v ?? 0);
              }}
            />
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>Music</SectionTitle>
        <RowGroup>
          <Row label="Default music volume">
            <Slider aria-label="Default music volume" className="w-40" min={0} max={1} step={0.05} value={[musicVol]} onValueChange={([v]) => setMusicVol(v ?? 0)} onValueCommit={([v]) => void update({ audio: { musicVolume: v ?? 0 } })} />
          </Row>
          <Row label="Loop music" description="Repeat a video, playlist or audio file when it ends.">
            <Switch checked={a.loopMusic} onCheckedChange={(v) => void update({ audio: { loopMusic: v } })} aria-label="Loop music" />
          </Row>
          <Row label="Favorites" description={`${a.favorites.length} saved link${a.favorites.length === 1 ? "" : "s"}`}>
            <Button size="sm" variant="secondary" onClick={() => useUi.getState().setPage("music")}>
              Manage in Music
            </Button>
          </Row>
        </RowGroup>
      </section>
    </>
  );
}

function DataTab() {
  const version = useApp((s) => s.version);
  const [confirm, setConfirm] = useState<"stats" | "reset" | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      const r = await fn();
      if (r !== false && r !== null) toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <section>
        <SectionTitle>Settings</SectionTitle>
        <RowGroup>
          <Row label="Export settings" description="Save your preferences, presets and favorites to a file.">
            <Button size="sm" onClick={() => void run(api.settings.exportFile, "Settings exported.")}>
              <Download /> Export…
            </Button>
          </Row>
          <Row label="Import settings" description="Replace your preferences with a Ringlet export.">
            <Button
              size="sm"
              onClick={() =>
                void run(async () => {
                  const s = await api.settings.importFile();
                  if (s) useApp.getState().setSettings(s);
                  return s;
                }, "Settings imported.")
              }
            >
              <Upload /> Import…
            </Button>
          </Row>
          <Row label="Reset preferences" description="Restore default settings. Favorites, presets and history are kept.">
            <Button size="sm" variant="secondary" onClick={() => setConfirm("reset")}>
              <RotateCcw /> Reset…
            </Button>
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>History</SectionTitle>
        <RowGroup>
          <Row label="Clear statistics" description="Permanently delete all completed-session history. Tasks are kept.">
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm("stats")}>
              <Trash2 /> Clear…
            </Button>
          </Row>
        </RowGroup>
      </section>
      <section>
        <SectionTitle>About</SectionTitle>
        <RowGroup>
          <Row label={`Ringlet ${version}`} description="Everything stays on this computer. No accounts, analytics or telemetry." />
          <Row label="Quit Ringlet" description="Stops the timer process. A running session resumes next time you open Ringlet.">
            <Button size="sm" variant="secondary" onClick={() => void api.window.quit()}>
              Quit
            </Button>
          </Row>
        </RowGroup>
      </section>
      <ConfirmDialog
        open={confirm === "stats"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Clear all statistics?"
        description="This permanently deletes your completed-session history. This can't be undone."
        confirmLabel="Clear statistics"
        destructive
        onConfirm={() => void run(api.stats.clear, "Statistics cleared.")}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset preferences?"
        description="Durations, appearance, desktop, shortcut and sound settings return to their defaults."
        confirmLabel="Reset"
        onConfirm={() =>
          void run(async () => {
            useApp.getState().setSettings(await api.settings.reset());
          }, "Preferences reset.")
        }
      />
    </>
  );
}

const TABS: { value: Tab; label: string }[] = [
  { value: "timer", label: "Timer" },
  { value: "appearance", label: "Appearance" },
  { value: "desktop", label: "Desktop" },
  { value: "audio", label: "Audio" },
  { value: "data", label: "Data" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("timer");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Settings" actions={<Segmented<Tab> aria-label="Settings section" value={tab} onChange={setTab} options={TABS} size="sm" />} />
      <div className="page-scroll scroll-area flex min-h-0 flex-1 flex-col gap-6 px-8 pb-10">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          {tab === "timer" && <TimerTab />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "desktop" && <DesktopTab />}
          {tab === "audio" && <AudioTab />}
          {tab === "data" && <DataTab />}
        </div>
      </div>
    </div>
  );
}
