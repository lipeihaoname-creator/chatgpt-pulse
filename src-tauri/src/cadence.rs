//! Bounded interval statistics from positive output reports, never polling ticks.
use std::collections::VecDeque;
#[derive(Default)]
pub struct Cadence {
    gaps: VecDeque<f64>,
}
impl Cadence {
    pub fn observe(&mut self, seconds: f64) {
        if !seconds.is_finite() || !(2.0..=120.0).contains(&seconds) {
            return;
        }
        self.gaps.push_back(seconds);
        if self.gaps.len() > 8 {
            self.gaps.pop_front();
        }
    }
    pub fn policy(&self, floor: u32, adaptive: bool) -> (u32, Option<f64>, usize) {
        let floor = floor.clamp(10, 120);
        if self.gaps.len() < 3 {
            return (floor, None, self.gaps.len());
        }
        let mut gaps: Vec<_> = self.gaps.iter().copied().collect();
        gaps.sort_by(f64::total_cmp);
        let typical = gaps[(gaps.len() * 3).div_ceil(4).saturating_sub(1)];
        let seconds = if adaptive {
            floor.max((typical * 2.).ceil().clamp(10., 120.) as u32)
        } else {
            floor
        };
        (seconds, Some(typical), self.gaps.len())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn learning_requires_reports_and_respects_fixed_mode_floor_and_cap() {
        let mut c = Cadence::default();
        assert_eq!(c.policy(30, true).0, 30);
        for n in [20., 25., 30.] {
            c.observe(n);
        }
        assert_eq!(c.policy(30, true).0, 60);
        assert_eq!(c.policy(30, false).0, 30);
        assert_eq!(c.policy(90, true).0, 90);
        c.observe(120.);
        assert!(c.policy(30, true).0 <= 120);
    }
    #[test]
    fn bad_gaps_are_ignored_and_memory_is_bounded() {
        let mut c = Cadence::default();
        for n in [f64::NAN, -1., 0., 1., 121.] {
            c.observe(n);
        }
        assert_eq!(c.policy(30, true).2, 0);
        for _ in 0..50 {
            c.observe(25.);
        }
        assert_eq!(c.policy(30, true), (50, Some(25.), 8));
    }
}
