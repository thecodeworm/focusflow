//! System-wide keyboard shortcuts.

use crate::state::{AppState, ShortcutStatus};
use crate::windows::{self as win, MAIN, WIDGET};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

#[derive(Default)]
pub struct Registered(pub Mutex<HashMap<u32, &'static str>>);

pub fn handler(app: &AppHandle, shortcut: &Shortcut, ev: ShortcutEvent) {
    if ev.state != ShortcutState::Pressed {
        return;
    }
    let action = app
        .try_state::<Registered>()
        .and_then(|r| r.0.lock().ok().and_then(|m| m.get(&shortcut.id()).copied()));
    let Some(action) = action else { return };
    let state = app.state::<AppState>();
    match action {
        "toggleTimer" => {
            state.timer().command(|e, _, now| e.toggle(now));
        }
        "resetTimer" => {
            state.timer().command(|e, d, _| {
                e.reset(d);
                true
            });
        }
        "toggleWidget" => win::toggle(app, WIDGET),
        "openDashboard" => win::show(app, MAIN),
        "togglePin" => crate::commands::toggle_pin_inner(app),
        _ => {}
    }
}

/// (Re)registers all shortcuts from settings and records per-shortcut
/// results so the UI can explain conflicts.
pub fn apply(app: &AppHandle) {
    let state = app.state::<AppState>();
    let s = state.settings();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let registered = app.state::<Registered>();
    let mut map = registered.0.lock().unwrap_or_else(|p| p.into_inner());
    map.clear();

    let sc = &s.desktop.shortcuts;
    let entries: [(&'static str, &Option<String>); 5] = [
        ("toggleTimer", &sc.toggle_timer),
        ("resetTimer", &sc.reset_timer),
        ("toggleWidget", &sc.toggle_widget),
        ("openDashboard", &sc.open_dashboard),
        ("togglePin", &sc.toggle_pin),
    ];
    let mut results = vec![];
    for (action, accel) in entries {
        let mut st = ShortcutStatus {
            action: action.into(),
            accelerator: accel.clone(),
            ok: false,
            error: None,
        };
        match (sc.enabled, accel) {
            (false, _) | (_, None) => {}
            (true, Some(a)) => match a.parse::<Shortcut>() {
                Err(e) => st.error = Some(format!("“{a}” isn't a valid shortcut ({e}).")),
                Ok(shortcut) if map.contains_key(&shortcut.id()) => {
                    st.error = Some("Already used by another FocusFlow action.".into())
                }
                Ok(shortcut) => match gs.register(shortcut) {
                    Ok(()) => {
                        map.insert(shortcut.id(), action);
                        st.ok = true;
                    }
                    Err(e) => {
                        st.error = Some(format!(
                            "Couldn't register — another app or the system may already use it ({e})."
                        ))
                    }
                },
            },
        }
        results.push(st);
    }
    drop(map);
    *state.shortcut_status.lock().unwrap_or_else(|p| p.into_inner()) = results.clone();
    let _ = app.emit("shortcuts://status", results);
}
