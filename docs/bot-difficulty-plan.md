# Bot Difficulty System — Implementation Plan

**Status:** Approved — ready for implementation
**Author:** Architecture Alex
**Date:** 2026-03-08
**Target files:**
- `packages/engine/src/types.ts` — `BotDifficulty`, `BotProfile`, `BOT_PRESETS`
- `packages/engine/src/bot.ts` — all AI logic
- `apps/web/src/store/gameStore.types.ts` — `AppState`, `AppActions`
- `apps/web/src/store/gameStore.ts` — `startGame`, `setBotDifficulty`
- `apps/web/src/pages/LobbyPage.tsx` (or new `/setup` route — see Section 2)

---

## Section 1: Overview & Goals

### What We're Building

A five-level bot difficulty system for Squickr Rook that replaces the current three-string-level system (`"easy" | "normal" | "hard"`). The new system uses a **numeric 1–5 scale** with rich, independently-tunable AI profiles per bot seat.

### Why This Matters

The current system has two concrete exploits:

1. **Bidding exploit:** Easy bots always pass; Normal/Hard bots bid on a static hand-strength threshold with no bluff resistance. A human can always win the bid at the minimum (100) or sandbag opponents off their good hands.
2. **Card-play exploit:** Bots have no concept of team roles. A "hard" bot leads trump aggressively even when it is on the defending team trying to set the bidder. No void exploitation, no endgame nest awareness.

This plan fixes both exploits across all five levels, calibrated so that Level 1 (Beginner) is genuinely bad and Level 5 (Expert) is genuinely difficult.

---

## Section 2: UX Architecture Decision

### Recommendation: Separate `/setup` Route (Option B)

> **Implementation note:** The per-seat difficulty UI described here is deferred to **Phase 3**. Phases 1 and 2 use a single global `botDifficulty` value (store field) and a single picker in `LobbyPage`. Phase 3 replaces this with `botDifficulties: Record<"E"|"S"|"W", BotDifficulty>` and the full `SetupPage` described below.

LobbyPage becomes a pure launcher: title → "New Game" → "Play Online". Tapping "New Game" navigates to `/setup`, which has the full per-bot difficulty UI, then a "Start Game" button that navigates to `/game`.

```
LobbyPage (/)              SetupPage (/setup)
┌─────────────────┐        ┌─────────────────────┐
│   Squickr Rook  │        │  < Back             │
│ 2v2 trick-taking│  →     │  Bot Difficulty     │
│                 │        │                     │
│  [ New Game ]   │        │  East    1·2·3·4·5  │
│  [Play Online ] │        │  Partner 1·2·3·4·5  │
└─────────────────┘        │  West    1·2·3·4·5  │
                           │                     │
                           │  [ Set All: 3 ]     │
                           │  [ Start Game ]     │
                           └─────────────────────┘
```

**Rationale:**
1. Mobile-first clarity — each screen does one thing.
2. Progressive disclosure — new players tap "New Game" then "Start" without seeing complexity. They play at Normal (Level 3) by default.
3. Expandability — the `/setup` screen can later accommodate rules variants, player names, etc.
4. Clean implementation — `LobbyPage` gets simpler; `SetupPage` owns per-seat difficulty state.

---

## Section 3: BotDifficulty Type

**Decision: Numeric literal union** over strings — the bot AI code constantly does numeric comparisons (`difficulty >= 4`), so numeric is the natural choice.

```typescript
// packages/engine/src/types.ts

/** 1=Beginner, 2=Easy, 3=Normal, 4=Hard, 5=Expert */
export type BotDifficulty = 1 | 2 | 3 | 4 | 5;

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  1: "Beginner",
  2: "Easy",
  3: "Normal",
  4: "Hard",
  5: "Expert",
};

export const ALL_BOT_DIFFICULTIES: BotDifficulty[] = [1, 2, 3, 4, 5];
```

---

## Section 4: New BotProfile Type

```typescript
export type BotProfile = {
  difficulty: BotDifficulty;

  // Bidding parameters
  handValuationAccuracy: number;  // 0=random noise, 1=perfect
  bidAggressiveness: number;      // multiplier on computed bid ceiling
  bluffResistance: number;        // 0=fold at ceiling, 1=push 30pts above
  scoreContextAwareness: boolean; // adjust bid based on score delta
  canShootMoon: boolean;          // levels 3-5 (level 3 at high threshold)
  moonShootThreshold: number;     // min hand strength for moon shoot
  contextualMoonShoot: boolean;   // Expert only: lower threshold situationally

  // Discard parameters
  voidExploitation: number;       // 0=none, 0.5=one void, 0.8+=two voids

  // Card-play parameters
  playAccuracy: number;           // probability of optimal play
  trackPlayedCards: boolean;      // enables card memory
  trumpManagement: number;        // 0=random, 0.5=basic, 1=expert
  sluffStrategy: boolean;         // dump points on partners winning tricks
  endgameCardAwareness: number;   // 0=none, 0.5+=adjusts when tricksPlayed>=7
  roleAwareness: boolean;         // bidding vs defending team strategy
};
```

### BOT_PRESETS — All 5 Levels

```typescript
export const BOT_PRESETS: Record<BotDifficulty, BotProfile> = {
  1: {
    difficulty: 1,
    handValuationAccuracy: 0.0,
    bidAggressiveness:     0.7,
    bluffResistance:       0.0,
    scoreContextAwareness: false,
    canShootMoon:          false,
    moonShootThreshold:    999,
    contextualMoonShoot:   false,
    voidExploitation:      0.0,
    playAccuracy:          0.15,
    trackPlayedCards:      false,
    trumpManagement:       0.0,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         false,
  },
  2: {
    difficulty: 2,
    handValuationAccuracy: 0.4,
    bidAggressiveness:     0.85,
    bluffResistance:       0.1,
    scoreContextAwareness: false,
    canShootMoon:          false,
    moonShootThreshold:    999,
    contextualMoonShoot:   false,
    voidExploitation:      0.0,
    playAccuracy:          0.45,
    trackPlayedCards:      false,
    trumpManagement:       0.2,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         false,
  },
  3: {
    difficulty: 3,
    handValuationAccuracy: 0.75,
    bidAggressiveness:     1.0,
    bluffResistance:       0.3,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    110,    // allowed at Level 3 — even beginners can have a moon hand
    contextualMoonShoot:   false,
    voidExploitation:      0.5,
    playAccuracy:          0.70,
    trackPlayedCards:      true,
    trumpManagement:       0.5,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         true,
  },
  4: {
    difficulty: 4,
    handValuationAccuracy: 0.90,
    bidAggressiveness:     1.1,
    bluffResistance:       0.6,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    90,
    contextualMoonShoot:   false,
    voidExploitation:      0.8,
    playAccuracy:          0.90,
    trackPlayedCards:      true,
    trumpManagement:       0.7,
    sluffStrategy:         true,
    endgameCardAwareness:  0.5,
    roleAwareness:         true,
  },
  5: {
    difficulty: 5,
    handValuationAccuracy: 1.0,
    bidAggressiveness:     1.15,
    bluffResistance:       1.0,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    75,    // contextual triggers lower this further (see Section 5.5)
    contextualMoonShoot:   true,
    voidExploitation:      1.0,
    playAccuracy:          1.0,
    trackPlayedCards:      true,
    trumpManagement:       1.0,
    sluffStrategy:         true,
    endgameCardAwareness:  1.0,
    roleAwareness:         true,
  },
};
```

### Parameter Summary Table

| Parameter | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|---|---|---|---|---|---|
| `handValuationAccuracy` | 0.0 | 0.4 | 0.75 | 0.90 | 1.0 |
| `bidAggressiveness` | 0.7 | 0.85 | 1.0 | 1.1 | 1.15 |
| `bluffResistance` | 0.0 | 0.1 | 0.3 | 0.6 | 1.0 |
| `scoreContextAwareness` | false | false | true | true | true |
| `canShootMoon` | false | false | true | true | true |
| `moonShootThreshold` | 999 | 999 | 110 | 90 | 75 |
| `contextualMoonShoot` | false | false | false | false | true |
| `voidExploitation` | 0.0 | 0.0 | 0.5 | 0.8 | 1.0 |
| `playAccuracy` | 0.15 | 0.45 | 0.70 | 0.90 | 1.0 |
| `trackPlayedCards` | false | false | true | true | true |
| `trumpManagement` | 0.0 | 0.2 | 0.5 | 0.7 | 1.0 |
| `sluffStrategy` | false | false | false | true | true |
| `endgameCardAwareness` | 0.0 | 0.0 | 0.0 | 0.5 | 1.0 |
| `roleAwareness` | false | false | true | true | true |

---

## Section 5: Bidding AI Algorithms

### 5.1 Hand Valuation (`estimateHandValue`)

Adds trump-length and void bonuses on top of point-card counting. The bot identifies its probable trump (longest weighted color) before trump is named.

```typescript
function estimateHandValue(hand: CardId[]): number {
  const colorCounts: Record<Color, number> = { Black:0, Red:0, Green:0, Yellow:0 };
  const colorPointWeight: Record<Color, number> = { Black:0, Red:0, Green:0, Yellow:0 };

  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    colorCounts[card.color]++;
    colorPointWeight[card.color] += 1 + pointValue(cardId) * 0.1;
  }

  const probableTrump = argmax(colorPointWeight);

  let strength = 0;
  for (const cardId of hand) {
    if (cardId === "ROOK") { strength += 15; continue; }
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    if (card.value === 1)  strength += 15;
    if (card.value === 14) strength += 10;
    if (card.value === 10) strength += 8;
    if (card.value === 5)  strength += 5;
  }

  // Trump-length bonus: [0,0,0,5,10,18,28,35] indexed by trump count
  const trumpLength = colorCounts[probableTrump];
  const trumpLengthBonus = [0, 0, 0, 5, 10, 18, 28, 35][Math.min(trumpLength, 7)] ?? 35;
  strength += trumpLengthBonus;

  // Void bonus: +8 per void in non-trump colors
  for (const color of COLORS) {
    if (color !== probableTrump && colorCounts[color] === 0) strength += 8;
  }

  // Near-void bonus: +3 per singleton non-trump suit
  for (const color of COLORS) {
    if (color !== probableTrump && colorCounts[color] === 1) strength += 3;
  }

  return strength;
}

function estimateHandValueWithNoise(hand: CardId[], accuracy: number): number {
  const trueStrength = estimateHandValue(hand);
  if (accuracy >= 1.0) return trueStrength;
  const noiseRange = (1 - accuracy) * 40;
  const noise = (Math.random() - 0.5) * 2 * noiseRange;
  return Math.max(0, trueStrength + noise);
}
```

**Strength range reference:**
| Hand Quality | Approx. Strength |
|---|---|
| Junk hand | 0–25 |
| Weak | 26–45 |
| Marginal bid | 46–60 |
| Solid (100–115) | 61–80 |
| Strong (120–140) | 81–100 |
| Near-moon | 101–120 |
| Moon-shoot quality | 120+ |

### 5.2 Bid Ceiling (`computeBidCeiling`)

Continuous linear interpolation replaces the current step function. Small hand differences produce small bid differences — harder to exploit.

```typescript
function baseBidCeiling(strength: number): number {
  if (strength < 40) return 0;
  const anchors: [number, number][] = [
    [40, 100], [60, 115], [75, 130], [90, 150], [110, 175], [130, 200],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [s0, b0] = anchors[i]!;
    const [s1, b1] = anchors[i + 1]!;
    if (strength <= s1) {
      const t = (strength - s0) / (s1 - s0);
      return Math.round(b0 + t * (b1 - b0));
    }
  }
  return 200;
}

function computeBidCeiling(hand, state, seat, profile): number {
  const strength = estimateHandValueWithNoise(hand, profile.handValuationAccuracy);
  let ceiling = baseBidCeiling(strength);
  if (ceiling === 0) return 0;

  // Aggressiveness multiplier
  ceiling = Math.round(ceiling * profile.bidAggressiveness);

  // Score context: losing badly -> bid more, winning big -> bid less
  if (profile.scoreContextAwareness) {
    const myTeam = SEAT_TEAM[seat];
    const oppTeam = myTeam === "NS" ? "EW" : "NS";
    const delta = state.scores[oppTeam] - state.scores[myTeam]; // positive = we are losing
    if (delta > 100) ceiling += 15;
    else if (delta > 50) ceiling += 8;
    if (delta < -150) ceiling -= 15;
    else if (delta < -80) ceiling -= 8;
  }

  // Partner bid inference (if partner bid, slightly raise our ceiling)
  const partnerBid = state.bids[partnerOf(seat)];
  if (typeof partnerBid === "number" && partnerBid > 0 && profile.scoreContextAwareness) {
    ceiling += Math.max(0, Math.round((partnerBid - 100) * 0.3));
  }

  const rules = state.rules ?? DEFAULT_RULES;
  return Math.max(rules.minimumBid, Math.min(ceiling, rules.maximumBid));
}
```

### 5.3 Bluff Resistance

```typescript
function shouldBid(minNextBid, ceiling, profile, state): boolean {
  if (ceiling === 0) return false;
  const bluffBudget = Math.round(profile.bluffResistance * 30);  // cap = 30 pts
  const rules = state.rules ?? DEFAULT_RULES;
  const snappedCeiling =
    Math.floor((ceiling + bluffBudget) / rules.bidIncrement) * rules.bidIncrement;
  return minNextBid <= snappedCeiling;
}
```

- Level 3 (bluffResistance=0.3): ceiling=130, budget=9 -> snapped to 5, effective 135. Bids 135, passes at 140.
- Level 5 (bluffResistance=1.0): ceiling=130, budget=30 -> effective 160. Pushes to 160.

### 5.4 Level 1 (Beginner) Bidding

25% chance of opening at 100, never raises. Simulates a player who occasionally bids randomly but mostly watches.

### 5.5 Moon-Shoot Decision (Levels 4–5)

```typescript
function evaluateMoonShoot(hand, state, seat, profile): boolean {
  if (!profile.canShootMoon) return false;
  const strength = estimateHandValue(hand); // true strength, no noise
  const myTeam = SEAT_TEAM[seat];
  const oppTeam = myTeam === "NS" ? "EW" : "NS";
  const winThreshold = state.rules.winThreshold;
  let threshold = profile.moonShootThreshold; // 90 for Hard, 75 for Expert

  if (profile.contextualMoonShoot) {
    // If opponents are near winning anyway, lower the bar
    // Trigger at >= 350 (within 150 of 500) — in real play bids rarely go under 150
    if (state.scores[oppTeam] >= winThreshold - 150) threshold -= 20;
    // Own team in deep hole — desperation factor
    if (state.scores[myTeam] <= -200) threshold -= 10;
    // Winning comfortably — do not gamble
    if (state.scores[myTeam] >= winThreshold - 100 &&
        state.scores[myTeam] > state.scores[oppTeam] + 150) {
      threshold += 20;
    }
  }

  return strength >= threshold;
}
```

**Expert (Level 5) threshold summary:**
- Base: 75
- Opponents >= 350/500: drops to **55**
- Own team <= -200: drops to **65**
- Both triggers: drops to **45**
- Winning by 150+: rises to **95**

---

## Section 6: Discard AI — Void Creation

Void strategy gates on `voidExploitation`: >= 0.5 = target one void, >= 0.8 = target two voids. The bot identifies probable trump first (same weighted method as card play), then preferentially discards from the shortest non-trump suit(s). Within a void-target suit, zero-point cards are discarded before point cards.

Key rules:
- Never discard ROOK
- Never discard probable trump cards
- Never discard Aces (value=1) or 14s
- Zero-point cards in void-target suits are discarded first

---

## Section 7: Card-Play AI

### 7.1 Role Awareness (`roleAwareness: true` at levels 3–5)

**Bidding team goal:** Score >= bid amount
- Lead trump to pull it (clear opponent ruffs)
- Once trump pulled, lead high aces/14s
- Sluff point cards onto partner winning tricks

**Defending team goal:** Force bidder to score < bid amount
- Do NOT lead trump before trick 7 (preserve trump for ruffs)
- Lead from longest side suit (exhaust suits, set up voids)
- Hold trump for disruption

### 7.2 ROOK Handling (`trumpManagement >= 0.7`)

The ROOK is the lowest trump card — it beats all off-suit but loses to any regular trump card.

Rules:
- Never lead ROOK to pull trump (every trump beats it — a waste)
- Save for: sluffing a point card on partner winning trick, or endgame ruffs
- When following: if ROOK is the only winning card, early game (trick < 5) on defending team, prefer to let opponent win rather than burn ROOK

### 7.3 Trump-Pulled Detection (`trackPlayedCards: true` at levels 3–5)

The bot counts trump cards in `state.playedCards`. When fewer than 3 trump remain unplayed (out of 12 total: 11 of trump color + ROOK), the bot considers trump "pulled" and shifts to leading high side-suit cards.

### 7.4 Endgame Awareness (`endgameCardAwareness >= 0.5` at levels 4–5)

When `tricksPlayed >= 7` and nest value > 15 points, the bot saves a strong trump/ace for trick 10 to win the nest. Both teams fight for the nest in this scenario.

---

## Section 8: Store and UX Changes

### Store

Replace `botDifficulty: BotDifficulty` with `botDifficulties: Record<"E" | "S" | "W", BotDifficulty>` (default `{ E: 3, S: 3, W: 3 }`).

Replace `startGame(difficulty)` with `startGame(difficulties: Record<"E"|"S"|"W", BotDifficulty>)`.

Add `setAllBotDifficulty(d)` and `setBotDifficultySeat(seat, d)`.

### SetupPage (`/setup`)

```
SetupPage (/setup)
├── Back button -> navigate("/")
├── Title: "Game Setup"
├── SetAllRow: DifficultyPicker 1–5 -> setAllBotDifficulty(d)
├── SeatRow "East":    DifficultyPicker 1–5 -> setBotDifficultySeat("E", d)
├── SeatRow "Partner": DifficultyPicker 1–5 -> setBotDifficultySeat("S", d)
├── SeatRow "West":    DifficultyPicker 1–5 -> setBotDifficultySeat("W", d)
└── Start Game -> startGame(botDifficulties) -> navigate("/game")
```

`DifficultyPicker`: 5 buttons labeled `1 2 3 4 5`. Selected button highlighted. Difficulty label shown below row (e.g., "Normal", "Expert").

---

## Section 9: Implementation Phases

| Phase | What | Files |
|---|---|---|
| 1 | Engine types: `BotDifficulty`, `BotProfile`, `BOT_PRESETS` | `packages/engine/src/types.ts` |
| 2 | Engine bidding: `estimateHandValue`, `computeBidCeiling`, `shouldBid`, Level 1 quirk | `packages/engine/src/bot.ts` |
| 3 | Store + UI: per-seat difficulties, `/setup` route, `SetupPage`, `DifficultyPicker` | `apps/web/src/store/*`, `apps/web/src/pages/*`, `apps/web/src/App.tsx` |
| 4 | Engine card-play: role-aware leads, trump-pulled detection, ROOK handling, defensive lead | `packages/engine/src/bot.ts` |
| 5 | Engine discard: void exploitation | `packages/engine/src/bot.ts` |
| 6 | Engine endgame: last-trick awareness, nest value calculation | `packages/engine/src/bot.ts` |
| 7 | Engine moon: contextual moon-shoot decision tree | `packages/engine/src/bot.ts` |

Phase 1 must go first. Phases 2 and 3 can be parallelized. Phases 4–7 are independent of each other.

---

## Section 10: Decisions Locked

All open questions resolved by user on 2026-03-08:

1. **Beginner open rate:** **25%** (Alex's recommendation). Opens at 100 only; never raises. Keeps behavior realistic without being disruptive.

2. **Moon-shoot near-win threshold:** **>= 350** (opponents within 150 of win threshold). Earlier trigger than the original 400 — reflects that in real play the bid rarely goes under 150, so 400 is too late to matter.

3. **Normal bot moon-shoot:** **Allowed at threshold 110**. Even a beginner can shoot the moon with a good enough hand. Level 3 bots will attempt it only with a very strong hand.

4. **Expert bluff cap:** **30 points** above ceiling (not 20). Expert bot pushes harder before folding.

5. **Partner difficulty warning:** **Not needed.** Users can set whatever combination they like.

6. **Bot thinking delay:** **Increase delay across the board** — cards play too fast at all levels. Implementation note: raise `botDelayMs` in game rules defaults; optionally scale by difficulty level.

7. **In-game difficulty badge:** **Show it** — display each bot's level number under their name in-game.

---

*End of plan. Approved — implementation may begin.*
