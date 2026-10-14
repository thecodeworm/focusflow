//! Typed IPC surface exposed to the two FocusFlow windows.

use crate::db::{SessionRow, StatsSummary, Task};
use crate::settings::{builtin_presets, Preset, Settings};
use crate::state::{AppState, ShortcutStatus};
use crate::timer::engine::Phase;
use crate::timer::TimerSnapshot;
use crate::windows::{self as win, MAIN, WIDGET};
use crate::{clock, shortcuts, tray};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

type R<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    settings: Settings,
    timer: TimerSnapshot,
    presets: Vec<Preset>,
    platform: &'static str,
    player_origin: Option<String>,
    shortcuts: Vec<ShortcutStatus>,
    notices: Vec<String>,
    version: String,
}

fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

#[tauri::command]
pub fn get_bootstrap(app: AppHandle, state: State<AppState>, window: tauri::WebviewWindow) -> Bootstrap {
    // Notices are shown once, by the dashboard.
    let notices = if window.label() == MAIN {
        std::mem::take(&mut *state.notices.lock().unwrap_or_else(|p| p.into_inner()))
    } else {
        vec![]
    };
    Bootstrap {
        settings: state.settings(),
        timer: state.timer().snapshot(),
        presets: builtin_presets(),
        platform: platform(),
        player_origin: state.player_origin.clone(),
        shortcuts: state.shortcut_status.lock().unwrap_or_else(|p| p.into_inner()).clone(),
        notices,
        version: app.package_info().version.to_string(),
    }
}

// ---- timer ----------------------------------------------------------------

#[tauri::command]
pub fn timer_toggle(state: State<AppState>) -> TimerSnapshot {
    state.timer().command(|e, _, now| e.toggle(now))
}

#[tauri::command]
pub fn timer_start(state: State<AppState>) -> TimerSnapshot {
    state.timer().command(|e, _, now| e.start(now))
}

#[tauri::command]
pub fn timer_pause(state: State<AppState>) -> TimerSnapshot {
    state.timer().command(|e, _, _| e.pause())
}

#[tauri::command]
pub fn timer_reset(state: State<AppState>) -> TimerSnapshot {
    state.timer().command(|e, d, _| {
        e.reset(d);
        true
    })
}

#[tauri::command]
pub fn timer_restart(state: State<AppState>) -> TimerSnapshot {
    state.timer().command(|e, d, now| {
        e.restart(d, now);
        true
    })
}

pub fn skip_with_autostart(app: &AppHandle, s: &Settings) -> TimerSnapshot {
    let state = app.state::<AppState>();
    let mut next = Phase::Focus;
    state.timer().command(|e, d, _| {
        next = e.skip(d);
        true
    });
    let auto = if next.is_break() { s.timer.auto_start_breaks } else { s.timer.auto_start_focus };
    if auto {
        state.timer().command(|e, _, now| e.start(now))
    } else {
        state.timer().snapshot()
    }
}

#[tauri::command]
pub fn timer_skip(app: AppHandle, state: State<AppState>) -> TimerSnapshot {
    skip_with_autostart(&app, &state.settings())
}

#[tauri::command]
pub fn timer_set_phase(state: State<AppState>, phase: Phase) -> TimerSnapshot {
    state.timer().command(|e, d, _| {
        e.set_phase(phase, d);
        true
    })
}

#[tauri::command]
pub fn timer_set_task(app: AppHandle, state: State<AppState>, task_id: Option<i64>) -> R<TimerSnapshot> {
    if let Some(id) = task_id {
        if state.db.task(id)?.is_none() {
            return Err("That task no longer exists.".into());
        }
    }
    let snap = state.timer().set_task(task_id);
    let _ = app.emit("tasks://changed", ());
    Ok(snap)
}

// ---- settings -------------------------------------------------------------

fn commit_settings(app: &AppHandle, next: Settings) -> R<Settings> {
    use tauri_plugin_store::StoreExt;
    let state = app.state::<AppState>();
    let prev = state.settings();
    let mut next = next;

    if prev.desktop.launch_at_login != next.desktop.launch_at_login {
        use tauri_plugin_autostart::ManagerExt;
        let al = app.autolaunch();
        let res = if next.desktop.launch_at_login { al.enable() } else { al.disable() };
        if let Err(e) = res {
            next.desktop.launch_at_login = prev.desktop.launch_at_login;
            let _ = app.emit("app://error", format!("Couldn't change launch at login: {e}"));
        }
    }

    state.set_settings(next.clone());
    let store = app.store(crate::SETTINGS_STORE).map_err(|e| e.to_string())?;
    store.set("settings", serde_json::to_value(&next).map_err(|e| e.to_string())?);
    store.save().map_err(|e| format!("Couldn't save settings: {e}"))?;

    state.timer().settings_changed();
    {
        let app2 = app.clone();
        let (p, n) = (prev.clone(), next.clone());
        let _ = app.run_on_main_thread(move || win::apply_settings(&app2, &p, &n));
    }
    tray::apply_settings(app);
    if prev.desktop.shortcuts != next.desktop.shortcuts {
        shortcuts::apply(app);
    }
    let _ = app.emit("settings://changed", &next);
    Ok(next)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, state: State<AppState>, patch: Value) -> R<Settings> {
    if !patch.is_object() {
        return Err("Invalid settings update.".into());
    }
    let next = state.settings().patched(&patch);
    commit_settings(&app, next)
}

#[tauri::command]
pub fn reset_settings(app: AppHandle, state: State<AppState>) -> R<Settings> {
    // Keep favourites and custom presets: "reset" is about preferences.
    let cur = state.settings();
    let mut next = Settings::default();
    next.audio.favorites = cur.audio.favorites;
    next.timer.custom_presets = cur.timer.custom_presets;
    next.desktop.launch_at_login = cur.desktop.launch_at_login;
    commit_settings(&app, next)
}

#[tauri::command]
pub fn apply_preset(app: AppHandle, state: State<AppState>, id: String) -> R<Settings> {
    let cur = state.settings();
    let p = builtin_presets()
        .into_iter()
        .chain(cur.timer.custom_presets.clone())
        .find(|p| p.id == id)
        .ok_or("Preset not found.")?;
    let mut next = cur;
    next.timer.focus_minutes = p.focus_minutes;
    next.timer.short_break_minutes = p.short_break_minutes;
    next.timer.long_break_minutes = p.long_break_minutes;
    next.timer.long_break_interval = p.long_break_interval;
    next.timer.preset_id = p.id;
    next.sanitize();
    commit_settings(&app, next)
}

#[tauri::command]
pub fn save_preset(app: AppHandle, state: State<AppState>, name: String) -> R<Settings> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Give the preset a name.".into());
    }
    let mut next = state.settings();
    if next.timer.custom_presets.len() >= 20 {
        return Err("You can save up to 20 custom presets.".into());
    }
    let id = format!("custom-{}", clock::wall_ms());
    next.timer.custom_presets.push(Preset {
        id: id.clone(),
        name: name.to_string(),
        focus_minutes: next.timer.focus_minutes,
        short_break_minutes: next.timer.short_break_minutes,
        long_break_minutes: next.timer.long_break_minutes,
        long_break_interval: next.timer.long_break_interval,
    });
    next.timer.preset_id = id;
    next.sanitize();
    commit_settings(&app, next)
}

#[tauri::command]
pub fn delete_preset(app: AppHandle, state: State<AppState>, id: String) -> R<Settings> {
    let mut next = state.settings();
    next.timer.custom_presets.retain(|p| p.id != id);
    if next.timer.preset_id == id {
        next.timer.preset_id = "custom".into();
    }
    commit_settings(&app, next)
}

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFile {
    app: String,
    format: u32,
    exported_at: i64,
    settings: Value,
}

#[tauri::command]
pub async fn export_settings(app: AppHandle) -> R<bool> {
    use tauri_plugin_dialog::DialogExt;
    let s = app.state::<AppState>().settings();
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("focusflow-settings.json")
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let body = ExportFile {
        app: "FocusFlow".into(),
        format: 1,
        exported_at: clock::wall_ms(),
        settings: serde_json::to_value(&s).map_err(|e| e.to_string())?,
    };
    let json = serde_json::to_vec_pretty(&body).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Couldn't write the file: {e}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn import_settings(app: AppHandle) -> R<Option<Settings>> {
    use tauri_plugin_dialog::DialogExt;
    let Some(path) = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 1_000_000 {
        return Err("That file is too large to be a FocusFlow settings export.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read the file: {e}"))?;
    let parsed: Value =
        serde_json::from_slice(&bytes).map_err(|_| "That file isn't valid JSON.".to_string())?;
    let settings_val = match parsed.get("settings") {
        Some(v) if parsed.get("app").and_then(|a| a.as_str()) == Some("FocusFlow") => v.clone(),
        _ => return Err("That file isn't a FocusFlow settings export.".into()),
    };
    let (mut next, _) = Settings::from_value_tolerant(&settings_val);
    // Launch-at-login is a property of this machine, not of the export.
    next.desktop.launch_at_login = app.state::<AppState>().settings().desktop.launch_at_login;
    commit_settings(&app, next).map(Some)
}

// ---- tasks ----------------------------------------------------------------

#[tauri::command]
pub fn tasks_list(state: State<AppState>) -> R<Vec<Task>> {
    state.db.tasks()
}

#[tauri::command]
pub fn task_add(app: AppHandle, state: State<AppState>, title: String) -> R<Task> {
    let t = state.db.add_task(&title, clock::wall_ms())?;
    let _ = app.emit("tasks://changed", ());
    Ok(t)
}

#[tauri::command]
pub fn task_update(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    title: Option<String>,
    done: Option<bool>,
) -> R<()> {
    state.db.update_task(id, title.as_deref(), done, clock::wall_ms())?;
    if done == Some(true) && state.timer().current_task() == Some(id) {
        state.timer().set_task(None);
    }
    let _ = app.emit("tasks://changed", ());
    Ok(())
}

#[tauri::command]
pub fn task_delete(app: AppHandle, state: State<AppState>, id: i64) -> R<()> {
    state.db.delete_task(id)?;
    if state.timer().current_task() == Some(id) {
        state.timer().set_task(None);
    }
    let _ = app.emit("tasks://changed", ());
    Ok(())
}

#[tauri::command]
pub fn tasks_clear_completed(app: AppHandle, state: State<AppState>) -> R<()> {
    state.db.clear_completed_tasks()?;
    let _ = app.emit("tasks://changed", ());
    Ok(())
}

// ---- stats ----------------------------------------------------------------

#[tauri::command]
pub fn stats_sessions(state: State<AppState>, since: i64) -> R<Vec<SessionRow>> {
    state.db.sessions_since(since)
}

#[tauri::command]
pub fn stats_summary(state: State<AppState>) -> R<StatsSummary> {
    state.db.summary()
}

#[tauri::command]
pub fn stats_clear(app: AppHandle, state: State<AppState>) -> R<()> {
    state.db.clear_sessions()?;
    let _ = app.emit("stats://changed", ());
    Ok(())
}

// ---- windows --------------------------------------------------------------

fn valid_label(label: &str) -> R<&str> {
    match label {
        MAIN | WIDGET => Ok(label),
        _ => Err("Unknown window.".into()),
    }
}

#[tauri::command]
pub fn window_show(app: AppHandle, label: String) -> R<()> {
    win::show(&app, valid_label(&label)?);
    Ok(())
}

#[tauri::command]
pub fn window_hide(app: AppHandle, label: String) -> R<()> {
    win::hide(&app, valid_label(&label)?);
    Ok(())
}

#[tauri::command]
pub fn window_toggle(app: AppHandle, label: String) -> R<()> {
    win::toggle(&app, valid_label(&label)?);
    Ok(())
}

#[tauri::command]
pub fn open_dashboard(app: AppHandle, page: Option<String>) -> R<()> {
    win::show(&app, MAIN);
    if let Some(p) = page {
        if ["timer", "music", "tasks", "stats", "settings"].contains(&p.as_str()) {
            let _ = app.emit_to(MAIN, "nav://goto", p);
        }
    }
    Ok(())
}

pub fn toggle_pin_inner(app: &AppHandle) {
    let cur = app.state::<AppState>().settings();
    let mut next = cur.clone();
    next.desktop.always_on_top = !cur.desktop.always_on_top;
    if let Err(e) = commit_settings(app, next) {
        log::warn!("toggle pin failed: {e}");
    }
}

#[tauri::command]
pub fn toggle_pin(app: AppHandle) -> Settings {
    toggle_pin_inner(&app);
    app.state::<AppState>().settings()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit(&app);
}

// ---- audio, notifications, links -------------------------------------------

#[tauri::command]
pub fn preview_sound(sound: String, volume: f64) {
    crate::sound::play(&sound, volume);
}

#[tauri::command]
pub fn notification_permission(app: AppHandle) -> String {
    use tauri_plugin_notification::NotificationExt;
    match app.notification().permission_state() {
        Ok(p) => format!("{p:?}").to_lowercase(),
        Err(_) => "unknown".into(),
    }
}

#[tauri::command]
pub async fn request_notification_permission(app: AppHandle) -> String {
    use tauri_plugin_notification::NotificationExt;
    match app.notification().request_permission() {
        Ok(p) => format!("{p:?}").to_lowercase(),
        Err(e) => format!("error: {e}"),
    }
}

#[tauri::command]
pub fn test_notification(app: AppHandle) -> R<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title("FocusFlow notifications are on")
        .body("You'll see a message like this when a session ends.")
        .show()
        .map_err(|e| format!("The system refused the notification: {e}"))
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> R<()> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = tauri::Url::parse(&url).map_err(|_| "Invalid link.".to_string())?;
    if !win::is_safe_external(&parsed) {
        return Err("FocusFlow only opens YouTube links in your browser.".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}
