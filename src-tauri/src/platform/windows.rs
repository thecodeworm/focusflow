//! Windows: ask DWM for rounded corners (Windows 11; ignored on 10) and use a
//! layered window for opacity.

use tauri::WebviewWindow;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA, WS_EX_LAYERED,
};

fn hwnd(win: &WebviewWindow) -> Option<HWND> {
    win.hwnd().ok().map(|h| h.0 as HWND)
}

pub fn style_widget(win: &WebviewWindow, opacity: f64) {
    if let Some(h) = hwnd(win) {
        let pref = DWMWCP_ROUND;
        unsafe {
            DwmSetWindowAttribute(
                h,
                DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                &pref as *const _ as *const core::ffi::c_void,
                std::mem::size_of_val(&pref) as u32,
            );
        }
    }
    if opacity < 0.999 {
        set_opacity(win, opacity);
    }
}

pub fn set_opacity(win: &WebviewWindow, opacity: f64) {
    let Some(h) = hwnd(win) else { return };
    let alpha = (opacity.clamp(0.4, 1.0) * 255.0).round() as u8;
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        if alpha == 255 {
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex & !(WS_EX_LAYERED as isize));
        } else {
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_LAYERED as isize);
            SetLayeredWindowAttributes(h, 0, alpha, LWA_ALPHA);
        }
    }
}
