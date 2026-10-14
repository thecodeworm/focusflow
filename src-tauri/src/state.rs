use crate::db::Db;
use crate::settings::Settings;
use crate::timer::TimerService;
use serde::Serialize;
use std::sync::{Arc, Mutex, OnceLock, RwLock};

/// Result of registering one global shortcut.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub action: String,
    pub accelerator: Option<String>,
    pub ok: bool,
    pub error: Option<String>,
}

pub struct AppState {
    settings: RwLock<Settings>,
    pub db: Db,
    pub timer: OnceLock<Arc<TimerService>>,
    pub player_origin: Option<String>,
    pub shortcut_status: Mutex<Vec<ShortcutStatus>>,
    /// Messages to show once in the UI (e.g. "settings were reset").
    pub notices: Mutex<Vec<String>>,
    /// Set while quitting so close handlers stop hiding windows.
    pub quitting: std::sync::atomic::AtomicBool,
}

impl AppState {
    pub fn new(settings: Settings, db: Db, player_origin: Option<String>) -> Self {
        AppState {
            settings: RwLock::new(settings),
            db,
            timer: OnceLock::new(),
            player_origin,
            shortcut_status: Mutex::new(vec![]),
            notices: Mutex::new(vec![]),
            quitting: std::sync::atomic::AtomicBool::new(false),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn set_settings(&self, s: Settings) {
        *self.settings.write().unwrap_or_else(|p| p.into_inner()) = s;
    }

    pub fn timer(&self) -> &Arc<TimerService> {
        self.timer.get().expect("timer initialised during setup")
    }

    pub fn notice(&self, msg: impl Into<String>) {
        self.notices.lock().unwrap_or_else(|p| p.into_inner()).push(msg.into());
    }
}
