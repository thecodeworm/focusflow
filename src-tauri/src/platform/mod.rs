//! Small platform-specific window tweaks. Only public, documented OS APIs are
//! used; anything unsupported degrades to Tauri's cross-platform behavior.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use tauri::WebviewWindow;

/// Rounded corners, shadow and initial opacity for the borderless widget.
pub fn style_widget(win: &WebviewWindow, opacity: f64) {
    #[cfg(target_os = "macos")]
    macos::style_widget(win, opacity);
    #[cfg(target_os = "windows")]
    windows::style_widget(win, opacity);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = (win, opacity);
}

pub fn set_opacity(win: &WebviewWindow, opacity: f64) {
    #[cfg(target_os = "macos")]
    macos::set_opacity(win, opacity);
    #[cfg(target_os = "windows")]
    windows::set_opacity(win, opacity);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = (win, opacity);
}

/// Converts the widget into a non-activating floating panel (macOS). Returns
/// whether the conversion happened. Main thread only, before first show.
pub fn make_floating_panel(win: &WebviewWindow) -> bool {
    #[cfg(target_os = "macos")]
    return macos::make_floating_panel(win);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = win;
        false
    }
}

/// Lets the widget float above other apps' full-screen Spaces (macOS).
pub fn set_fullscreen_overlay(win: &WebviewWindow, enabled: bool, pinned: bool, all_spaces: bool) {
    #[cfg(target_os = "macos")]
    macos::set_fullscreen_overlay(win, enabled, pinned, all_spaces);
    #[cfg(not(target_os = "macos"))]
    let _ = (win, enabled, pinned, all_spaces);
}

/// Resizes with the native animation while keeping the top-left corner
/// anchored. Returns false if the platform has no native animation, in which
/// case the caller resizes instantly.
pub fn animate_resize(win: &WebviewWindow, width: f64, height: f64, animate: bool) -> bool {
    #[cfg(target_os = "macos")]
    return macos::animate_resize(win, width, height, animate);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (win, width, height, animate);
        false
    }
}
