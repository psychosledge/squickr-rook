# ADR-011: Bot UAT Bug Fixes — Sluff Guard, Ace Safety, Opponent-Lead Passivity

**Status:** Proposed  
**Date:** 2026-03-14  
**Context:** Three bugs found during UAT of ADR-010 play improvements.

---

## Context

After shipping ADR-010, UAT revealed three distinct misbehaviours in bot play:

1. **Bug A – Premature sluff:** An L4/L5 bot calls `chooseBestSluffCard` (dumps high-value points to partner) when the partner is currently winning, but a subsequent opponent play overrides the partner. The points end up with the opponent.

2. **Bug B – Ace leads into opponent voids with trump outstanding:** The defending-team path (ADR-010 Fix 3) skips aces only on early leads (tricks 1–3). But a non-trump ace is _never_ safe to lead if any trump remains unplayed and opponents could be void — the ambush risk persists the whole game.

3. **Bug C – No L3 passivity when opponent is winning:** ADR-010 Fix 1B gives L3 bots cheapest-card passivity when the _partner_ is winning. There is no mirror: when an _opponent_ is winning and the L3 bot cannot beat them, it still plays high-value cards unnecessarily.

---

## Affected Files

- `packages/engine/src/bot.ts` — two functions modified: `chooseFollowCard` (Fix A + Fix C) and `chooseLeadCard` (Fix B)
- `packages/engine/src/__tests__/bot.test.ts` — 16 new tests

`buildDeck` is exported from `deck.ts` but not yet imported in `bot.ts`. It must be added to the existing import on line 2.

---

## Decisions

### Fix A — `partnerWinIsGuaranteed` look-ahead guard

**Problem:** `sluffStrategy && partnerIsWinning` fires too early. Partner wins at bot's play moment, but a later opponent can override.

**Solution:** Add helper `partnerWinIsGuaranteed(state, currentWinnerPlay, leadColor, trump, seat)`. Guard `chooseBestSluffCard` with it.

**Helper pseudocode:**
```
function partnerWinIsGuaranteed(state, currentWinnerPlay, leadColor, trump, seat):
  seatsInTrick = set of seats that have already played this trick (from state.currentTrick)
  remainingSeats = [N, E, S, W] minus seatsInTrick minus seat (bot itself)
  partner = partnerOf(seat)
  opponentSeatsRemaining = remainingSeats minus partner

  if opponentSeatsRemaining.length === 0: return true  // no opponents left

  knownCards = state.playedCards + state.currentTrick cards + state.hands[seat]
  unknownCards = buildDeck() minus knownCards

  anyUnknownBeats = unknownCards.some(c => compareTrickCards(c, currentWinnerPlay.cardId, leadColor, trump) > 0)

  if !anyUnknownBeats: return true   // no card in existence can beat winner
  return false                       // opponents still to play and could hold beaters
```

**Change in `chooseFollowCard`:** Replace:
```typescript
if (profile.sluffStrategy && partnerIsWinning) {
```
with:
```typescript
if (profile.sluffStrategy && partnerIsWinning && partnerWinIsGuaranteed(state, currentWinnerPlay, leadColor, trump, seat)) {
```

---

### Fix B — `aceIsSafe` check in `chooseLeadCard` defending path

**Problem:** `isEarlyLead` (tricks 1–3) is a proxy for ace safety. The real condition is whether trump is exhausted — if any trump remains, a void opponent can ruff the ace.

**Solution:** Replace `isEarlyLead` with `!aceIsSafe(state, trump)`.

**Helper pseudocode:**
```
function aceIsSafe(state, trump):
  if trump === null: return true         // no trump suit; can't be ruffed
  trumpPlayed = count of state.playedCards where trumpRank(c, trump) >= 0
  return trumpPlayed >= 11               // all 11 trump exhausted (10 regular + ROOK)
```

**Change in `chooseLeadCard` defending non-trump block (around line 761–776):**

Replace:
```typescript
const isEarlyLead = state.tricksPlayed <= 2;
let leadCandidates = suitCards;
if (isEarlyLead) {
  const nonPointLeads = suitCards.filter((c) => {
    if (c.type !== "PlayCard") return false;
    const card = cardFromId(c.cardId);
    return card.kind === "regular" && card.value !== 1 && card.value !== 14;
  });
  if (nonPointLeads.length > 0) leadCandidates = nonPointLeads;
}
```

With:
```typescript
const acesAreSafe = aceIsSafe(state, trump);
let leadCandidates = suitCards;
if (!acesAreSafe) {
  const nonAceLeads = suitCards.filter((c) => {
    if (c.type !== "PlayCard") return false;
    const card = cardFromId(c.cardId);
    return card.kind === "regular" && card.value !== 1 && card.value !== 14;
  });
  if (nonAceLeads.length > 0) leadCandidates = nonAceLeads;
}
```

---

### Fix C — L3 cheapest-card passivity when opponent is winning

**Problem:** ADR-010 Fix 1B (partner winning → cheapest non-winning card) has no mirror for opponent-winning case.

**Solution:** After the Fix 1B block in `chooseFollowCard` (around line 866), add:

```typescript
// ADR-011 Fix C: L3 cheapest-card passivity when opponent winning and bot cannot win
if (profile.roleAwareness && !profile.sluffStrategy && !partnerIsWinning) {
  if (winningCommands.length === 0) {
    return chooseLowestCard(playCommands);
  }
  // Can win — fall through to normal win logic
}
```

---

## Import Change

Add `buildDeck` to the existing deck.js import in `bot.ts` line 2:

```typescript
// Before
import { compareTrickCards, cardFromId, offSuitRank, trumpRank } from "./deck.js";

// After
import { buildDeck, compareTrickCards, cardFromId, offSuitRank, trumpRank } from "./deck.js";
```

---

## Test Plan (16 tests across 3 describe blocks in `bot.test.ts`)

### `describe('ADR-011 Fix A: partnerWinIsGuaranteed guard')`

1. L4 bot does NOT sluff when partner winning but last opponent seat hasn't played yet (unknown cards can beat winner)
2. L4 bot DOES sluff when partner winning and both opponents have already played (no opponents remaining)
3. L4 bot DOES sluff when partner winning and current winner holds the highest possible card (no unknown card can beat it)
4. L5 bot (sluffStrategy=true) respects the guard identically to L4
5. L3 bot (sluffStrategy=false) is unaffected by Fix A

### `describe('ADR-011 Fix B: aceIsSafe in defending lead')`

1. Defending bot avoids leading ace when 0 trump have been played
2. Defending bot avoids leading ace when trump partially played (5 of 11)
3. Defending bot leads ace freely when all 11 trump played (aceIsSafe=true)
4. Defending bot leads ace freely when trump=null (no trump suit)
5. Defending bot forced to lead ace when no non-ace/non-14 alternatives exist
6. Fix is independent of trick number — trick 5, trump not exhausted → still avoids ace

### `describe('ADR-011 Fix C: L3 opponent-winning passivity')`

1. L3 bot sheds cheapest card when opponent winning and bot cannot beat them
2. L3 bot still contests (plays winning card) when opponent winning but bot HAS a winning card
3. L4 bot (sluffStrategy=true) is NOT affected by Fix C
4. L2 bot (roleAwareness=false) is NOT affected by Fix C
5. Fix 1B and Fix C coexist: partnerIsWinning → Fix 1B fires; !partnerIsWinning + can't win → Fix C fires

---

## Consequences

- **Positive:** Eliminates three concrete UAT bugs with targeted, well-scoped fixes.
- **Positive:** Fix B is strictly more correct — ace leads genuinely risk being ruffed whenever trump is not exhausted.
- **Neutral:** Fix A adds one O(N) scan of unknown cards (N ≤ 45) per L4/L5 follow play. Negligible.
- **Neutral:** Fix C only fires when the bot cannot win anyway — zero impact on aggressive play.
- **Risk:** Fix B may occasionally force a bot to lead a 14 instead of ace. This is correct — 14s are also vulnerable. The filter excludes both value=1 and value=14.

---

## SOLID Alignment

- **SRP:** Each helper (`partnerWinIsGuaranteed`, `aceIsSafe`) has one clear responsibility.
- **OCP:** The guard wraps existing behavior without changing `chooseBestSluffCard`.
- **DRY:** `aceIsSafe` replaces the inline `isEarlyLead` check, centralizing the ace-safety concept.

---

*End of ADR-011*
