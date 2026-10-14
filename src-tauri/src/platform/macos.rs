//! macOS: round the borderless widget with Core Animation and use AppKit's
//! own frame animation. These are public AppKit/QuartzCore APIs; no
//! `macOSPrivateApi` or transparent webview is required.

use objc2::encode::{Encode, Encoding};
use objc2::runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel};
use objc2::{class, msg_send, sel};
use std::sync::OnceLock;
use tauri::WebviewWindow;

const RADIUS: f64 = 14.0;

#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct CGPoint {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct CGSize {
    width: f64,
    height: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Debug)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

unsafe impl Encode for CGPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for CGSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for CGRect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
}

fn with_ns_window(win: &WebviewWindow, f: impl FnOnce(&AnyObject) + Send + 'static) {
    let Ok(ptr) = win.ns_window() else { return };
    let ptr = ptr as usize;
    // AppKit must be touched on the main thread.
    let _ = win.run_on_main_thread(move || {
        let obj = unsafe { &*(ptr as *const AnyObject) };
        f(obj);
    });
}

pub fn style_widget(win: &WebviewWindow, opacity: f64) {
    with_ns_window(win, move |w| unsafe {
        let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![w, setOpaque: false];
        let _: () = msg_send![w, setBackgroundColor: clear];
        let view: *mut AnyObject = msg_send![w, contentView];
        if let Some(view) = view.as_ref() {
            let _: () = msg_send![view, setWantsLayer: true];
            let layer: *mut AnyObject = msg_send![view, layer];
            if let Some(layer) = layer.as_ref() {
                let _: () = msg_send![layer, setCornerRadius: RADIUS];
                let _: () = msg_send![layer, setMasksToBounds: true];
            }
        }
        let _: () = msg_send![w, setHasShadow: true];
        let _: () = msg_send![w, setAlphaValue: opacity.clamp(0.4, 1.0)];
        let _: () = msg_send![w, invalidateShadow];
    });
}

pub fn set_opacity(win: &WebviewWindow, opacity: f64) {
    with_ns_window(win, move |w| unsafe {
        let _: () = msg_send![w, setAlphaValue: opacity.clamp(0.4, 1.0)];
    });
}

// ---- Floating panel ---------------------------------------------------------
//
// macOS shows a regular app's windows over another app's full-screen Space only
// if the window is a *non-activating panel* (NSPanel with
// NSWindowStyleMaskNonactivatingPanel), the same mechanism Spotlight-style
// overlays use. Tauri creates an NSWindow subclass ("TaoWindow"), so we
// re-class the widget's instance to a small NSPanel subclass that mirrors what
// TaoWindow adds: the `focusable` ivar and the key/main-window overrides.
// Everything used here is public Objective-C runtime / AppKit API.

const NONACTIVATING_PANEL: usize = 1 << 7;

extern "C-unwind" fn can_become_key(_: &AnyObject, _: Sel) -> Bool {
    // Lets the widget take keyboard input (Space/R/S) without activating
    // FocusFlow, which would pull the user out of a full-screen app.
    Bool::YES
}

extern "C-unwind" fn can_become_main(_: &AnyObject, _: Sel) -> Bool {
    Bool::NO
}

fn panel_class() -> Option<&'static AnyClass> {
    static CLASS: OnceLock<Option<&'static AnyClass>> = OnceLock::new();
    *CLASS.get_or_init(|| {
        let panel = AnyClass::get(c"NSPanel")?;
        let window = AnyClass::get(c"NSWindow")?;
        // Re-classing an existing object is only sound if NSPanel adds no
        // instance storage on top of NSWindow on this macOS version.
        if panel.instance_size() != window.instance_size() {
            log::warn!(
                "NSPanel layout differs from NSWindow ({} vs {} bytes); using menu-bar mode instead",
                panel.instance_size(),
                window.instance_size()
            );
            return None;
        }
        let mut b = ClassBuilder::new(c"FocusFlowPanel", panel)?;
        b.add_ivar::<Bool>(c"focusable");
        unsafe {
            b.add_method(sel!(canBecomeKeyWindow), can_become_key as extern "C-unwind" fn(_, _) -> _);
            b.add_method(sel!(canBecomeMainWindow), can_become_main as extern "C-unwind" fn(_, _) -> _);
        }
        Some(b.register())
    })
}

/// Turns the widget into a non-activating floating panel. Must be called on
/// the main thread before the window is first shown. Returns false (and
/// changes nothing) if it isn't safe on this system.
pub fn make_floating_panel(win: &WebviewWindow) -> bool {
    let Ok(ptr) = win.ns_window() else { return false };
    let Some(cls) = panel_class() else { return false };
    let obj = unsafe { &*(ptr as *const AnyObject) };
    let current = obj.class();
    // The live object (a TaoWindow) must be at least as large as the panel
    // class, including the mirrored `focusable` ivar.
    if current.instance_size() < cls.instance_size() {
        log::warn!("widget window is smaller than FocusFlowPanel; not converting");
        return false;
    }
    unsafe {
        AnyObject::set_class(obj, cls);
        let mask: usize = msg_send![obj, styleMask];
        // NSPanel's setStyleMask: is what makes the panel non-activating.
        let _: () = msg_send![obj, setStyleMask: mask | NONACTIVATING_PANEL];
        let _: () = msg_send![obj, setFloatingPanel: true];
        let _: () = msg_send![obj, setBecomesKeyOnlyIfNeeded: false];
        let _: () = msg_send![obj, setWorksWhenModal: true];
        let _: () = msg_send![obj, setHidesOnDeactivate: false];
    }
    true
}

// NSWindowCollectionBehavior bits (public AppKit constants).
const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const IGNORES_CYCLE: usize = 1 << 6;
const FULL_SCREEN_AUXILIARY: usize = 1 << 8;
const FULL_SCREEN_PRIMARY: usize = 1 << 7;
// CGWindowLevel values: kCGNormalWindowLevel = 0, kCGFloatingWindowLevel = 3,
// kCGStatusWindowLevel = 25. Full-screen Spaces sit above floating windows,
// so the overlay uses the status level (still below menus and alerts).
const NORMAL_LEVEL: isize = 0;
const FLOATING_LEVEL: isize = 3;
const STATUS_LEVEL: isize = 25;

/// Configures the widget so it can appear over other apps' full-screen
/// Spaces: it may join every Space (including full-screen ones) as an
/// auxiliary window, stays out of the ⌘` window cycle, and sits at the status
/// level while pinned. This works for a regular (Dock) app because the widget
/// is a non-activating panel (see `make_floating_panel`); if that conversion
/// wasn't possible, `crate::windows::apply_activation_policy` falls back to
/// the accessory (menu-bar) policy.
pub fn set_fullscreen_overlay(win: &WebviewWindow, enabled: bool, pinned: bool, all_spaces: bool) {
    with_ns_window(win, move |w| unsafe {
        let current: usize = msg_send![w, collectionBehavior];
        let mut next = current & !(FULL_SCREEN_AUXILIARY | CAN_JOIN_ALL_SPACES | FULL_SCREEN_PRIMARY);
        next |= IGNORES_CYCLE;
        if enabled {
            next |= FULL_SCREEN_AUXILIARY | CAN_JOIN_ALL_SPACES;
        } else if all_spaces {
            next |= CAN_JOIN_ALL_SPACES;
        }
        let _: () = msg_send![w, setCollectionBehavior: next];
        let level = match (pinned, enabled) {
            (true, true) => STATUS_LEVEL,
            (true, false) => FLOATING_LEVEL,
            (false, _) => NORMAL_LEVEL,
        };
        let _: () = msg_send![w, setLevel: level];
        // Don't vanish when FocusFlow isn't the active app.
        let _: () = msg_send![w, setHidesOnDeactivate: false];
    });
}

pub fn animate_resize(win: &WebviewWindow, width: f64, height: f64, animate: bool) -> bool {
    with_ns_window(win, move |w| unsafe {
        let frame: CGRect = msg_send![w, frame];
        // AppKit's origin is bottom-left; keep the top edge fixed.
        let top = frame.origin.y + frame.size.height;
        let next = CGRect {
            origin: CGPoint { x: frame.origin.x, y: top - height },
            size: CGSize { width, height },
        };
        let _: () = msg_send![w, setFrame: next, display: true, animate: animate];
        let _: () = msg_send![w, invalidateShadow];
    });
    true
}
