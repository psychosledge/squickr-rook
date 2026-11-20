# Slice Plan — Replay Score Display Bug

**Story:** Fix replay score display to reflect final settled scores
**Source:** Observed during UAT for bot-engine-improvements story, game-0000 (seed 12345), trick 10, E perspective
**Date:** 2026-06-15

---

### Slice 1: Fix replay score to show post-trick totals
**Scope:** The score displayed in replay/analyze-game output at trick 10 (E perspective) shows EW 150, but the final settled score is EW 185. The 35-point gap (20 most-cards bonus + 15 pts from the last trick's point cards) indicates the score is captured from `state.scores` before the final trick's points are tallied. Identify where replay perspective snapshots are written and ensure scores reflect the post-trick state rather than the pre-trick state. No changes to game logic, bot logic, or simulation output.
**Status:** not started
**Commit:** —
**Evidence:** game-0000 (seed 12345), trick 10, E perspective. Score shown: EW 150. Actual final score: EW 185. Difference: 35 pts (likely 20 most-cards bonus + 15 pts Rook/1-card from trick 10). The score appears to be snapshotted from `state.scores` at the start of the trick rather than after the trick resolves.
**Acceptance Criteria:**
- [ ] Score shown in replay perspective at the final trick reflects the fully settled score (including that trick's points and any end-of-hand bonuses)
- [ ] Scores shown mid-game (tricks 1–9) accurately reflect points scored in all completed tricks up to and including the displayed trick
- [ ] No change to simulation output format, game logic, or bot logic
- [ ] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to replay snapshot logic; investigate where perspective state is serialized to identify the off-by-one in score capture timing
