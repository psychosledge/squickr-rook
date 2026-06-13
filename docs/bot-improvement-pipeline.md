# Bot Card-Play Improvement Pipeline

**Status:** Approved  
**Author:** Architect  
**Date:** 2026-06-10  
**Revision:** 2

---

## Overview

The Expert bot has known card-play deficiencies with no systematic way to find, understand, or verify fixes beyond human playtesting intuition. This spec defines a pipeline that closes that loop: run deterministic games, capture every play decision, visualize specific tricks, and verify that fixes actually solved the problem.

**The metric is correct play, not win rate.** A bot can win a hand by mistake or lose one while playing correctly. The pipeline evaluates individual card-play decisions in isolation from outcomes.

**Phasing:** The pipeline is split into two phases. Phase 1 builds the harness and replay viewer and uses a human judge to review flagged games. Phase 2 (LLM judge) is deferred until Phase 1 iteration reveals it is necessary. The human-judge workflow may be entirely sufficient.

---

## Scope

**In scope:** Bot card-play decision logic in `bot.ts`.

**Out of scope:**
- Bidding logic (separate concern with separate evaluation needs)
- Difficulty/RNG tuning across non-Expert levels
- Automated CI assertions on win rate
- Live game capture or instrumentation of production sessions

---

## Phase 1 — Build Now

Phase 1 comprises everything needed to run deterministic games, capture play decisions, and review them in a visual replay viewer. The developer is the judge.

### Step 1: Fix the Trump-Lead Bug

Before building any infrastructure, fix the one confirmed wrong play. This is a small surgical change and should be done first so that harness output reflects improved baseline logic rather than a known defect.

**Location:** `packages/engine/src/bot.ts`, lines 807–814.

**The defect:** When the bidding team has not yet pulled trump and holds trump cards, the bot leads the lowest non-Rook trump. Expert play prescribes leading the highest (the "1") first. The "1" is guaranteed to win the trick and forces opponents to spend high trumps covering it. Leading low allows opponents to duck with mid-range trumps and preserve their high ones to beat the bidder's strongest card later.

**The fix:** In the trump-pull branch (line 811), invert the comparator so `candidates` is reduced to the maximum `trumpRank` rather than the minimum.

Change:
```ts
return trumpRank(cmd.cardId, trump) < trumpRank(best.cardId, trump) ? cmd : best;
```
To:
```ts
return trumpRank(cmd.cardId, trump) > trumpRank(best.cardId, trump) ? cmd : best;
```

No other changes. No new types, no new files.

---

### Step 2: Shared Types

**File:** `packages/engine/src/types.ts`

Add the following types. They are defined in `types.ts` (not in the scripts folder) so both the simulation harness and the web-app replay viewer can import from the same location.

```ts
export type TrickPlay = {
  seat: Seat;
  cardId: CardId;
  /** Full hand the player held at trick start, before any card was played */
  handAtTrickStart: CardId[];
};

export type TrickSnapshot = {
  trickNumber: number;
  leadSeat: Seat;
  trump: Color;
  /** Each player's hand captured before the first card of this trick was played */
  handsAtTrickStart: Record<Seat, CardId[]>;
  /** Cards played in seat order */
  plays: TrickPlay[];
  winner: Seat;
  pointsInTrick: number;
  cumulativeScore: Record<Team, number>;
};

export type GameRecord = {
  gameId: string;         // e.g. "game-0042"
  dealSeed: number;       // state.seed at deal time — use for re-run targeting
  handNumber: number;     // state.handNumber
  transcript: TrickSnapshot[];
  outcome: HandScore;     // HandScore is already defined in types.ts
};
```

`JudgeFinding` is not added in Phase 1. It belongs to the LLM judge (Phase 2).

---

### Step 3: Simulation Harness

**File:** `packages/engine/scripts/simulate.ts`  
**Run command:** `pnpm --filter engine simulate` (add script to `packages/engine/package.json`)

#### Purpose

Run N fully deterministic bot-vs-bot games at Expert difficulty and emit a structured record of every card-play decision. This is the raw data source for the visual replay and for future LLM evaluation.

#### Determinism guarantee

- `deal.ts` already uses `xorshift128plus` via `pure-rand` seeded from `GameState.seed`.
- `BOT_PRESETS[5]` sets `playAccuracy: 1.0`, making the two card-play `Math.random()` call sites in `bot.ts` (line 482 accuracy gate, line 1132 `pickRandom`) unreachable. Card play is fully deterministic at this preset.
- Bidding still calls `Math.random()` internally, but bidding is out of scope and its non-determinism does not affect card-play evaluation.
- Re-running with the same `--seed` value reproduces the identical sequence of games. This is the mechanism for regression verification after a fix.

#### Game loop

The harness mirrors `room.ts`'s `processBotTurns()`, stripped of PartyKit connections and `botDelayMs` waits (which are not referenced by the engine reducer):

```ts
import { botChooseCommand, BOT_PRESETS } from "../src/bot";
import { validateCommand } from "../src/validator";
import { applyEvent } from "../src/reducer";
import { GameState } from "../src/types";

while (state.phase !== "finished") {
  const seat = state.activePlayer!;
  const command = botChooseCommand(state, seat, BOT_PRESETS[5]);
  const result = validateCommand(state, command, state.rules);

  if (state.phase === "playing" && command.type === "PlayCard") {
    // capture TrickSnapshot — see below
  }

  for (const event of result.events) {
    state = applyEvent(state, event);
  }
}
```

`botChooseCommand` is only called from `room.ts:652` in production. The harness is the second call site.

#### Capture timing

The snapshot for trick T is assembled over the course of the trick:
- `handsAtTrickStart` is captured from `state.hands` immediately before the first card of trick T is played (when `state.currentTrick.length === 0` and `state.phase === "playing"`).
- Each `TrickPlay` is appended as each bot plays.
- When `state.tricksPlayed` increments (trick is complete), `winner` and `pointsInTrick` are read from `state.completedTricks[state.completedTricks.length - 1]` and the snapshot is pushed to the current game's transcript.

#### Output format

`packages/engine/scripts/output/simulation-results.ndjson` (one JSON object per line, file is gitignored).

Each line is a `GameRecord` as defined in Step 2.

#### CLI output

When the run completes, print to stdout:
- Number of games completed
- Total tricks captured
- Number of hands where the bidding team made their bid vs. went set

No win/loss trend analysis — that is intentionally not the metric.

#### CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--games N` | `100` | Number of games to simulate |
| `--seed N` | `12345` | Base seed; game K uses seed `baseSeed + K` |
| `--out path` | `scripts/output/simulation-results.ndjson` | Output path |

---

### Step 4: Visual Replay

**Location:** `/replay` route in `apps/web`

#### Purpose

Let a developer load a `GameRecord` and step through tricks one at a time with all four hands visible. This is the primary review tool for Phase 1. The developer loads flagged games here, steps through tricks, and notes wrong plays before editing `bot.ts`.

#### Access control

The route is dev-mode only:

```tsx
// In App.tsx, inside the Routes block:
{import.meta.env.DEV && (
  <Route path="/replay" element={<ReplayPage />} />
)}
```

No link to `/replay` appears in the production UI.

#### Loading a game record

The page offers two load mechanisms:

1. **File picker** — `<input type="file" accept=".ndjson,.json" />` — parses the selected file and lists all `GameRecord` entries for selection.
2. **Paste** — a `<textarea>` for pasting a single `GameRecord` JSON object directly.

After loading, the user selects a specific game from the list (by `gameId` and `dealSeed`) and is taken to the trick-by-trick view.

#### Trick view

Each trick is displayed as a single screen:

- **Trick header:** trick number, lead seat, trump suit, points in trick, cumulative score for both teams.
- **Four hands:** all four seats' hands as they were at trick start (using `handsAtTrickStart` from `TrickSnapshot`). Cards played this trick are highlighted or marked.
- **Play sequence:** cards played in seat order, with the winning card indicated.
- **Navigation:** Prev / Next buttons to move between tricks.

#### Perspective toggle

A four-button toggle (N / E / S / W) rotates the visual layout so the selected seat always appears at the bottom. This mirrors the existing game view orientation. The toggle does not hide any cards — all hands remain visible in replay mode.

#### Rendering

Uses existing card rendering components from the main game UI. No new card-rendering logic.

#### File locations

```
apps/web/src/pages/ReplayPage.tsx
apps/web/src/pages/ReplayPage.module.css
```

---

## Phase 1 Human-Judge Workflow

This is the intended review process during Phase 1 iteration. There is no automated finding mechanism — the developer is the judge.

**One iteration cycle:**

1. Run the harness to generate `simulation-results.ndjson`.
2. Open `simulation-results.ndjson` and scan game summaries (gameId, outcome). Games where the bidding team went set are higher-signal candidates but not the only ones worth reviewing.
3. Load a game of interest in the replay viewer (`/replay`).
4. Step through tricks. Look for plays that stand out as wrong given the visible hands.
5. Note the gameId, trick number, seat, and card played. Keep notes in a scratch file or doc — there is no automated findings format in Phase 1.
6. Fix `bot.ts` for the identified pattern.
7. Re-run the harness with the same `--seed` value. Because the harness is deterministic, the same deal situations recur.
8. Load the same gameId in the replay viewer. Confirm the specific trick now shows the corrected play.
9. Repeat.

**Pattern detection is manual.** The developer looks for the same kind of mistake appearing across multiple games and keeps their own notes. That is the right scope for Phase 1 — the volume of games is modest and patterns in a rule-based bot tend to be obvious once you see them. If manual review becomes the bottleneck (too many games to scan, patterns too subtle to spot visually), that is the trigger for Phase 2.

**What "verified" means in Phase 1:**

A fix is verified when:
- The specific trick that demonstrated the wrong play now shows the correct play after re-running with the same seed.
- Scanning a fresh batch of games (new seed) does not reveal the same pattern recurring.

Win rate change is not a verification criterion.

---

## Phase 2 — Deferred: LLM Judge

**Build only if Phase 1 iteration reveals it is needed.**

### What it is

An automated script (`packages/engine/scripts/judge.ts`) that reads harness output and asks an LLM to identify clear-cut wrong card plays. The judge sees only the card-level view — hands, plays, winners, points — with no access to bot internals. It produces a structured `JudgeFinding` file that a developer can scan for systematic patterns.

### Why it is deferred

- **House rules context is not yet encoded.** A useful judge prompt needs an accurate, complete description of Rook strategy and the specific house rules in play. That context does not exist yet and will be easier to write after one full iteration cycle with the human judge — once patterns are understood from direct observation.
- **The human judge may be sufficient.** Rule-based bots fail in predictable ways. The replay viewer may provide all the signal needed without adding LLM cost and latency to the loop.
- **The triage problem may not materialize.** Concern about having too many tricks to manually review depends on the scale of runs. At 100 games with ~10 tricks per game, that is 1000 tricks — browsable in a few sessions if the viewer is fast. The problem justifying an LLM judge is not confirmed.

### When to revisit

After one full iteration cycle (run harness, review games, fix a bug, verify the fix, repeat at least twice): if the manual review step is taking more than a day per cycle, or if wrong plays are occurring but the visual pattern is not obvious, revisit Phase 2.

### What needs to be solved before building

These are open design problems that should be resolved before implementation, not during:

1. **House rules prompt block.** A structured, tested description of Rook rules and Expert strategy that produces reliable judgments. Calibrate against known-correct and known-wrong plays before trusting output at scale.
2. **Pre-computed void tracking.** The judge prompt should include which suits each player is known to be void in (inferred from failure to follow suit in earlier tricks). This context is necessary for the judge to evaluate plays correctly but is not currently captured in `TrickSnapshot`.
3. **Conservative prompting strategy.** The judge should flag only clear-cut errors. Calibration against ground truth (human-labeled examples) should precede any bulk run to confirm false-positive rate is low.
4. **`JudgeFinding` type.** Add to `types.ts` when Phase 2 begins:
   ```ts
   type JudgeFinding = {
     gameId: string;
     trickNumber: number;
     seat: Seat;
     cardPlayed: CardId;
     suggestedCard: CardId | null;
     reasoning: string;
   };
   ```
5. **`@anthropic-ai/sdk` dependency.** Add to `packages/engine/devDependencies` when Phase 2 begins. It is only used in scripts, not in the engine source that ships to the browser.

---

## Phase 1 Build Order

| Step | Deliverable | Depends on |
|------|-------------|------------|
| 1 | Fix trump-lead comparator in `bot.ts` | Nothing |
| 2 | Add `TrickSnapshot`, `TrickPlay`, `GameRecord` types to `types.ts` | Step 1 |
| 3 | Simulation harness (`scripts/simulate.ts`) | Step 2 |
| 4 | Visual replay (`/replay` route) | Step 2 (types), Step 3 (data to load) |

Steps 3 and 4 can be developed in parallel once Step 2 is done.

---

## Phase 1 File Manifest

New files:

| Path | Description |
|------|-------------|
| `packages/engine/scripts/simulate.ts` | Simulation harness script |
| `packages/engine/scripts/output/.gitkeep` | Ensures output dir is tracked; contents are gitignored |
| `apps/web/src/pages/ReplayPage.tsx` | Visual replay page component |
| `apps/web/src/pages/ReplayPage.module.css` | Replay page styles |

Modified files:

| Path | Change |
|------|--------|
| `packages/engine/src/types.ts` | Add `TrickSnapshot`, `TrickPlay`, `GameRecord` types |
| `packages/engine/src/bot.ts` | Fix trump-lead comparator (lines 811–813) |
| `packages/engine/package.json` | Add `simulate` script; add `tsx` to devDependencies if not present |
| `apps/web/src/App.tsx` | Add dev-only `/replay` route |
| `.gitignore` | Ignore `packages/engine/scripts/output/*.ndjson` |

Phase 2 additions (not yet):

| Path | Description |
|------|-------------|
| `packages/engine/scripts/judge.ts` | LLM judge script — Phase 2 only |

Modified at Phase 2 start:

| Path | Change |
|------|--------|
| `packages/engine/src/types.ts` | Add `JudgeFinding` type |
| `packages/engine/package.json` | Add `judge` script; add `@anthropic-ai/sdk` to devDependencies |

---

## Implementation Notes

**Running the harness script:** Use `tsx` via `pnpm exec tsx` — no build step required. This assumes `tsx` is already a devDependency of the engine package or the workspace root. Confirm before implementing Step 3.

**Sample selection for manual review:** There is no prescribed selection algorithm. Games where the bidding team went set are a reasonable starting point. Review enough games to form a pattern hypothesis before touching `bot.ts` — fixing one example without understanding the pattern tends to produce partial fixes.
