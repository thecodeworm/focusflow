//! Background auto-update from GitHub Releases.
//!
//! Release builds check `latest.json` shortly after launch and every few
//! hours. A newer, correctly signed build is downloaded in the background,
//! then applied without interrupting a session:
//! * as soon as the timer is idle and the dashboard is closed (a quiet
//!   relaunch that only blinks the floating timer),
//! * from the tray's "Restart to Update" item or Settings → Data, or
//! * when Ringlet quits.
//!
//! On macOS the new bundle replaces the old one right after download and
//! takes effect on the next launch. On Windows the downloaded installer is
//! run at apply time (it exits Ringlet and relaunches it).

use crate::state::AppState;
use crate::timer::engine::Status;
use crate::windows::MAIN;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK: Duration = Duration::from_secs(20);
const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);
const IDLE_POLL: Duration = Duration::from_secs(30);
/// Present on the first launch after an automatic update, so that launch
/// stays as quiet as a login launch.
const RELAUNCH_MARKER: &str = "updated.marker";

pub struct Pending {
    pub update: Update,
    /// Windows only: the verified installer, run at apply time.
    #[cfg_attr(not(windows), allow(dead_code))]
    bytes: Vec<u8>,
}

#[derive(Default)]
pub struct Updates {
    pub pending: Mutex<Option<Pending>>,
    /// Set while a check or download runs, so the background thread and a
    /// manual check never download twice.
    checking: AtomicBool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current: String,
    /// Version downloaded and waiting for a restart.
    ready: Option<String>,
    checking: bool,
    /// False in development builds, which never update themselves.
    supported: bool,
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    let updates = app.state::<Updates>();
    let ready = updates.pending.lock().unwrap_or_else(|p| p.into_inner()).as_ref().map(|p| p.update.version.clone());
    UpdateStatus {
        current: app.package_info().version.to_string(),
        ready,
        checking: updates.checking.load(Ordering::SeqCst),
        supported: !cfg!(debug_assertions),
    }
}

/// Checks (and downloads) right away, for the Settings button.
pub async fn check_now(app: &AppHandle) -> Result<UpdateStatus, String> {
    if cfg!(debug_assertions) {
        return Err("Development builds don't update themselves.".into());
    }
    if !has_pending(app) {
        guarded_check(app).await.map_err(|e| format!("Couldn't check for updates: {e}"))?;
    }
    Ok(status(app))
}

/// Runs one check unless another is already running (then does nothing).
async fn guarded_check(app: &AppHandle) -> Result<(), String> {
    let updates = app.state::<Updates>();
    if updates.checking.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let _ = app.emit("updates://status", status(app));
    let result = check_and_download(app).await.map_err(|e| e.to_string());
    updates.checking.store(false, Ordering::SeqCst);
    let _ = app.emit("updates://status", status(app));
    result
}

fn marker(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(RELAUNCH_MARKER))
}

/// True (once) when this launch follows an automatic update.
pub fn take_relaunch_marker(app: &AppHandle) -> bool {
    marker(app).is_some_and(|p| std::fs::remove_file(p).is_ok())
}

pub fn spawn(app: &AppHandle) {
    app.manage(Updates::default());
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("updater".into())
        .spawn(move || {
            let mut next_check = Instant::now() + FIRST_CHECK;
            loop {
                std::thread::sleep(IDLE_POLL);
                if has_pending(&app) {
                    if is_quiet_moment(&app) {
                        apply(&app, true);
                    }
                } else if Instant::now() >= next_check {
                    next_check = Instant::now() + CHECK_EVERY;
                    if let Err(e) = tauri::async_runtime::block_on(guarded_check(&app)) {
                        log::warn!("update check failed: {e}");
                    }
                }
            }
        })
        .ok();
}

fn has_pending(app: &AppHandle) -> bool {
    app.state::<Updates>().pending.lock().unwrap_or_else(|p| p.into_inner()).is_some()
}

async fn check_and_download(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let Some(update) = app.updater()?.check().await? else { return Ok(()) };
    log::info!("downloading Ringlet {}", update.version);
    let bytes = update.download(|_, _| {}, || {}).await?;
    // macOS: swap the bundle on disk now; it is used from the next launch.
    #[cfg(not(windows))]
    let bytes = {
        update.install(&bytes)?;
        Vec::new()
    };
    let version = update.version.clone();
    *app.state::<Updates>().pending.lock().unwrap_or_else(|p| p.into_inner()) = Some(Pending { update, bytes });
    crate::tray::show_update_ready(app, &version);
    let _ = app
        .notification()
        .builder()
        .title("Ringlet update ready")
        .body(format!("Version {version} will be installed the next time your timer is idle."))
        .show();
    Ok(())
}

fn is_quiet_moment(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let Some(timer) = state.timer.get() else { return false };
    let snap = timer.snapshot();
    let dashboard_open = app.get_webview_window(MAIN).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    snap.status == Status::Idle && !dashboard_open
}

/// Applies a downloaded update and relaunches. `quiet` relaunches without
/// popping the dashboard. Does nothing if no update is ready.
pub fn apply(app: &AppHandle, quiet: bool) {
    let Some(p) = app.state::<Updates>().pending.lock().unwrap_or_else(|p| p.into_inner()).take() else {
        return;
    };
    log::info!("applying Ringlet {}", p.update.version);
    if quiet {
        if let Some(m) = marker(app) {
            let _ = std::fs::write(m, p.update.version.as_bytes());
        }
    }
    let state = app.state::<AppState>();
    state.quitting.store(true, std::sync::atomic::Ordering::SeqCst);
    if let Some(t) = state.timer.get() {
        t.persist();
    }
    #[cfg(windows)]
    {
        // Runs the installer and exits; the installer relaunches Ringlet.
        if let Err(e) = p.update.install(&p.bytes) {
            log::error!("update install failed: {e}");
            state.quitting.store(false, std::sync::atomic::Ordering::SeqCst);
            return;
        }
    }
    app.restart();
}

/// Called on an intentional quit: on Windows, install the pending update
/// without relaunching. (macOS already installed it after download.)
pub fn install_on_quit(app: &AppHandle) {
    #[cfg(windows)]
    {
        let Some(updates) = app.try_state::<Updates>() else { return };
        let Some(p) = updates.pending.lock().unwrap_or_else(|p| p.into_inner()).take() else { return };
        if let Err(e) = p.update.clone().restart_after_install(false).install(&p.bytes) {
            log::error!("update install on quit failed: {e}");
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

