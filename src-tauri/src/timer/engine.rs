//! Pure Pomodoro state machine.
//!
//! The engine never reads a clock. Callers feed it elapsed milliseconds via
//! [`Engine::advance`], which makes every transition deterministic and easy to
//! test. All mutation happens behind a single mutex in the timer service, so a
//! session can only complete once.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

impl Phase {
    pub fn is_break(self) -> bool {
        !matches!(self, Phase::Focus)
    }

    pub fn label(self) -> &'static str {
        match self {
            Phase::Focus => "Focus",
            Phase::ShortBreak => "Short break",
            Phase::LongBreak => "Long break",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Durations {
    pub focus_ms: u64,
    pub short_ms: u64,
    pub long_ms: u64,
    pub long_interval: u32,
}

impl Durations {
    pub fn for_phase(&self, phase: Phase) -> u64 {
        match phase {
            Phase::Focus => self.focus_ms,
            Phase::ShortBreak => self.short_ms,
            Phase::LongBreak => self.long_ms,
        }
    }

    pub fn from_minutes(focus: u32, short: u32, long: u32, interval: u32) -> Self {
        Durations {
            focus_ms: focus as u64 * 60_000,
            short_ms: short as u64 * 60_000,
            long_ms: long as u64 * 60_000,
            long_interval: interval.max(1),
        }
    }
}

/// A session that ran to its end. Emitted exactly once per session id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Completion {
    pub session_id: u64,
    pub phase: Phase,
    pub duration_ms: u64,
    pub started_at: Option<i64>,
    pub next_phase: Phase,
    /// True when the session finished while Ringlet was not running and was
    /// settled on the next launch.
    pub recovered: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Engine {
    pub phase: Phase,
    pub status: Status,
    pub duration_ms: u64,
    pub elapsed_ms: u64,
    /// Focus sessions completed since the last long break.
    pub completed_in_cycle: u32,
    /// Monotonically increasing identifier of the current session.
    pub session_id: u64,
    /// Wall-clock time the current session was first started.
    pub started_at: Option<i64>,
}

impl Engine {
    pub fn new(d: &Durations) -> Self {
        Engine {
            phase: Phase::Focus,
            status: Status::Idle,
            duration_ms: d.focus_ms,
            elapsed_ms: 0,
            completed_in_cycle: 0,
            session_id: 1,
            started_at: None,
        }
    }

    pub fn remaining_ms(&self) -> u64 {
        self.duration_ms.saturating_sub(self.elapsed_ms)
    }

    pub fn is_running(&self) -> bool {
        self.status == Status::Running
    }

    /// Starts an idle session or resumes a paused one. Returns whether
    /// anything changed, so repeated clicks are harmless.
    pub fn start(&mut self, now_wall: i64) -> bool {
        match self.status {
            Status::Running => false,
            Status::Idle | Status::Paused => {
                if self.started_at.is_none() {
                    self.started_at = Some(now_wall);
                }
                self.status = Status::Running;
                true
            }
        }
    }

    pub fn pause(&mut self) -> bool {
        if self.status == Status::Running {
            self.status = Status::Paused;
            true
        } else {
            false
        }
    }

    pub fn toggle(&mut self, now_wall: i64) -> bool {
        if self.is_running() {
            self.pause()
        } else {
            self.start(now_wall)
        }
    }

    /// Abandons progress in the current session and returns it to idle.
    /// Abandoned sessions are never recorded.
    pub fn reset(&mut self, d: &Durations) {
        self.begin(self.phase, d);
    }

    /// Restarts the current session from zero and keeps it running.
    pub fn restart(&mut self, d: &Durations, now_wall: i64) {
        self.begin(self.phase, d);
        self.start(now_wall);
    }

    /// Moves to a specific phase without recording anything.
    pub fn set_phase(&mut self, phase: Phase, d: &Durations) {
        if phase == Phase::Focus && self.phase == Phase::LongBreak {
            self.completed_in_cycle = 0;
        }
        self.begin(phase, d);
    }

    /// Ends the current session early without recording it.
    pub fn skip(&mut self, d: &Durations) -> Phase {
        let next = match self.phase {
            Phase::Focus => Phase::ShortBreak,
            Phase::ShortBreak => Phase::Focus,
            Phase::LongBreak => {
                self.completed_in_cycle = 0;
                Phase::Focus
            }
        };
        self.begin(next, d);
        next
    }

    /// Applies new durations. A session that has not started picks up the new
    /// length immediately; an in-progress session keeps its original length.
    pub fn apply_durations(&mut self, d: &Durations) {
        if self.status == Status::Idle && self.elapsed_ms == 0 {
            self.duration_ms = d.for_phase(self.phase);
        }
    }

    /// Feeds elapsed time into a running session. Returns a completion when
    /// the session crosses its end, after which the engine sits idle in the
    /// next phase.
    pub fn advance(&mut self, delta_ms: u64, d: &Durations) -> Option<Completion> {
        if self.status != Status::Running {
            return None;
        }
        self.elapsed_ms = self.elapsed_ms.saturating_add(delta_ms);
        if self.elapsed_ms < self.duration_ms {
            return None;
        }
        Some(self.complete(d, false))
    }

    fn complete(&mut self, d: &Durations, recovered: bool) -> Completion {
        let finished = self.phase;
        let next = match finished {
            Phase::Focus => {
                self.completed_in_cycle += 1;
                if self.completed_in_cycle >= d.long_interval {
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                }
            }
            Phase::ShortBreak => Phase::Focus,
            Phase::LongBreak => {
                self.completed_in_cycle = 0;
                Phase::Focus
            }
        };
        let completion = Completion {
            session_id: self.session_id,
            phase: finished,
            duration_ms: self.duration_ms,
            started_at: self.started_at,
            next_phase: next,
            recovered,
        };
        self.begin(next, d);
        completion
    }

    fn begin(&mut self, phase: Phase, d: &Durations) {
        self.phase = phase;
        self.status = Status::Idle;
        self.duration_ms = d.for_phase(phase);
        self.elapsed_ms = 0;
        self.started_at = None;
        self.session_id += 1;
    }

    /// Reconciles a persisted engine with the time that passed while the app
    /// was not running. See the README ("Timer accuracy") for the contract:
    ///
    /// * idle and paused sessions are restored exactly;
    /// * a running session whose deadline is still ahead keeps running, with
    ///   the closed time counted;
    /// * a running session whose deadline passed is settled as completed and
    ///   the next phase is prepared without auto-starting;
    /// * if the wall clock is now *earlier* than when we saved (clock moved
    ///   back), the session is paused rather than guessed at.
    pub fn recover(mut self, saved_at: i64, now_wall: i64, d: &Durations) -> (Engine, Option<Completion>) {
        if self.status != Status::Running {
            return (self, None);
        }
        let gap = now_wall - saved_at;
        if gap < 0 {
            self.status = Status::Paused;
            return (self, None);
        }
        self.elapsed_ms = self.elapsed_ms.saturating_add(gap as u64);
        if self.elapsed_ms >= self.duration_ms {
            let c = self.complete(d, true);
            return (self, Some(c));
        }
        (self, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d() -> Durations {
        Durations::from_minutes(25, 5, 15, 4)
    }

    const MIN: u64 = 60_000;

    #[test]
    fn starts_idle_with_focus_duration() {
        let e = Engine::new(&d());
        assert_eq!(e.phase, Phase::Focus);
        assert_eq!(e.status, Status::Idle);
        assert_eq!(e.remaining_ms(), 25 * MIN);
    }

    #[test]
    fn countdown_is_exact() {
        let mut e = Engine::new(&d());
        e.start(0);
        for _ in 0..(24 * 60) {
            assert!(e.advance(1000, &d()).is_none());
        }
        assert_eq!(e.remaining_ms(), MIN);
    }

    #[test]
    fn pause_freezes_and_resume_continues() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(10 * MIN, &d());
        assert!(e.pause());
        assert!(e.advance(5 * MIN, &d()).is_none());
        assert_eq!(e.remaining_ms(), 15 * MIN);
        assert!(e.start(1));
        e.advance(MIN, &d());
        assert_eq!(e.remaining_ms(), 14 * MIN);
    }

    #[test]
    fn repeated_start_and_pause_are_idempotent() {
        let mut e = Engine::new(&d());
        assert!(e.start(5));
        assert!(!e.start(6));
        assert!(!e.start(7));
        assert_eq!(e.started_at, Some(5));
        assert!(e.pause());
        assert!(!e.pause());
        assert_eq!(e.status, Status::Paused);
    }

    #[test]
    fn reset_restores_configured_duration() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(7 * MIN, &d());
        e.reset(&d());
        assert_eq!(e.status, Status::Idle);
        assert_eq!(e.remaining_ms(), 25 * MIN);
        assert_eq!(e.started_at, None);
    }

    #[test]
    fn completion_fires_exactly_once() {
        let mut e = Engine::new(&d());
        e.start(100);
        let id = e.session_id;
        let c = e.advance(25 * MIN + 500, &d()).expect("completes");
        assert_eq!(c.session_id, id);
        assert_eq!(c.phase, Phase::Focus);
        assert_eq!(c.started_at, Some(100));
        assert_eq!(c.next_phase, Phase::ShortBreak);
        // Further ticks while idle never produce another completion.
        assert!(e.advance(25 * MIN, &d()).is_none());
        assert_eq!(e.phase, Phase::ShortBreak);
        assert_eq!(e.status, Status::Idle);
        assert_ne!(e.session_id, id);
    }

    #[test]
    fn long_break_every_interval() {
        let mut e = Engine::new(&d());
        let mut phases = vec![];
        for _ in 0..8 {
            e.start(0);
            let c = e.advance(e.duration_ms, &d()).unwrap();
            phases.push(c.next_phase);
        }
        use Phase::*;
        assert_eq!(
            phases,
            vec![ShortBreak, Focus, ShortBreak, Focus, ShortBreak, Focus, LongBreak, Focus]
        );
        assert_eq!(e.completed_in_cycle, 0);
    }

    #[test]
    fn skip_does_not_count_focus() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(MIN, &d());
        assert_eq!(e.skip(&d()), Phase::ShortBreak);
        assert_eq!(e.completed_in_cycle, 0);
        assert_eq!(e.status, Status::Idle);
        assert_eq!(e.skip(&d()), Phase::Focus);
    }

    #[test]
    fn duration_changes_apply_only_to_unstarted_sessions() {
        let mut e = Engine::new(&d());
        let longer = Durations::from_minutes(50, 10, 20, 4);
        e.apply_durations(&longer);
        assert_eq!(e.duration_ms, 50 * MIN);
        e.start(0);
        e.apply_durations(&d());
        assert_eq!(e.duration_ms, 50 * MIN);
    }

    #[test]
    fn restart_keeps_running_from_zero() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(3 * MIN, &d());
        e.restart(&d(), 10);
        assert_eq!(e.status, Status::Running);
        assert_eq!(e.remaining_ms(), 25 * MIN);
        assert_eq!(e.started_at, Some(10));
    }

    #[test]
    fn recover_running_before_deadline() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(5 * MIN, &d());
        let (r, c) = e.recover(1_000, 1_000 + 2 * MIN as i64, &d());
        assert!(c.is_none());
        assert_eq!(r.status, Status::Running);
        assert_eq!(r.remaining_ms(), 18 * MIN);
    }

    #[test]
    fn recover_running_after_deadline_completes_once() {
        let mut e = Engine::new(&d());
        e.start(0);
        let (r, c) = e.recover(0, 30 * MIN as i64, &d());
        let c = c.expect("settled");
        assert!(c.recovered);
        assert_eq!(c.phase, Phase::Focus);
        assert_eq!(r.phase, Phase::ShortBreak);
        assert_eq!(r.status, Status::Idle);
    }

    #[test]
    fn recover_with_clock_moved_back_pauses() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(4 * MIN, &d());
        let (r, c) = e.recover(10_000, 5_000, &d());
        assert!(c.is_none());
        assert_eq!(r.status, Status::Paused);
        assert_eq!(r.remaining_ms(), 21 * MIN);
    }

    #[test]
    fn recover_paused_is_exact() {
        let mut e = Engine::new(&d());
        e.start(0);
        e.advance(4 * MIN, &d());
        e.pause();
        let (r, _) = e.clone().recover(0, 99 * MIN as i64, &d());
        assert_eq!(r, e);
    }

    #[test]
    fn long_break_skip_resets_cycle() {
        let mut e = Engine::new(&d());
        e.completed_in_cycle = 4;
        e.set_phase(Phase::LongBreak, &d());
        e.skip(&d());
        assert_eq!(e.completed_in_cycle, 0);
        assert_eq!(e.phase, Phase::Focus);
    }
}
