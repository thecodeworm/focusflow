//! The authoritative timer.
//!
//! One `TimerService` lives in the Rust process. Windows never count time
//! themselves: they send commands and render the snapshots broadcast on
//! `timer://state`. A dedicated thread sleeps on a condition variable while
//! the timer is idle (zero CPU) and, while running, wakes once per displayed
//! second, aligned to the moment the visible digit changes.

pub mod engine;

use crate::clock::{self, ClockReading};
use crate::settings::Settings;
use crate::state::AppState;
use engine::{Completion, Engine, Phase, Status};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Sleep longer than this between two ticks is treated as a system suspend.
const SLEEP_DETECT_MS: u64 = 2_500;
/// While running, persist progress at most this often (crash recovery).
const PERSIST_EVERY_MS: u64 = 30_000;

pub const STATE_STORE: &str = "state.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub phase: Phase,
    pub status: Status,
    pub duration_ms: u64,
    pub remaining_ms: u64,
    pub completed_in_cycle: u32,
    pub long_break_interval: u32,
    pub session_id: u64,
    pub current_task_id: Option<i64>,
    /// Strictly increasing; lets windows drop snapshots that arrive late.
    pub seq: u64,
}

static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    engine: Engine,
    saved_at: i64,
    current_task_id: Option<i64>,
}

struct Inner {
    engine: Engine,
    last: ClockReading,
    current_task_id: Option<i64>,
    last_persist: u64,
}

pub struct TimerService {
    inner: Mutex<Inner>,
    cv: Condvar,
    app: AppHandle,
}

impl TimerService {
    /// Restores persisted state (settling anything that finished while the
    /// app was closed) and starts the ticker thread.
    pub fn start(app: &AppHandle, settings: &Settings) -> (Arc<TimerService>, Option<Completion>) {
        let d = settings.durations();
        let (engine, task, recovered) = match load_persisted(app) {
            Some(p) => {
                let (mut e, c) = p.engine.recover(p.saved_at, clock::wall_ms(), &d);
                e.apply_durations(&d);
                (e, p.current_task_id, c)
            }
            None => (Engine::new(&d), None, None),
        };
        let svc = Arc::new(TimerService {
            inner: Mutex::new(Inner {
                engine,
                last: clock::now(),
                current_task_id: task,
                last_persist: 0,
            }),
            cv: Condvar::new(),
            app: app.clone(),
        });
        let worker = svc.clone();
        std::thread::Builder::new()
            .name("ringlet-timer".into())
            .spawn(move || worker.run())
            .expect("spawn timer thread");
        (svc, recovered)
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn settings(&self) -> Settings {
        self.app.state::<AppState>().settings()
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        let s = self.settings();
        let g = self.lock();
        snapshot_of(&g, &s)
    }

    fn run(self: Arc<Self>) {
        let mut guard = self.lock();
        loop {
            if guard.engine.is_running() {
                let rem = guard.engine.remaining_ms();
                // Wake right after the displayed second changes.
                let mut wait = rem % 1000;
                if wait == 0 {
                    wait = 1000;
                }
                let (g, _) = self
                    .cv
                    .wait_timeout(guard, Duration::from_millis(wait + 4))
                    .unwrap_or_else(|p| p.into_inner());
                guard = g;
            } else {
                guard = self.cv.wait(guard).unwrap_or_else(|p| p.into_inner());
            }
            drop(guard);
            self.tick();
            guard = self.lock();
        }
    }

    /// Accounts elapsed monotonic time into the running session.
    fn tick(&self) {
        let settings = self.settings();
        let d = settings.durations();
        let now = clock::now();
        let mut g = self.lock();
        let awake = now.awake_ms.saturating_sub(g.last.awake_ms);
        let total = now.total_ms.saturating_sub(g.last.total_ms);
        g.last = now;
        let slept = total.saturating_sub(awake);
        let woke = slept > SLEEP_DETECT_MS;
        let delta = if settings.timer.count_sleep_time { total } else { awake };
        if !g.engine.is_running() {
            drop(g);
            if woke {
                crate::windows::on_system_wake(&self.app);
            }
            return;
        }
        let completion = g.engine.advance(delta, &d);
        let snap = snapshot_of(&g, &settings);
        let persist = completion.is_some() || woke || now.awake_ms.saturating_sub(g.last_persist) >= PERSIST_EVERY_MS;
        if persist {
            g.last_persist = now.awake_ms;
            persist_locked(&self.app, &g);
        }
        let task = g.current_task_id;
        drop(g);

        if woke {
            crate::windows::on_system_wake(&self.app);
        }
        match completion {
            Some(c) => self.finish(c, task, &settings, true),
            None => broadcast(&self.app, &snap, false),
        }
    }

    /// Runs a mutation on the engine, persists and broadcasts the result.
    pub fn command<F>(&self, f: F) -> TimerSnapshot
    where
        F: FnOnce(&mut Engine, &engine::Durations, i64) -> bool,
    {
        let settings = self.settings();
        let d = settings.durations();
        let mut g = self.lock();
        // Bring the session up to date before mutating, so a pause lands on
        // the exact remaining time.
        let now = clock::now();
        if g.engine.is_running() {
            let awake = now.awake_ms.saturating_sub(g.last.awake_ms);
            let total = now.total_ms.saturating_sub(g.last.total_ms);
            let delta = if settings.timer.count_sleep_time { total } else { awake };
            if let Some(c) = g.engine.advance(delta, &d) {
                g.last = now;
                persist_locked(&self.app, &g);
                let task = g.current_task_id;
                drop(g);
                // The session ended in the same instant as the command; the
                // completion wins and the command is dropped.
                self.finish(c, task, &settings, true);
                return self.snapshot();
            }
        }
        g.last = now;
        let changed = f(&mut g.engine, &d, clock::wall_ms());
        let snap = snapshot_of(&g, &settings);
        if changed {
            persist_locked(&self.app, &g);
        }
        drop(g);
        self.cv.notify_all();
        if changed {
            broadcast(&self.app, &snap, true);
        }
        snap
    }

    pub fn set_task(&self, id: Option<i64>) -> TimerSnapshot {
        let settings = self.settings();
        let mut g = self.lock();
        g.current_task_id = id;
        persist_locked(&self.app, &g);
        let snap = snapshot_of(&g, &settings);
        drop(g);
        broadcast(&self.app, &snap, true);
        snap
    }

    pub fn current_task(&self) -> Option<i64> {
        self.lock().current_task_id
    }

    /// Called after settings change: unstarted sessions pick up new lengths.
    pub fn settings_changed(&self) {
        let settings = self.settings();
        let mut g = self.lock();
        g.engine.apply_durations(&settings.durations());
        persist_locked(&self.app, &g);
        let snap = snapshot_of(&g, &settings);
        drop(g);
        // Always rebroadcast: the long-break interval may have changed too.
        broadcast(&self.app, &snap, true);
    }

    pub fn persist(&self) {
        let g = self.lock();
        persist_locked(&self.app, &g);
    }

    /// Handles a completed session exactly once: record, notify, chime,
    /// optionally auto-start the next one.
    pub fn finish(&self, c: Completion, task: Option<i64>, settings: &Settings, allow_autostart: bool) {
        let app = &self.app;
        let state = app.state::<AppState>();
        if c.phase == Phase::Focus {
            let task_id = if settings.timer.associate_tasks { task } else { None };
            let ended = clock::wall_ms();
            let rec = crate::db::NewSession {
                key: format!("{}:{}", c.session_id, c.started_at.unwrap_or(ended)),
                phase: "focus",
                started_at: c.started_at,
                ended_at: ended,
                duration_ms: c.duration_ms as i64,
                task_id,
                recovered: c.recovered,
            };
            if let Err(err) = state.db.record_session(&rec) {
                log::error!("failed to record session: {err}");
                let _ = app.emit("app://error", format!("Couldn't save the completed session: {err}"));
            }
            let _ = app.emit("stats://changed", ());
        }

        let auto = allow_autostart
            && !c.recovered
            && if c.next_phase.is_break() {
                settings.timer.auto_start_breaks
            } else {
                settings.timer.auto_start_focus
            };

        if settings.audio.sound_enabled && !c.recovered {
            crate::sound::play(&settings.audio.sound, settings.audio.sound_volume);
        }
        if settings.desktop.notifications {
            notify(app, &c, auto, settings);
        }
        let _ = app.emit("timer://completed", &c);

        if auto {
            self.command(|e, _, now| e.start(now));
        } else {
            let snap = self.snapshot();
            broadcast(app, &snap, true);
        }
    }
}

fn snapshot_of(g: &Inner, s: &Settings) -> TimerSnapshot {
    TimerSnapshot {
        phase: g.engine.phase,
        status: g.engine.status,
        duration_ms: g.engine.duration_ms,
        remaining_ms: g.engine.remaining_ms(),
        completed_in_cycle: g.engine.completed_in_cycle,
        long_break_interval: s.timer.long_break_interval,
        session_id: g.engine.session_id,
        current_task_id: g.current_task_id,
        seq: SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst),
    }
}

/// Sends the snapshot to windows. Plain ticks only go to visible windows so
/// hidden webviews don't re-render every second; state changes go to all.
pub fn broadcast(app: &AppHandle, snap: &TimerSnapshot, to_all: bool) {
    if to_all {
        let _ = app.emit("timer://state", snap);
    } else {
        for (label, w) in app.webview_windows() {
            if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
                let _ = app.emit_to(label.as_str(), "timer://state", snap);
            }
        }
    }
    crate::tray::update_timer(app, snap);
}

fn persist_locked(app: &AppHandle, g: &Inner) {
    use tauri_plugin_store::StoreExt;
    let p = Persisted {
        engine: g.engine.clone(),
        saved_at: clock::wall_ms(),
        current_task_id: g.current_task_id,
    };
    match app.store(STATE_STORE) {
        Ok(store) => {
            store.set("timer", serde_json::to_value(&p).unwrap_or_default());
            if let Err(e) = store.save() {
                log::warn!("failed to persist timer: {e}");
            }
        }
        Err(e) => log::warn!("state store unavailable: {e}"),
    }
}

fn load_persisted(app: &AppHandle) -> Option<Persisted> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STATE_STORE).ok()?;
    let v = store.get("timer")?;
    match serde_json::from_value::<Persisted>(v) {
        Ok(p) if p.engine.elapsed_ms <= p.engine.duration_ms && p.engine.duration_ms > 0 => Some(p),
        Ok(_) | Err(_) => {
            log::warn!("discarding unreadable timer state");
            None
        }
    }
}

fn notify(app: &AppHandle, c: &Completion, auto: bool, s: &Settings) {
    use tauri_plugin_notification::NotificationExt;
    let mins = |p: Phase| match p {
        Phase::Focus => s.timer.focus_minutes,
        Phase::ShortBreak => s.timer.short_break_minutes,
        Phase::LongBreak => s.timer.long_break_minutes,
    };
    let (title, body) = match (c.phase, c.recovered) {
        (Phase::Focus, true) => (
            "Focus session finished".to_string(),
            "It ended while Ringlet was closed and has been saved.".to_string(),
        ),
        (Phase::Focus, false) => {
            let next = c.next_phase.label().to_lowercase();
            let n = mins(c.next_phase);
            (
                "Focus session complete".to_string(),
                if auto {
                    format!("Your {n}-minute {next} has started.")
                } else {
                    format!("Nice work. Time for a {n}-minute {next}.")
                },
            )
        }
        (_, _) => (
            "Break's over".to_string(),
            if auto {
                "Your next focus session has started.".to_string()
            } else {
                "Ready for the next focus session?".to_string()
            },
        ),
    };
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("notification failed: {e}");
    }
}
