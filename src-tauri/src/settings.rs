//! User preferences: schema, defaults, validation and tolerant loading.
//!
//! Settings are owned by the Rust side and persisted through the Tauri Store
//! plugin. Windows receive the full object via `settings://changed` and send
//! partial JSON patches back through `update_settings`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub timer: TimerSettings,
    pub appearance: AppearanceSettings,
    pub desktop: DesktopSettings,
    pub audio: AudioSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TimerSettings {
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub long_break_interval: u32,
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,
    pub count_sleep_time: bool,
    pub associate_tasks: bool,
    pub preset_id: String,
    pub custom_presets: Vec<Preset>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub long_break_interval: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppearanceSettings {
    /// "system" | "light" | "dark"
    pub theme: String,
    /// "coral" | "ocean" | "violet" | "forest" | "amber" | "graphite"
    pub accent: String,
    /// "compact" | "standard" | "expanded"
    pub widget_size: String,
    /// 0.4 – 1.0
    pub widget_opacity: f64,
    /// "thin" | "regular" | "bold"
    pub ring_style: String,
    pub animations: bool,
    pub compact_mode: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopSettings {
    pub always_on_top: bool,
    pub all_workspaces: bool,
    /// macOS: float the widget over other apps' full-screen Spaces (the widget
    /// is a non-activating panel; FocusFlow keeps its Dock icon).
    pub show_over_fullscreen: bool,
    pub launch_at_login: bool,
    pub show_tray: bool,
    pub show_tray_time: bool,
    /// "hide" | "minimize" | "quit"
    pub close_behavior: String,
    pub notifications: bool,
    pub show_widget_on_launch: bool,
    pub show_dashboard_on_launch: bool,
    pub pause_video_when_hidden: bool,
    pub shortcuts: Shortcuts,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Shortcuts {
    pub enabled: bool,
    pub toggle_timer: Option<String>,
    pub reset_timer: Option<String>,
    pub toggle_widget: Option<String>,
    pub open_dashboard: Option<String>,
    pub toggle_pin: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioSettings {
    pub sound_enabled: bool,
    /// "chime" | "bell" | "soft" | "digital"
    pub sound: String,
    pub sound_volume: f64,
    pub music_volume: f64,
    pub focus_sound_volume: f64,
    pub loop_music: bool,
    pub favorites: Vec<Favorite>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub id: String,
    pub name: String,
    pub url: String,
    /// "audio" | "youtube"
    pub source: String,
    #[serde(default)]
    pub label: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            timer: TimerSettings::default(),
            appearance: AppearanceSettings::default(),
            desktop: DesktopSettings::default(),
            audio: AudioSettings::default(),
        }
    }
}

impl Default for TimerSettings {
    fn default() -> Self {
        TimerSettings {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_interval: 4,
            auto_start_breaks: false,
            auto_start_focus: false,
            count_sleep_time: true,
            associate_tasks: true,
            preset_id: "classic".into(),
            custom_presets: vec![],
        }
    }
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        AppearanceSettings {
            theme: "system".into(),
            accent: "coral".into(),
            widget_size: "standard".into(),
            widget_opacity: 1.0,
            ring_style: "regular".into(),
            animations: true,
            compact_mode: false,
        }
    }
}

impl Default for DesktopSettings {
    fn default() -> Self {
        DesktopSettings {
            always_on_top: true,
            all_workspaces: false,
            show_over_fullscreen: true,
            launch_at_login: false,
            show_tray: true,
            show_tray_time: true,
            close_behavior: "hide".into(),
            notifications: true,
            show_widget_on_launch: true,
            show_dashboard_on_launch: true,
            pause_video_when_hidden: true,
            shortcuts: Shortcuts::default(),
        }
    }
}

impl Default for Shortcuts {
    fn default() -> Self {
        Shortcuts {
            enabled: true,
            toggle_timer: Some("CommandOrControl+Alt+Shift+P".into()),
            reset_timer: Some("CommandOrControl+Alt+Shift+R".into()),
            toggle_widget: Some("CommandOrControl+Alt+Shift+W".into()),
            open_dashboard: Some("CommandOrControl+Alt+Shift+D".into()),
            toggle_pin: Some("CommandOrControl+Alt+Shift+T".into()),
        }
    }
}

impl Default for AudioSettings {
    fn default() -> Self {
        AudioSettings {
            sound_enabled: true,
            sound: "chime".into(),
            sound_volume: 0.6,
            music_volume: 0.7,
            focus_sound_volume: 0.35,
            loop_music: true,
            favorites: vec![],
        }
    }
}

/// Built-in presets. Custom presets live in `TimerSettings::custom_presets`.
pub fn builtin_presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "classic".into(),
            name: "Classic".into(),
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_interval: 4,
        },
        Preset {
            id: "deep-work".into(),
            name: "Deep Work".into(),
            focus_minutes: 50,
            short_break_minutes: 10,
            long_break_minutes: 20,
            long_break_interval: 4,
        },
    ]
}

fn one_of(value: &mut String, allowed: &[&str], fallback: &str) {
    if !allowed.contains(&value.as_str()) {
        *value = fallback.to_string();
    }
}

fn clamp_f(v: &mut f64, lo: f64, hi: f64, fallback: f64) {
    if !v.is_finite() {
        *v = fallback;
    }
    *v = v.clamp(lo, hi);
}

impl Settings {
    /// Clamps every field into its valid range. Called after every load and
    /// every patch, so the rest of the app can trust the values.
    pub fn sanitize(&mut self) {
        let t = &mut self.timer;
        t.focus_minutes = t.focus_minutes.clamp(1, 180);
        t.short_break_minutes = t.short_break_minutes.clamp(1, 60);
        t.long_break_minutes = t.long_break_minutes.clamp(1, 90);
        t.long_break_interval = t.long_break_interval.clamp(1, 12);
        t.custom_presets.truncate(20);
        for p in &mut t.custom_presets {
            p.name = p.name.chars().take(40).collect();
            p.focus_minutes = p.focus_minutes.clamp(1, 180);
            p.short_break_minutes = p.short_break_minutes.clamp(1, 60);
            p.long_break_minutes = p.long_break_minutes.clamp(1, 90);
            p.long_break_interval = p.long_break_interval.clamp(1, 12);
        }

        let a = &mut self.appearance;
        one_of(&mut a.theme, &["system", "light", "dark"], "system");
        one_of(
            &mut a.accent,
            &["coral", "ocean", "violet", "forest", "amber", "graphite"],
            "coral",
        );
        one_of(&mut a.widget_size, &["compact", "standard", "expanded"], "standard");
        one_of(&mut a.ring_style, &["thin", "regular", "bold"], "regular");
        clamp_f(&mut a.widget_opacity, 0.4, 1.0, 1.0);

        let d = &mut self.desktop;
        one_of(&mut d.close_behavior, &["hide", "minimize", "quit"], "hide");
        for s in [
            &mut d.shortcuts.toggle_timer,
            &mut d.shortcuts.reset_timer,
            &mut d.shortcuts.toggle_widget,
            &mut d.shortcuts.open_dashboard,
            &mut d.shortcuts.toggle_pin,
        ] {
            if let Some(v) = s {
                if v.trim().is_empty() || v.len() > 64 {
                    *s = None;
                }
            }
        }

        let au = &mut self.audio;
        one_of(&mut au.sound, &["chime", "bell", "soft", "digital"], "chime");
        clamp_f(&mut au.sound_volume, 0.0, 1.0, 0.6);
        clamp_f(&mut au.music_volume, 0.0, 1.0, 0.7);
        clamp_f(&mut au.focus_sound_volume, 0.0, 1.0, 0.35);
        au.favorites.truncate(200);
        au.favorites.retain(|f| {
            (f.source == "audio" || f.source == "youtube")
                && f.url.len() <= 2048
                && f.url.starts_with("https://")
        });
        for f in &mut au.favorites {
            f.name = f.name.chars().take(120).collect();
            if let Some(l) = &mut f.label {
                *l = l.chars().take(40).collect();
            }
        }
    }

    /// Builds settings from arbitrary (possibly partial, outdated or
    /// hand-edited) JSON. Unknown keys are dropped, keys with the wrong type
    /// fall back to defaults individually instead of discarding the file.
    pub fn from_value_tolerant(value: &Value) -> (Settings, bool) {
        let mut base = serde_json::to_value(Settings::default()).expect("defaults serialize");
        let clean = merge_matching(&mut base, value);
        let mut s: Settings = serde_json::from_value(base).unwrap_or_default();
        s.sanitize();
        (s, clean)
    }

    /// Applies a partial JSON patch (deep-merged) and returns the new value.
    pub fn patched(&self, patch: &Value) -> Settings {
        let mut base = serde_json::to_value(self).expect("settings serialize");
        merge_matching(&mut base, patch);
        let mut s: Settings = serde_json::from_value(base).unwrap_or_else(|_| self.clone());
        s.sanitize();
        s
    }

    pub fn durations(&self) -> crate::timer::engine::Durations {
        crate::timer::engine::Durations::from_minutes(
            self.timer.focus_minutes,
            self.timer.short_break_minutes,
            self.timer.long_break_minutes,
            self.timer.long_break_interval,
        )
    }
}

/// Keys whose Rust type is `Option<_>` and may legitimately be null.
const NULLABLE: &[&str] = &["toggleTimer", "resetTimer", "toggleWidget", "openDashboard", "togglePin"];

fn same_kind(key: &str, a: &Value, b: &Value) -> bool {
    if NULLABLE.contains(&key) {
        return matches!(b, Value::Null | Value::String(_));
    }
    match (a, b) {
        (Value::Bool(_), Value::Bool(_)) => true,
        (Value::Number(_), Value::Number(_)) => true,
        (Value::String(_), Value::String(_)) => true,
        (Value::Array(_), Value::Array(_)) => true,
        (Value::Object(_), Value::Object(_)) => true,
        _ => false,
    }
}

/// Deep-merges `patch` into `base`, only accepting keys that exist in `base`
/// with a compatible JSON type. Returns false if anything had to be skipped.
fn merge_matching(base: &mut Value, patch: &Value) -> bool {
    let (Value::Object(b), Value::Object(p)) = (&mut *base, patch) else {
        return false;
    };
    let mut clean = true;
    let keys: Vec<String> = p.keys().cloned().collect();
    for k in keys {
        let pv = &p[&k];
        match b.get_mut(&k) {
            Some(bv @ Value::Object(_)) if pv.is_object() => {
                clean &= merge_matching(bv, pv);
            }
            Some(bv) if same_kind(&k, bv, pv) => {
                // Arrays of structs and option strings are validated by
                // serde below; reject the field if it does not parse.
                *bv = pv.clone();
            }
            _ => clean = false,
        }
    }
    // Validate field-by-field so one bad entry doesn't nuke the object.
    if let Value::Object(map) = base {
        validate_leaves(map);
    }
    clean
}

fn validate_leaves(map: &mut Map<String, Value>) {
    // Arrays must deserialize into their typed form; otherwise empty them.
    for (k, v) in map.iter_mut() {
        if let Value::Array(_) = v {
            let ok = match k.as_str() {
                "customPresets" => serde_json::from_value::<Vec<Preset>>(v.clone()).is_ok(),
                "favorites" => serde_json::from_value::<Vec<Favorite>>(v.clone()).is_ok(),
                _ => true,
            };
            if !ok {
                *v = Value::Array(vec![]);
            }
        }
        if let Some(f) = v.as_f64() {
            // Integer fields: round fractions and repair negatives so
            // sanitize() can clamp them instead of serde rejecting the file.
            if k.ends_with("Minutes") || k == "longBreakInterval" || k == "version" {
                *v = Value::from(f.round().max(0.0) as u64);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_roundtrip() {
        let s = Settings::default();
        let v = serde_json::to_value(&s).unwrap();
        let (back, clean) = Settings::from_value_tolerant(&v);
        assert!(clean);
        assert_eq!(back, s);
    }

    #[test]
    fn wrong_types_fall_back_individually() {
        let v = json!({
            "timer": { "focusMinutes": "lots", "shortBreakMinutes": 7 },
            "appearance": { "theme": 42, "accent": "violet" },
            "bogus": true
        });
        let (s, clean) = Settings::from_value_tolerant(&v);
        assert!(!clean);
        assert_eq!(s.timer.focus_minutes, 25);
        assert_eq!(s.timer.short_break_minutes, 7);
        assert_eq!(s.appearance.theme, "system");
        assert_eq!(s.appearance.accent, "violet");
    }

    #[test]
    fn sanitizes_ranges_and_enums() {
        let v = json!({
            "timer": { "focusMinutes": 9999, "longBreakInterval": 0 },
            "appearance": { "widgetSize": "huge", "widgetOpacity": 0.01 },
            "audio": { "soundVolume": 5.0 }
        });
        let (s, _) = Settings::from_value_tolerant(&v);
        assert_eq!(s.timer.focus_minutes, 180);
        assert_eq!(s.timer.long_break_interval, 1);
        assert_eq!(s.appearance.widget_size, "standard");
        assert_eq!(s.appearance.widget_opacity, 0.4);
        assert_eq!(s.audio.sound_volume, 1.0);
    }

    #[test]
    fn patch_merges_deeply() {
        let s = Settings::default();
        let n = s.patched(&json!({ "desktop": { "shortcuts": { "toggleTimer": null } } }));
        assert_eq!(n.desktop.shortcuts.toggle_timer, None);
        assert_eq!(n.desktop.shortcuts.reset_timer, s.desktop.shortcuts.reset_timer);
        assert_eq!(n.desktop.always_on_top, s.desktop.always_on_top);
    }

    #[test]
    fn invalid_favorites_are_dropped() {
        let v = json!({ "audio": { "favorites": [
            { "id": "1", "name": "ok", "url": "https://example.com/a.mp3", "source": "audio" },
            { "id": "2", "name": "bad", "url": "javascript:alert(1)", "source": "audio" }
        ] } });
        let (s, _) = Settings::from_value_tolerant(&v);
        assert_eq!(s.audio.favorites.len(), 1);
        let v = json!({ "audio": { "favorites": [{ "nope": 1 }] } });
        let (s, _) = Settings::from_value_tolerant(&v);
        assert!(s.audio.favorites.is_empty());
    }

    #[test]
    fn fractional_minutes_are_rounded() {
        let (s, _) = Settings::from_value_tolerant(&json!({ "timer": { "focusMinutes": 30.6 } }));
        assert_eq!(s.timer.focus_minutes, 31);
    }
}
