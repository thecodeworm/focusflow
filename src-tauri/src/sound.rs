//! Session-complete sounds, synthesized natively.
//!
//! Playing these from Rust (instead of a webview) means they fire reliably
//! even when every Ringlet window is hidden. No audio files are shipped.
//! The output device is opened only for the duration of the sound.

use rodio::buffer::SamplesBuffer;
use std::f32::consts::TAU;
use std::num::NonZero;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const RATE: u32 = 44_100;

static PLAYING: AtomicBool = AtomicBool::new(false);

/// A partial: frequency multiplier, relative gain, decay rate (1/s).
struct Partial(f32, f32, f32);

fn voice(freq: f32, start: f32, len: f32, partials: &[Partial], attack: f32, out: &mut [f32]) {
    let s0 = (start * RATE as f32) as usize;
    let n = (len * RATE as f32) as usize;
    for i in 0..n {
        let idx = s0 + i;
        if idx >= out.len() {
            break;
        }
        let t = i as f32 / RATE as f32;
        let env_a = (t / attack).min(1.0);
        let mut v = 0.0;
        for Partial(mult, gain, decay) in partials {
            v += gain * (TAU * freq * mult * t).sin() * (-decay * t).exp();
        }
        out[idx] += v * env_a;
    }
}

pub fn render(name: &str) -> Vec<f32> {
    let total = match name {
        "bell" => 2.4,
        "soft" => 1.8,
        "digital" => 1.0,
        _ => 1.9,
    };
    let mut out = vec![0.0f32; (total * RATE as f32) as usize];
    match name {
        "bell" => {
            let p = [
                Partial(1.0, 0.6, 2.2),
                Partial(2.76, 0.25, 3.5),
                Partial(5.4, 0.12, 6.0),
                Partial(8.93, 0.05, 9.0),
            ];
            voice(523.25, 0.0, 2.4, &p, 0.004, &mut out);
        }
        "soft" => {
            let p = [Partial(1.0, 0.55, 2.6), Partial(2.0, 0.12, 4.0)];
            voice(392.0, 0.0, 1.8, &p, 0.03, &mut out);
            voice(493.88, 0.22, 1.5, &p, 0.03, &mut out);
        }
        "digital" => {
            let p = [Partial(1.0, 0.45, 9.0), Partial(3.0, 0.08, 12.0)];
            voice(1046.5, 0.0, 0.25, &p, 0.002, &mut out);
            voice(1046.5, 0.18, 0.25, &p, 0.002, &mut out);
            voice(1318.5, 0.36, 0.5, &p, 0.002, &mut out);
        }
        _ => {
            // "chime": a gentle rising major third.
            let p = [Partial(1.0, 0.5, 3.0), Partial(2.0, 0.18, 4.5), Partial(3.0, 0.06, 6.0)];
            voice(659.25, 0.0, 1.4, &p, 0.006, &mut out);
            voice(830.61, 0.16, 1.6, &p, 0.006, &mut out);
        }
    }
    // Fade the tail to silence and normalise to avoid clipping.
    let fade = (0.08 * RATE as f32) as usize;
    let len = out.len();
    for i in 0..fade.min(len) {
        out[len - 1 - i] *= i as f32 / fade as f32;
    }
    let peak = out.iter().fold(0.0f32, |m, v| m.max(v.abs())).max(1e-6);
    for v in &mut out {
        *v /= peak;
    }
    out
}

/// Plays a sound on a background thread. Never blocks the caller. Returns an
/// error string only for invalid input; device errors are logged.
pub fn play(name: &str, volume: f64) {
    if volume <= 0.0 {
        return;
    }
    // Avoid stacking sounds if completions land back-to-back.
    if PLAYING.swap(true, Ordering::SeqCst) {
        return;
    }
    let name = name.to_string();
    let gain = (volume.clamp(0.0, 1.0) as f32).powf(1.6) * 0.8;
    std::thread::Builder::new()
        .name("ringlet-sound".into())
        .spawn(move || {
            let samples: Vec<f32> = render(&name).into_iter().map(|s| s * gain).collect();
            let secs = samples.len() as f32 / RATE as f32;
            match rodio::DeviceSinkBuilder::open_default_sink() {
                Ok(mut sink) => {
                    sink.log_on_drop(false);
                    let buf = SamplesBuffer::new(
                        NonZero::new(1).unwrap(),
                        NonZero::new(RATE).unwrap(),
                        samples,
                    );
                    sink.mixer().add(buf);
                    std::thread::sleep(Duration::from_secs_f32(secs + 0.25));
                }
                Err(err) => log::warn!("No audio output device for notification sound: {err}"),
            }
            PLAYING.store(false, Ordering::SeqCst);
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendered_sounds_are_normalised_and_finite() {
        for n in ["chime", "bell", "soft", "digital", "unknown"] {
            let s = render(n);
            assert!(!s.is_empty());
            let peak = s.iter().fold(0.0f32, |m, v| m.max(v.abs()));
            assert!(peak <= 1.0001 && peak > 0.5, "{n}: {peak}");
            assert!(s.iter().all(|v| v.is_finite()));
            assert!(s.last().unwrap().abs() < 1e-3);
        }
    }
}
