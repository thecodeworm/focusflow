//! Native window management for the floating widget and the dashboard.

use crate::settings::Settings;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const MAIN: &str = "main";
pub const WIDGET: &str = "widget";
pub const WINDOW_STORE: &str = "window.json";

/// Logical widget sizes per layout. Heights include the drag header.
pub fn widget_size(name: &str) -> (f64, f64) {
    match name {
        "compact" => (180.0, 92.0),
        "expanded" => (360.0, 480.0),
        _ => (300.0, 360.0),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct SavedPos {
    x: i32,
    y: i32,
}

fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || (cfg!(debug_assertions) && url.host_str() == Some("localhost") && url.port() == Some(1420))
        }
        _ => url.scheme() == "about",
    }
}

/// Frames we expect inside the dashboard (the loopback player page and the
/// YouTube embed it creates). Everything else is refused.
fn is_allowed_frame(url: &Url, player_origin: Option<&str>) -> bool {
    if let Some(origin) = player_origin {
        if url.origin().ascii_serialization() == origin {
            return true;
        }
    }
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("www.youtube.com") | Some("www.youtube-nocookie.com") | Some("youtube.com")
        )
        && url.path().starts_with("/embed")
}

/// External links (e.g. the YouTube logo or video title inside the embed)
/// open in the user's browser — only for well-known HTTPS hosts.
pub fn is_safe_external(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else { return false };
    let host = host.trim_start_matches("www.").trim_start_matches("m.");
    matches!(
        host,
        "youtube.com" | "youtu.be" | "music.youtube.com" | "accounts.google.com" | "support.google.com"
            | "policies.google.com" | "consent.youtube.com" | "github.com"
    )
}

fn open_external(app: &AppHandle, url: &Url) {
    use tauri_plugin_opener::OpenerExt;
    if is_safe_external(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    } else {
        log::warn!("blocked external link: {url}");
    }
}

pub fn create_main(app: &AppHandle, s: &Settings) -> tauri::Result<WebviewWindow> {
    let player_origin = app.state::<AppState>().player_origin.clone();
    let nav_app = app.clone();
    let mut b = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("FocusFlow")
        .inner_size(960.0, 680.0)
        .min_inner_size(780.0, 560.0)
        .visible(false)
        .center()
        .on_navigation(move |url| is_app_url(url) || is_allowed_frame(url, player_origin.as_deref()))
        .on_new_window(move |url, _| {
            open_external(&nav_app, &url);
            tauri::webview::NewWindowResponse::Deny
        });
    #[cfg(target_os = "macos")]
    {
        b = b
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(18.0, 24.0));
    }
    if s.appearance.theme == "dark" {
        b = b.background_color(tauri::window::Color(17, 18, 20, 255));
    } else if s.appearance.theme == "light" {
        b = b.background_color(tauri::window::Color(248, 248, 247, 255));
    }
    let w = b.build()?;
    let app2 = app.clone();
    w.on_window_event(move |ev| match ev {
        WindowEvent::CloseRequested { api, .. } => {
            let state = app2.state::<AppState>();
            if state.quitting.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            let s = state.settings();
            match s.desktop.close_behavior.as_str() {
                "quit" => {
                    api.prevent_close();
                    crate::quit(&app2);
                }
                "minimize" => {
                    api.prevent_close();
                    if let Some(w) = app2.get_webview_window(MAIN) {
                        let _ = w.minimize();
                    }
                }
                _ => {
                    api.prevent_close();
                    // Without a tray icon on Windows a hidden window would be
                    // unreachable, so fall back to minimising.
                    if cfg!(windows) && !s.desktop.show_tray && !widget_visible(&app2) {
                        if let Some(w) = app2.get_webview_window(MAIN) {
                            let _ = w.minimize();
                        }
                    } else {
                        hide(&app2, MAIN);
                    }
                }
            }
        }
        WindowEvent::Focused(true) => {
            let _ = app2.emit_to(MAIN, "window://visible", true);
        }
        _ => {}
    });
    Ok(w)
}

pub fn create_widget(app: &AppHandle, s: &Settings) -> tauri::Result<WebviewWindow> {
    let (w, h) = widget_size(&s.appearance.widget_size);
    let mut b = WebviewWindowBuilder::new(app, WIDGET, WebviewUrl::App("index.html".into()))
        .title("FocusFlow Timer")
        .inner_size(w, h)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .shadow(true)
        .always_on_top(s.desktop.always_on_top)
        .visible_on_all_workspaces(s.desktop.all_workspaces)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .on_navigation(|url| is_app_url(url));
    #[cfg(target_os = "macos")]
    {
        b = b.accept_first_mouse(true);
    }
    if s.appearance.theme == "dark" {
        b = b.background_color(tauri::window::Color(27, 28, 31, 255));
    } else {
        b = b.background_color(tauri::window::Color(255, 255, 255, 255));
    }
    let win = b.build()?;

    if crate::platform::make_floating_panel(&win) {
        PANEL_OK.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    crate::platform::style_widget(&win, s.appearance.widget_opacity);
    apply_overlay(&win, s);

    // Restore the last position, or park near the top-right of the primary
    // monitor on first launch.
    let saved = load_pos(app);
    match saved {
        Some(p) => {
            let _ = win.set_position(PhysicalPosition::new(p.x, p.y));
        }
        None => place_default(&win),
    }
    ensure_on_screen(&win);

    let app2 = app.clone();
    win.on_window_event(move |ev| match ev {
        WindowEvent::Moved(p) => save_pos(&app2, p.x, p.y),
        WindowEvent::ScaleFactorChanged { .. } => {
            if let Some(w) = app2.get_webview_window(WIDGET) {
                ensure_on_screen(&w);
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            if !app2.state::<AppState>().quitting.load(std::sync::atomic::Ordering::SeqCst) {
                api.prevent_close();
                hide(&app2, WIDGET);
            }
        }
        _ => {}
    });
    Ok(win)
}

fn load_pos(app: &AppHandle) -> Option<SavedPos> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(WINDOW_STORE).ok()?;
    serde_json::from_value(store.get("widgetPosition")?).ok()
}

fn save_pos(app: &AppHandle, x: i32, y: i32) {
    use tauri_plugin_store::StoreExt;
    // The store debounces writes, so continuous drag events are cheap.
    if let Ok(store) = app.store(WINDOW_STORE) {
        store.set("widgetPosition", serde_json::json!({ "x": x, "y": y }));
    }
}

fn place_default(win: &WebviewWindow) {
    let Ok(Some(m)) = win.primary_monitor().or_else(|_| win.current_monitor()) else {
        return;
    };
    let area = m.work_area();
    let size = win.outer_size().unwrap_or_default();
    let margin = (24.0 * m.scale_factor()) as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + margin;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Moves the widget back onto a connected monitor if it is (mostly) off
/// screen, e.g. after a display was unplugged or the resolution changed.
pub fn ensure_on_screen(win: &WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (win.outer_position(), win.outer_size(), win.available_monitors())
    else {
        return;
    };
    if monitors.is_empty() {
        return;
    }
    // The header strip must be reachable for the user to drag the widget.
    let grab_w = (size.width as i32).min(120);
    let grab_h = (size.height as i32).min(28);
    let visible = monitors.iter().any(|m| {
        let a = m.work_area();
        let (ax, ay) = (a.position.x, a.position.y);
        let (aw, ah) = (a.size.width as i32, a.size.height as i32);
        let ix = (pos.x + size.width as i32).min(ax + aw) - pos.x.max(ax);
        let iy = (pos.y + grab_h).min(ay + ah) - pos.y.max(ay);
        ix >= grab_w.min(60) && iy >= grab_h.min(20)
    });
    if visible {
        // Also keep the whole widget inside its monitor when it fits.
        if let Ok(Some(m)) = win.current_monitor() {
            let a = m.work_area();
            let max_x = a.position.x + a.size.width as i32 - size.width as i32;
            let max_y = a.position.y + a.size.height as i32 - size.height as i32;
            let nx = pos.x.clamp(a.position.x, max_x.max(a.position.x));
            let ny = pos.y.clamp(a.position.y, max_y.max(a.position.y));
            if (nx, ny) != (pos.x, pos.y) {
                let _ = win.set_position(PhysicalPosition::new(nx, ny));
            }
        }
        return;
    }
    place_default(win);
}

pub fn on_system_wake(app: &AppHandle) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = app2.get_webview_window(WIDGET) {
            ensure_on_screen(&w);
        }
    });
    let _ = app.emit("system://wake", ());
}

/// Low-frequency display check (monitors can disappear without any event
/// reaching an undecorated window). Only runs work while the widget is shown.
pub fn spawn_display_watch(app: &AppHandle) {
    let app = app.clone();
    std::thread::Builder::new()
        .name("focusflow-display-watch".into())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(20));
            if !widget_visible(&app) {
                continue;
            }
            let app2 = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(w) = app2.get_webview_window(WIDGET) {
                    ensure_on_screen(&w);
                }
            });
        })
        .ok();
}

pub fn widget_visible(app: &AppHandle) -> bool {
    app.get_webview_window(WIDGET)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

pub fn show(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        if label == WIDGET {
            ensure_on_screen(&w);
            let _ = w.show();
        } else {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        let _ = app.emit_to(label, "window://visible", true);
        // A freshly shown window needs the current timer immediately.
        let snap = app.state::<AppState>().timer().snapshot();
        let _ = app.emit_to(label, "timer://state", &snap);
    }
    crate::tray::refresh_menu(app);
}

pub fn hide(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.hide();
        let _ = app.emit_to(label, "window://visible", false);
    }
    crate::tray::refresh_menu(app);
}

pub fn toggle(app: &AppHandle, label: &str) {
    let visible = app
        .get_webview_window(label)
        .and_then(|w| Some(w.is_visible().ok()? && !w.is_minimized().ok()?))
        .unwrap_or(false);
    if visible {
        hide(app, label)
    } else {
        show(app, label)
    }
}

fn apply_overlay(win: &WebviewWindow, s: &Settings) {
    crate::platform::set_fullscreen_overlay(
        win,
        s.desktop.show_over_fullscreen,
        s.desktop.always_on_top,
        s.desktop.all_workspaces,
    );
}

/// Whether the widget became a non-activating panel (macOS).
static PANEL_OK: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// True when the full-screen overlay needs the menu-bar-app fallback, i.e. the
/// widget couldn't become a floating panel on this system.
pub fn needs_accessory_fallback(s: &Settings) -> bool {
    cfg!(target_os = "macos")
        && s.desktop.show_over_fullscreen
        && !PANEL_OK.load(std::sync::atomic::Ordering::SeqCst)
}

/// FocusFlow normally stays a regular Dock app: the widget is a
/// non-activating panel, which macOS allows over full-screen Spaces. Only if
/// that conversion failed does the overlay mode fall back to the accessory
/// (menu-bar) policy, which drops the Dock icon.
pub fn apply_activation_policy(app: &AppHandle, s: &Settings) {
    #[cfg(target_os = "macos")]
    {
        let policy = if needs_accessory_fallback(s) {
            tauri::ActivationPolicy::Accessory
        } else {
            tauri::ActivationPolicy::Regular
        };
        if let Err(e) = app.set_activation_policy(policy) {
            log::warn!("couldn't change activation policy: {e}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, s);
}

/// Applies window-related settings. Must run on the main thread.
pub fn apply_settings(app: &AppHandle, prev: &Settings, s: &Settings) {
    if prev.desktop.show_over_fullscreen != s.desktop.show_over_fullscreen {
        apply_activation_policy(app, s);
    }
    if let Some(w) = app.get_webview_window(WIDGET) {
        if prev.desktop.always_on_top != s.desktop.always_on_top {
            let _ = w.set_always_on_top(s.desktop.always_on_top);
        }
        if prev.desktop.all_workspaces != s.desktop.all_workspaces {
            let _ = w.set_visible_on_all_workspaces(s.desktop.all_workspaces);
        }
        if prev.appearance.widget_size != s.appearance.widget_size {
            let (lw, lh) = widget_size(&s.appearance.widget_size);
            if !crate::platform::animate_resize(&w, lw, lh, s.appearance.animations) {
                let _ = w.set_size(LogicalSize::new(lw, lh));
            }
            ensure_on_screen(&w);
        }
        // Tauri's always-on-top call resets the level, so reapply ours after.
        if prev.desktop.always_on_top != s.desktop.always_on_top
            || prev.desktop.all_workspaces != s.desktop.all_workspaces
            || prev.desktop.show_over_fullscreen != s.desktop.show_over_fullscreen
        {
            apply_overlay(&w, s);
        }
        if (prev.appearance.widget_opacity - s.appearance.widget_opacity).abs() > f64::EPSILON {
            crate::platform::set_opacity(&w, s.appearance.widget_opacity);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_urls() {
        assert!(is_app_url(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(is_app_url(&Url::parse("http://tauri.localhost/").unwrap()));
        assert!(!is_app_url(&Url::parse("https://evil.example/").unwrap()));
        assert!(!is_app_url(&Url::parse("file:///etc/passwd").unwrap()));
    }

    #[test]
    fn frames_and_external_links() {
        let o = Some("http://127.0.0.1:5555");
        assert!(is_allowed_frame(&Url::parse("http://127.0.0.1:5555/player.html").unwrap(), o));
        assert!(!is_allowed_frame(&Url::parse("http://127.0.0.1:9999/player.html").unwrap(), o));
        assert!(is_allowed_frame(&Url::parse("https://www.youtube.com/embed/abc").unwrap(), o));
        assert!(!is_allowed_frame(&Url::parse("https://www.youtube.com/watch?v=abc").unwrap(), o));
        assert!(is_safe_external(&Url::parse("https://www.youtube.com/watch?v=x").unwrap()));
        assert!(!is_safe_external(&Url::parse("http://www.youtube.com/").unwrap()));
        assert!(!is_safe_external(&Url::parse("https://youtube.com.evil.example/").unwrap()));
    }

    #[test]
    fn widget_sizes() {
        assert_eq!(widget_size("compact"), (180.0, 92.0));
        assert_eq!(widget_size("expanded"), (360.0, 480.0));
        assert_eq!(widget_size("nope"), (300.0, 360.0));
    }
}
