//! Monotonic clock sources.
//!
//! The timer needs two monotonic readings that are immune to wall-clock
//! changes:
//!
//! * `awake_ms` — advances only while the machine is awake.
//! * `total_ms` — advances while awake *and* while suspended.
//!
//! The difference between their deltas tells us exactly how long the system
//! slept between two ticks, which lets the user choose whether sleep counts
//! toward the running session. Neither reading is affected by the user (or
//! NTP) changing the system clock.

/// Snapshot of both clocks, in milliseconds since an arbitrary origin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClockReading {
    pub awake_ms: u64,
    pub total_ms: u64,
}

pub fn now() -> ClockReading {
    imp::now()
}

/// Wall-clock time in Unix epoch milliseconds. Only used for persistence and
/// history, never as the source of truth for an active countdown.
pub fn wall_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(target_os = "macos")]
mod imp {
    use super::ClockReading;

    extern "C" {
        // Declared in <time.h> since macOS 10.12.
        fn clock_gettime_nsec_np(clock_id: libc::clockid_t) -> u64;
    }

    pub fn now() -> ClockReading {
        // CLOCK_UPTIME_RAW does not advance while asleep; CLOCK_MONOTONIC_RAW
        // does. Both are unaffected by settimeofday.
        let awake = unsafe { clock_gettime_nsec_np(libc::CLOCK_UPTIME_RAW) };
        let total = unsafe { clock_gettime_nsec_np(libc::CLOCK_MONOTONIC_RAW) };
        ClockReading {
            awake_ms: awake / 1_000_000,
            total_ms: total / 1_000_000,
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::ClockReading;
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::System::WindowsProgramming::QueryUnbiasedInterruptTime;

    pub fn now() -> ClockReading {
        // QueryUnbiasedInterruptTime excludes time spent in sleep/hibernate
        // (100 ns units); GetTickCount64 includes it (ms).
        let mut unbiased: u64 = 0;
        unsafe { QueryUnbiasedInterruptTime(&mut unbiased) };
        let total = unsafe { GetTickCount64() };
        ClockReading {
            awake_ms: unbiased / 10_000,
            total_ms: total,
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod imp {
    use super::ClockReading;

    fn read(clock: libc::clockid_t) -> u64 {
        let mut ts = libc::timespec { tv_sec: 0, tv_nsec: 0 };
        unsafe { libc::clock_gettime(clock, &mut ts) };
        ts.tv_sec as u64 * 1000 + ts.tv_nsec as u64 / 1_000_000
    }

    pub fn now() -> ClockReading {
        ClockReading {
            awake_ms: read(libc::CLOCK_MONOTONIC),
            total_ms: read(libc::CLOCK_BOOTTIME),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clocks_are_monotonic() {
        let a = now();
        std::thread::sleep(std::time::Duration::from_millis(20));
        let b = now();
        assert!(b.awake_ms >= a.awake_ms + 15);
        assert!(b.total_ms >= a.total_ms + 15);
    }
}
