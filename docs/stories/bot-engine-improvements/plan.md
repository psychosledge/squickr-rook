# Slice Plan — Bot Engine Improvements (Analysis-Driven)

**Story:** Iterative bot card-play improvements identified through replay analysis
**Source:** Findings from running the Phase 1 simulation pipeline and reviewing games in `/replay`
**Date:** 2026-06-13

Each slice here traces back to a specific observed game/trick. New slices are added as analysis surfaces new gaps.

---

### Slice 1: Defender lead — exploit known bidder void to force trump
**Scope:** In `packages/engine/src/bot.ts`, improve the defending team's lead selection logic. When the bot is leading and `trackPlayedCards` is enabled, check if any bidding-team player is known void in a suit (they failed to follow that suit in a previous trick). If so, prioritize leading that suit to force the bidder to spend trump. Applies only when defending and the bidder still holds trump. No changes to bid logic, discard logic, or non-lead card play.
**Status:** ✅ done
**Commit:** 8dd45b5
**Evidence:** game-0000 (seed 12345), trick 3, N perspective. N holds B13 and knows E is void in Black (E trumped trick 1's Black lead with Y5). Bot led G12; E won with G14 at zero trump cost. A Black lead forces E to burn a trump. Also confirmed trick 5, N perspective: bot led G10 when B13 would have forced E to trump (0-pt trick) or sluff G1 (NS captures 15 pts); instead E won G10+G1 = 25 pts at zero trump cost.
**Acceptance Criteria:**
- [x] When defending and `trackPlayedCards` is true, bot identifies suits in which a bidding-team player is known void
- [x] Bot preferentially leads a void-forcing suit over an arbitrary off-suit card when one is available
- [x] Existing trump-pull behavior (Slice 1 of Phase 1) is unchanged
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — change is isolated to the lead-selection branch of `botChooseCommand` for defending bots

---

### Slice 2: Lead any suit — prefer cheapest non-point card when a higher card is unaccounted
**Scope:** In `packages/engine/src/bot.ts`, in the lead selection logic for both teams: when `trackPlayedCards` is true and the bot is leading a suit (trump or off-suit), check whether any card ranked above the bot's candidate lead in that suit is unaccounted (not in `state.playedCards` and not in the bot's own hand). If so, prefer the lowest available 0-pt card in that suit rather than spending a point card into a potential loss. If the bot holds only point cards in the suit, lead the lowest point card (minimize loss). Applies to all lead contexts — bidding team pulling trump, bidding team leading off-suit, and defending team leading off-suit. Void-force logic (Slice 1) takes precedence for defenders when a known void opportunity is available. No changes to bid logic, discard logic, or follow-card play. *(Merges the original Slice 2 trump-lead case and Slice 3 off-suit defender case — same principle, unified implementation.)*
**Status:** ✅ done
**Commit:** 8e54aa3
**Evidence (trump):** game-0000 (seed 12345), trick 2, E perspective. E led Y14 (10 pts) with Y1 unaccounted; N played Y1, NS captured 25 pts. Leading Y6 instead loses nothing — same trump-pull effect, 10 pts saved.
**Evidence (off-suit):** game-0000 (seed 12345), trick 5, N perspective. N holds G7, G9, G10; highest remaining Green is G1 (unaccounted). Bot led G10; E won with G1, EW scored 25 pts. Leading G7 limits EW to 15 pts.
**Acceptance Criteria:**
- [x] When leading any suit with `trackPlayedCards: true`, if any card ranked above the bot's candidate lead in that suit is unaccounted, bot leads the lowest available 0-pt card in that suit instead
- [x] If the bot holds the highest remaining card in the suit (all higher cards accounted), it may safely lead a point card — logic does not suppress it
- [x] If the bot holds only point cards in the suit, it leads the lowest point card (minimize loss)
- [x] Void-force behavior (Slice 1) takes precedence for defenders when a known void is available
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to the lead-selection branch of `botChooseCommand`; applies in both bidding-team and defending-team lead paths

---

### ~~Slice 3~~ *(merged into Slice 2)*

---

### Slice 4: Defender lead — prefer short cheap suits to enable voiding
**Scope:** In `packages/engine/src/bot.ts`, in the defending team's lead selection logic: when leading and `trackPlayedCards` is true, prefer leading from the shortest off-suit where all (or most) cards are 0-pt over leading from the longest off-suit. Void-force logic (Slice 1) takes precedence. Applies only when a short (≤2 card) 0-pt suit exists and the bot holds limited trump (≤2 trump cards).
**Status:** ✅ done
**Commit:** 802a04a
**Evidence:** game-0000 (seed 12345), trick 1, S perspective. S holds 5 Black (B8–B12), 2 Red (R7, R10), 2 Green (G6, G8), 1 trump (Y11). Bot led B12; E (void in Black, P≈20–25% with bidder discard adjustment) trumped with Y5, EW won 30 pts including N's B1. Leading G6 would have cost EW ≤10 pts and begun a 2-trick void sequence giving S future trump opportunities.
**Acceptance Criteria:**
- [x] When defending with `trackPlayedCards: true`, if a ≤2-card suit exists where all cards are 0-pt, bot prefers leading from it over longer suits
- [x] If no 0-pt short suit exists, behavior falls back to current logic
- [x] Void-force behavior (Slice 1) takes precedence over this heuristic when a known void is available
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to the lead-selection branch of `botChooseCommand` for defending bots

---

### Slice 5: Follower — prefer cheap cards when highest remaining card in suit is unplayed
**Scope:** In `packages/engine/src/bot.ts`, in the follow-suit card selection logic: when `trackPlayedCards` is true and the bot must follow a led suit, if the highest remaining card in that suit is unplayed (and not in the bot's hand), prefer 0-point cards over point-valued cards rather than playing up toward the top. Applies to both bidding and defending team followers.
**Status:** ✅ done
**Commit:** 66be698
**Evidence:** game-0000 (seed 12345), trick 1, W perspective. W is E's partner (bidding team). S led B12. W played B14 (10 pts); B1 unplayed, N beat W's B14 with B1, then E trumped to salvage the trick. Playing B6 would cost NS nothing (N wins cheaply with B13, E saves trump), with same or better expected outcome. Note: same principle as Slice 3 (protect point cards on likely-losing tricks) applied to following rather than leading — could be implemented as an extension of Slice 3's scope.
**Acceptance Criteria:**
- [x] When following a suit with `trackPlayedCards: true` and the highest remaining card in that suit is unplayed and not in the bot's hand, bot prefers 0-pt followers over point-card followers
- [x] Logic does not suppress playing a point card when the bot holds the highest remaining card (playing to win is correct)
- [x] Applies regardless of whether the bot is on the bidding or defending team
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to the follow-suit card selection branch of `botChooseCommand`

---

### Slice 6: Defender lead — prefer cheapest card within void-forcing suit
**Scope:** In `packages/engine/src/bot.ts`, in the void-forcing lead selection introduced in Slice 1: when multiple cards are available in the void-forcing suit, prefer the lowest 0-pt card rather than the highest-ranked card. A B6 forces the same trump spend as a B13 but preserves the point card for a winnable trick.
**Status:** ✅ done
**Commit:** 60c1da4
**Evidence:** Surfaced during Slice 1 code review. Slice 1 selects `reduce((best, cmd) => offSuitRank(cmd) > offSuitRank(best) ? cmd : best)` — highest ranked wins. Leading the cheapest card in the void suit is strictly superior: same trump-forcing outcome, lower opportunity cost.
**Acceptance Criteria:**
- [x] When void-forcing and multiple cards exist in the void suit, bot leads the lowest 0-pt card rather than the highest-ranked card
- [x] If all cards in the void suit are point-valued, falls back to leading the lowest point card (minimize loss)
- [x] Slice 1 void-forcing behavior (leads void suit over non-void suit) is unchanged
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to the candidate-selection reduce within the void-forcing block of `chooseLeadCard`

---

### Slice 7: Discard to create void — prefer shortest 0-pt suit when unable to follow
**Scope:** In `packages/engine/src/bot.ts`, in the discard-selection logic of `chooseFollowCard` when the bot cannot follow the led suit: when `trackPlayedCards` is true and `sluffStrategy` is true, among 0-pt discard candidates, prefer the card from the non-trump suit with the fewest cards remaining in hand. This prioritizes making progress toward a void (shorter suits get voided sooner, enabling future sluff-to-partner opportunities) over arbitrary suit selection. If all non-trump discard candidates are point cards, fall back to current logic. Applies to both teams. Mirrors the Slice 4 lead heuristic ("prefer shortest 0-pt suit") in the discard context.
**Status:** ✅ done
**Commit:** d277465
**Evidence:** game-0000 (seed 12345), trick 4, S perspective. S's hand: B12 R10 B8 G8 B10 B9 B11. E led Y7 (trump); S void in trump, must discard. S played B8 (from 5-card Black suit, 5 cards). Should have played G8 — S's only Green card (0-pt, 1 card in suit). Discarding G8 creates a Green void in one trick; discarding B8 makes no progress toward any void. Both are 0-pt, so suit size is the right tiebreaker.
**Acceptance Criteria:**
- [x] When unable to follow led suit with `trackPlayedCards: true` and `sluffStrategy: true`, among 0-pt discard candidates, bot prefers the card from the non-trump suit with the fewest cards remaining
- [x] Point cards (5, 10, 14, 1, ROOK) are never selected by this logic; if only point cards remain as candidates, falls back to current behavior
- [x] If all 0-pt suits have equal size, behavior is unchanged from current logic
- [x] Applies to both bidding and defending teams
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — isolated to the discard-path of `chooseFollowCard`

---

### Slice 8: Fix replay score display and show discards on last trick
**Scope:** Two related fixes to the replay/analyze-game output for trick 10: (1) The score is captured from `state.scores` before the final trick's points are tallied — fix the snapshot timing so trick 10 reflects the fully settled score (trick points + most-cards bonus + nest bonus). (2) Display the bidder's discarded nest cards alongside trick 10 regardless of perspective, so viewers can see why the score jumps (the nest cards join the last-trick winner's pile). Scores for tricks 1–9 should also reflect post-trick totals. No changes to game logic, bot logic, or the simulation NDJSON output format.
**Status:** ✅ done
**Commit:** 17be04f
**Evidence:** game-0000 (seed 12345), trick 10, E perspective. Score shown: EW 150. Actual final score: EW 185. Difference: 35 pts (20 most-cards bonus + 15 pts from trick 10 point cards + nest bonus). Score appears to be snapshotted from `state.scores` at trick start. The discards are not shown, making the point jump unexplained.
**Acceptance Criteria:**
- [x] Score shown in replay perspective at the final trick reflects the fully settled score (trick points + nest bonus + most-cards bonus)
- [x] Scores shown mid-game (tricks 1–9) accurately reflect points scored in all completed tricks up to and including the displayed trick
- [x] Bidder's discarded nest cards are displayed alongside trick 10 in replay, regardless of which seat's perspective is shown
- [x] No change to simulation NDJSON output format, game logic, or bot logic
- [x] `pnpm --filter web test --run` passes with no regressions
**Needs Architect:** no — isolated to replay snapshot and display logic; investigate where perspective state is serialized and where trick 10 is rendered

---

## UAT Checklist
✅ UAT accepted 2026-06-15

### Defender void-lead (Slice 1)
- [x] Run `pnpm --filter engine simulate --games 500 --seed 12345`; load results in `/replay`
- [x] Find a game where the defender leads after an opponent trumped an off-suit trick; confirm the bot leads the voided suit rather than an unrelated off-suit card
- [x] Confirm the bot still leads highest trump when pulling trump (Phase 1 Slice 1 regression check)
- [x] `pnpm --filter engine test` passes
