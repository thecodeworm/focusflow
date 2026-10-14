//! macOS menu bar item / Windows notification-area icon.

use crate::state::AppState;
use crate::timer::engine::{Phase, Status};
use crate::timer::TimerSnapshot;
use crate::windows::{self as win, MAIN, WIDGET};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub struct Tray {
    icon: TrayIcon,
    status: MenuItem<tauri::Wry>,
    toggle: MenuItem<tauri::Wry>,
    widget: CheckMenuItem<tauri::Wry>,
    pin: CheckMenuItem<tauri::Wry>,
    last_title: Mutex<String>,
}

#[cfg(target_os = "macos")]
const ICON: &[u8] = include_bytes!("../icons/tray-template.png");
#[cfg(not(target_os = "macos"))]
const ICON: &[u8] = include_bytes!("../icons/tray-color.png");

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let s = app.state::<AppState>().settings();
    let status = MenuItem::with_id(app, "status", "Ready to focus", false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start Focus", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Skip Session", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset Session", true, None::<&str>)?;
    let widget = CheckMenuItem::with_id(app, "widget", "Floating Timer", true, false, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "dashboard", "Open Dashboard…", true, None::<&str>)?;
    let pin = CheckMenuItem::with_id(app, "pin", "Keep Timer on Top", true, s.desktop.always_on_top, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Ringlet", true, Some("CmdOrCtrl+Q"))?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(
        app,
        &[&status, &sep()?, &toggle, &skip, &reset, &sep()?, &widget, &dashboard, &pin, &sep()?, &quit],
    )?;

    let icon = TrayIconBuilder::with_id("ringlet")
        .icon(Image::from_bytes(ICON)?)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Ringlet")
        .menu(&menu)
        // macOS convention: click opens the menu. Windows: left click
        // toggles the floating timer, right click opens the menu.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()))
        .on_tray_icon_event(|tray, ev| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                win::toggle(tray.app_handle(), WIDGET);
            }
        })
        .build(app)?;
    icon.set_visible(s.desktop.show_tray || crate::windows::needs_accessory_fallback(&s))?;

    app.manage(Tray { icon, status, toggle, widget, pin, last_title: Mutex::new(String::new()) });
    refresh_menu(app);
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        "toggle" => {
            state.timer().command(|e, _, now| e.toggle(now));
        }
        "skip" => {
            let s = state.settings();
            crate::commands::skip_with_autostart(app, &s);
        }
        "reset" => {
            state.timer().command(|e, d, _| {
                e.reset(d);
                true
            });
        }
        "widget" => win::toggle(app, WIDGET),
        "dashboard" => win::show(app, MAIN),
        "pin" => crate::commands::toggle_pin_inner(app),
        "quit" => crate::quit(app),
        _ => {}
    }
    refresh_menu(app);
}

pub fn mmss(ms: u64) -> String {
    let secs = ms.div_ceil(1000);
    format!("{:02}:{:02}", secs / 60, secs % 60)
}

/// Updates the menu-bar title / tooltip and the Start/Pause label.
pub fn update_timer(app: &AppHandle, snap: &TimerSnapshot) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let s = app.state::<AppState>().settings();
    let time = mmss(snap.remaining_ms);
    let phase = snap.phase.label();
    let status_text = match snap.status {
        Status::Running => format!("{phase} · {time} left"),
        Status::Paused => format!("{phase} · paused at {time}"),
        Status::Idle => match snap.phase {
            Phase::Focus => "Ready to focus".to_string(),
            _ => format!("{phase} ready"),
        },
    };
    let title = if s.desktop.show_tray_time && snap.status != Status::Idle {
        time.clone()
    } else {
        String::new()
    };
    {
        let mut last = tray.last_title.lock().unwrap_or_else(|p| p.into_inner());
        if *last == format!("{title}|{status_text}") {
            return;
        }
        *last = format!("{title}|{status_text}");
    }
    #[cfg(target_os = "macos")]
    let _ = tray.icon.set_title(if title.is_empty() { None } else { Some(format!(" {title}")) });
    let _ = tray.icon.set_tooltip(Some(format!("Ringlet — {status_text}")));
    let _ = tray.status.set_text(status_text);
    let toggle = match (snap.status, snap.phase) {
        (Status::Running, _) => "Pause".to_string(),
        (Status::Paused, _) => "Resume".to_string(),
        (Status::Idle, Phase::Focus) => "Start Focus".to_string(),
        (Status::Idle, _) => "Start Break".to_string(),
    };
    let _ = tray.toggle.set_text(toggle);
}

pub fn refresh_menu(app: &AppHandle) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let s = app.state::<AppState>().settings();
    let _ = tray.widget.set_checked(win::widget_visible(app));
    let _ = tray.pin.set_checked(s.desktop.always_on_top);
}

pub fn apply_settings(app: &AppHandle) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let s = app.state::<AppState>().settings();
    let _ = tray.icon.set_visible(s.desktop.show_tray || crate::windows::needs_accessory_fallback(&s));
    tray.last_title.lock().unwrap_or_else(|p| p.into_inner()).clear();
    let snap = app.state::<AppState>().timer().snapshot();
    update_timer(app, &snap);
    refresh_menu(app);
}

#[cfg(test)]
mod tests {
    #[test]
    fn mmss_rounds_up_partial_seconds() {
        assert_eq!(super::mmss(25 * 60_000), "25:00");
        assert_eq!(super::mmss(59_001), "01:00");
        assert_eq!(super::mmss(1), "00:01");
        assert_eq!(super::mmss(0), "00:00");
    }
}
