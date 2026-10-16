//! Ringlet — native backend.
//!
//! Module map:
//! * `timer`     — authoritative Pomodoro engine + ticker thread
//! * `clock`     — monotonic clocks with/without sleep time
//! * `settings`  — preferences schema, validation, tolerant loading
//! * `db`        — SQLite tasks + session history
//! * `windows`   — widget/dashboard creation, sizing, positioning
//! * `platform`  — small macOS / Windows window tweaks (public APIs only)
//! * `tray`      — menu bar / notification-area icon
//! * `shortcuts` — global keyboard shortcuts
//! * `sound`     — synthesized completion chimes
//! * `player_server` — loopback host for the YouTube embed page
//! * `updater`   — background auto-update from GitHub Releases
//! * `commands`  — typed IPC surface

mod clock;
mod commands;
mod db;
mod media_url;
mod platform;
mod player_server;
mod settings;
mod shortcuts;
mod sound;
mod state;
mod timer;
mod tray;
mod updater;
mod windows;

use settings::Settings;
use state::AppState;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_store::StoreExt;

pub const SETTINGS_STORE: &str = "settings.json";

/// Quits intentionally, persisting the timer first so it can be restored.
pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.quitting.store(true, Ordering::SeqCst);
    if let Some(t) = state.timer.get() {
        t.persist();
    }
    updater::install_on_quit(app);
    app.exit(0);
}

/// Moves an unreadable JSON file aside so the store plugin starts clean
/// instead of silently overwriting it. Returns true if the file was corrupt.
fn quarantine_if_corrupt(path: &Path) -> bool {
    let Ok(bytes) = std::fs::read(path) else { return false };
    if serde_json::from_slice::<serde_json::Value>(&bytes).is_ok() {
        return false;
    }
    let ts = clock::wall_ms();
    let backup = path.with_extension(format!("corrupt-{ts}.json"));
    let _ = std::fs::rename(path, &backup);
    log::warn!("moved corrupt {} to {}", path.display(), backup.display());
    true
}

fn load_settings(app: &AppHandle, notices: &mut Vec<String>) -> Settings {
    let store = match app.store(SETTINGS_STORE) {
        Ok(s) => s,
        Err(e) => {
            notices.push(format!("Settings storage is unavailable ({e}); using defaults for now."));
            return Settings::default();
        }
    };
    let settings = match store.get("settings") {
        Some(v) => {
            let (s, clean) = Settings::from_value_tolerant(&v);
            if !clean {
                notices.push("Some settings couldn't be read and were restored to their defaults.".into());
            }
            s
        }
        None => Settings::default(),
    };
    store.set("settings", serde_json::to_value(&settings).unwrap_or_default());
    let _ = store.save();
    settings
}

fn open_db(dir: &Path, notices: &mut Vec<String>) -> Result<db::Db, String> {
    let path = dir.join("ringlet.db");
    match db::Db::open(&path) {
        Ok(d) => Ok(d),
        Err(e) => {
            log::error!("database open failed: {e}");
            let backup = dir.join(format!("ringlet.corrupt-{}.db", clock::wall_ms()));
            let _ = std::fs::rename(&path, &backup);
            notices.push(
                "Your history database couldn't be opened and was set aside; Ringlet started a new one.".into(),
            );
            db::Db::open(&path)
        }
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;

    let mut notices = vec![];
    for (file, what) in [
        (SETTINGS_STORE, "Your settings file was damaged and has been reset. A backup was kept."),
        (timer::STATE_STORE, "The saved timer state was damaged and has been reset."),
        (windows::WINDOW_STORE, ""),
    ] {
        if quarantine_if_corrupt(&dir.join(file)) && !what.is_empty() {
            notices.push(what.to_string());
        }
    }
    // Window geometry changes constantly while dragging; debounce harder.
    tauri_plugin_store::StoreBuilder::new(app, windows::WINDOW_STORE)
        .auto_save(Duration::from_millis(500))
        .build()?;

    let settings = load_settings(&handle, &mut notices);
    let database = open_db(&dir, &mut notices)?;
    let player_origin = match player_server::start() {
        Ok(s) => Some(s.origin),
        Err(e) => {
            log::error!("player host failed: {e}");
            None
        }
    };

    app.manage(AppState::new(settings.clone(), database, player_origin));
    app.manage(shortcuts::Registered::default());
    let state = app.state::<AppState>();
    for n in notices {
        state.notice(n);
    }

    let (svc, recovered) = timer::TimerService::start(&handle, &settings);
    let _ = state.timer.set(svc);

    windows::create_main(&handle, &settings)?;
    windows::create_widget(&handle, &settings)?;
    windows::apply_activation_policy(&handle, &settings);
    tray::create(&handle)?;
    shortcuts::apply(&handle);
    updater::spawn(&handle);

    // Reflect the real login-item state (the user may have changed it in
    // System Settings).
    {
        use tauri_plugin_autostart::ManagerExt;
        if let Ok(actual) = app.autolaunch().is_enabled() {
            if actual != settings.desktop.launch_at_login {
                let mut s = state.settings();
                s.desktop.launch_at_login = actual;
                state.set_settings(s.clone());
                if let Ok(store) = handle.store(SETTINGS_STORE) {
                    store.set("settings", serde_json::to_value(&s).unwrap_or_default());
                }
            }
        }
    }

    if let Some(c) = recovered {
        let task = state.timer().current_task();
        state.notice(match c.phase {
            timer::engine::Phase::Focus => "A focus session finished while Ringlet was closed. It was saved to your history.",
            _ => "A break finished while Ringlet was closed.",
        });
        state.timer().finish(c, task, &settings, false);
    }

    let launched_quietly = std::env::args().any(|a| a == "--autostart") || updater::take_relaunch_marker(&handle);
    if settings.desktop.show_widget_on_launch {
        windows::show(&handle, windows::WIDGET);
    }
    if (settings.desktop.show_dashboard_on_launch && !launched_quietly) || !settings.desktop.show_widget_on_launch {
        windows::show(&handle, windows::MAIN);
    }
    windows::spawn_display_watch(&handle);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Must be first: a second launch focuses the running instance instead
        // of starting a competing timer.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show(app, windows::MAIN);
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, ev| shortcuts::handler(app, shortcut, ev))
                .build(),
        )
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap,
            commands::timer_toggle,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_reset,
            commands::timer_restart,
            commands::timer_skip,
            commands::timer_set_phase,
            commands::timer_set_task,
            commands::update_settings,
            commands::reset_settings,
            commands::apply_preset,
            commands::save_preset,
            commands::delete_preset,
            commands::export_settings,
            commands::import_settings,
            commands::tasks_list,
            commands::task_add,
            commands::task_update,
            commands::task_delete,
            commands::tasks_clear_completed,
            commands::stats_sessions,
            commands::stats_summary,
            commands::stats_clear,
            commands::window_show,
            commands::window_hide,
            commands::window_toggle,
            commands::open_dashboard,
            commands::toggle_pin,
            commands::quit_app,
            commands::preview_sound,
            commands::notification_permission,
            commands::request_notification_permission,
            commands::test_notification,
            commands::open_external,
            commands::update_status,
            commands::update_check,
            commands::update_apply,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Ringlet");

    app.run(|app, event| match event {
        // Windows are hidden rather than closed, so this only happens for an
        // explicit Quit (tray, Cmd+Q, dashboard close behavior "quit").
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            let state = app.state::<AppState>();
            state.quitting.store(true, Ordering::SeqCst);
            if let Some(t) = state.timer.get() {
                t.persist();
            }
            updater::install_on_quit(app);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { has_visible_windows, .. } => {
            if !has_visible_windows {
                windows::show(app, windows::MAIN);
            }
        }
        _ => {}
    });
}
