# Slice Plan — Bot Engine Improvements (Analysis-Driven)

**Story:** Iterative bot card-play improvements identified through replay analysis
**Source:** Findings from running the Phase 1 simulation pipeline and reviewing games in `/replay`
**Date:** 2026-06-13

Each slice here traces back to a specific observed game/trick. New slices are added as analysis surfaces new gaps.

---

### Slice 1: Defender lead — exploit known bidder void to force trump
**Scope:** In `packages/engine/src/bot.ts`, improve the defending team's lead selection logic. When the bot is leading and `trackPlayedCards` is enabled, check if any bidding-team player is known void in a suit (they failed to follow that suit in a previous trick). If so, prioritize leading that suit to force the bidder to spend trump. Applies only when defending and the bidder still holds trump. No changes to bid logic, discard logic, or non-lead card play.
**Status:** not started
**Commit:** —
**Evidence:** game-0000 (seed 12345), trick 3, N perspective. N holds B13 and knows E is void in Black (E trumped trick 1's Black lead with Y5). Bot led G12; E won with G14 at zero trump cost. A Black lead forces E to burn a trump.
**Acceptance Criteria:**
- [ ] When defending and `trackPlayedCards` is true, bot identifies suits in which a bidding-team player is known void
- [ ] Bot preferentially leads a void-forcing suit over an arbitrary off-suit card when one is available
- [ ] Existing trump-pull behavior (Slice 1 of Phase 1) is unchanged
- [ ] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — change is isolated to the lead-selection branch of `botChooseCommand` for defending bots

---

### Slice 2: Trump pull — prefer lowest 0-pt trump when Y1 unaccounted
**Scope:** In `packages/engine/src/bot.ts`, in the bidding team's trump-pull lead selection: when `trackPlayedCards` is true and Y1 has not been played, skip point-card trump leads (Y14, Y10) in favor of the lowest available 0-pt trump card. If the bot holds only point-card trump, fall back to current behavior.
**Status:** not started
**Commit:** —
**Evidence:** game-0000 (seed 12345), trick 2, E perspective. E led Y14 (10 pts) with Y1 unaccounted; N played Y1, NS captured 25 pts. Leading Y6 instead forces N to spend Y13 on a 0-pt trick while preserving E's Y12 for future pulls.
**Acceptance Criteria:**
- [ ] When pulling trump with `trackPlayedCards: true` and Y1 unplayed, bot leads the lowest 0-pt trump card from its hand rather than a point-card trump (Y14, Y10)
- [ ] If the bot holds only point-card trump, it falls back to current highest-trump-first behavior
- [ ] Slice 1 defender void-lead behavior is unchanged
- [ ] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — change is isolated to the trump lead candidate selection in `botChooseCommand`

---

## UAT Checklist
(Complete after all slices are implemented and committed)

### Defender void-lead (Slice 1)
- [ ] Run `pnpm --filter engine simulate --games 500 --seed 12345`; load results in `/replay`
- [ ] Find a game where the defender leads after an opponent trumped an off-suit trick; confirm the bot leads the voided suit rather than an unrelated off-suit card
- [ ] Confirm the bot still leads highest trump when pulling trump (Phase 1 Slice 1 regression check)
- [ ] `pnpm --filter engine test` passes
