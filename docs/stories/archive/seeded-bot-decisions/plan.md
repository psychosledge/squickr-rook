# Seeded bot decisions without global patching: Plan
Tier: core

## Slice Plan

### Slice 1: Bot decisions draw from a caller-supplied random source
**Scope:** Every chance-driven bot decision reads randomness from a source the caller can pass in, falling back to `Math.random` when none is passed. Covers all 8 `Math.random` sites in `packages/engine/src/bot.ts`: the fishing roll (L67), opening fraction (L69), jump-probability roll (L88, missing from the story's list of 7), jump fraction (L90), hand-valuation noise in `estimateHandValueWithNoise` (L184), the L1 25% opening branch (L396), the `playAccuracy` slip roll (L482), and `pickRandom` (L1477, reached from random discard, random trump, the accuracy slip, and L1/L2 play in `chooseBestPlay`). Tests use a scripted source to force specific outcomes. Web (`apps/web/src/store/gameStore.ts`) and server (`packages/server/src/room.ts`) call sites are not changed. The simulator is not changed in this slice and keeps its `Math.random` patch until Slice 2.
**Status:** ✅ done
**Commit:** 59e1c31
**Acceptance Criteria:**
- [x] `botChooseCommand` accepts an optional random source as a trailing parameter. The existing 3-argument calls in `gameStore.ts` (`_botChooseCommandWithLog`) and `room.ts` compile and run unchanged.
- [x] The exported helpers that consume randomness, `estimateHandValueWithNoise` and `computeBidCeiling`, accept the same optional source. Their existing calls in `gameStore.ts` (bot-decision annotation) compile unchanged.
- [x] With no source supplied, bot decisions draw from `Math.random` (test observes `Math.random` being consulted on the default path).
- [x] With a source supplied, `botChooseCommand` never calls `Math.random` across bidding, nest, trump, and playing phases (test spies on `Math.random` and asserts zero calls).
- [x] `packages/engine/src/bot.ts` contains no `Math.random` reference outside the default-source fallback.
- [x] A scripted source forces an L3+ opening bot to fish (bids the minimum), and a different script forces a non-fishing open at a specific, predictable amount.
- [x] A scripted source forces an L3+ raising bot to jump-bid to a specific, predictable amount, and a different script forces a minimum raise.
- [x] A scripted source forces a play-accuracy slip, and the bot plays the card the script selects from its legal plays. A script that passes the accuracy roll yields the same card as the bot's best-play choice.
- [x] A scripted source forces the L1 opening branch both ways (opens at the minimum, passes).
- [x] A scripted source drives `estimateHandValueWithNoise` to a predictable noisy value.
- [x] Each scripted-source test gives the same result on every run (no reliance on `Math.random` or loop-over-trials statistics).
- [x] Full suite passes (`pnpm -r test`).
**Files:** `packages/engine/src/bot.ts`, `packages/engine/src/__tests__/bot.test.ts`, possibly a new `packages/engine/src/rng.ts` and `packages/engine/src/index.ts` (export), `apps/web/src/store/gameStore.ts` and `packages/server/src/room.ts` (read only, to confirm unchanged calls)
**Needs Architect:** yes. Decides the random-source type and where it lives (new engine module vs `bot.ts`), how it threads through the private helpers (`chooseBidAmount`, `pickRandom`, `chooseBestPlay`, `estimateHandValueWithNoise`, `computeBidCeiling`), and whether the seeded generator now private to `simulate.ts` (`makeXorshift32`) moves into the engine for reuse by Slice 2 and tests. That placement has real alternatives with different blast radius: a public engine export vs a script-local helper.
**Scaffolding for:** Slice 2: Simulator seeds each game without patching Math.random. Creates the injection seam the simulator passes its per-game seeded source through.
**Interface contract:** `botChooseCommand(state: GameState, seat: Seat, profile: BotProfile, rng?: Rng): GameCommand`, where `Rng` is `() => number` returning values in [0, 1), the same shape as `Math.random` and as the existing `makeXorshift32` return type. Omitting `rng` behaves as today. Slice 2 calls this with one seeded source per game. The type name may change in the Slice 1 ADR; the parameter position and `() => number` shape stay fixed.

### Slice 2: Simulator seeds each game without patching Math.random
**Scope:** `packages/engine/scripts/simulate.ts` builds one seeded random source per game from that game's `dealSeed` and passes it to every `botChooseCommand` call in `simulateGame`. `seedMathRandom` and the `(Math as any).random = rng` assignment are removed. The simulator gains a test seam so determinism is checked by Vitest (the script has no tests today and runs `main()` on import). CLI flags and NDJSON record shape are unchanged. Output for an existing seed may change once.
**Status:** ✅ done
**Commit:** 011ae41
**Acceptance Criteria:**
- [x] `simulate.ts` contains no assignment to `Math.random`; `seedMathRandom` is gone.
- [x] `Math.random` is the same function before and after simulating games (test).
- [x] Simulating the same base seed twice produces identical game records (test compares serialized output).
- [x] Simulating two different base seeds produces different game records (test).
- [x] Drawing from `Math.random` between or during simulated games does not change the records produced for a seed (test interleaves `Math.random` calls).
- [x] A per-game seed of 0, a base seed whose mixed per-game seed is 0 (base seed `0xdeadbeef`, since the mix is `dealSeed ^ 0xdeadbeef`), and a negative base seed each still produce a varied random stream (the existing xorshift zero-state guard is kept wherever the generator now lives).
- [x] Each line the simulator emits parses as JSON with the `GameRecord` fields (test). Loading it in `/replay` is a walkthrough check.
- [x] Full suite passes (`pnpm -r test`).
**Files:** `packages/engine/scripts/simulate.ts`, a new simulator test (location set by the architect, for example `packages/engine/scripts/__tests__/simulate.test.ts`), possibly `packages/engine/src/rng.ts` if Slice 1 moved the generator there, `packages/engine/package.json` (only if the script entry changes)
**Needs Architect:** yes, unless the Slice 1 ADR already settles it. Decides the simulator's test seam: whether `simulateGame` moves into an importable module with `main()` kept as a thin CLI entry, or `main()` is guarded so the file can be imported by a test.

## Builder Check Answers

From the code:

- **Draw order in bidding (L2+):** the partner-override guard draws hand-valuation noise when it applies (L412). `computeBidCeiling` always calls `estimateHandValueWithNoise` (L222), which draws once unless `handValuationAccuracy >= 1`. Opening at L3+: fishing roll, then the fraction only if not fishing. Raise at L3+: no draw when `gap < jumpThreshold`; otherwise the jump roll, then the fraction only on a jump. L1/L2 return the minimum with no draw in `chooseBidAmount`.
- **Fraction to amount:** opening `rawBid = minNextBid + (fractionCenter + (r*2-1)*fractionSpread) * (ceiling - minNextBid)`, snapped to `bidIncrement` and clamped to `[minNextBid, ceiling]`. Jump `rawJump = round(gap * (jumpFractionCenter + (r*2-1)*jumpFractionSpread) / bidIncrement) * bidIncrement`, amount clamped to `[minNextBid, ceiling]`. Parameters come from `OPENING_PARAMS` and `RAISE_PARAMS` in `bot.ts`.
- **L1 branch:** `r < 0.25` with `currentBid === 0` opens at `rules.minimumBid`; otherwise passes.
- **Play slip:** `r > profile.playAccuracy` slips. `pickRandom` picks `arr[Math.floor(r * arr.length)]` over legal plays in `legalCommands` order.
- **Noise:** `noise = (r - 0.5) * 2 * (1 - accuracy) * 40`, result `max(0, trueStrength + noise)`; no draw when `accuracy >= 1`.
- **`computeBidCeiling`:** draws only through `estimateHandValueWithNoise`, so the source passes through.
- **Vitest:** `packages/engine/vitest.config.ts` has no `include`, so the default picks up `scripts/**/*.test.ts`.
- **Records:** compare `simulateGame` results serialized with `JSON.stringify`. `timestamp` is hard-coded to 0, so nothing needs stripping.

Planner's call:

- **Parameter position:** the source is the trailing optional parameter on `estimateHandValueWithNoise(hand, accuracy, rng?)` and `computeBidCeiling(hand, state, seat, profile, rng?)`, as on `botChooseCommand`.
- **Test profiles:** "L3+" means `difficulty >= 3`. Tests spread a `BOT_PRESETS` entry and override fields. Bid-decision tests set `handValuationAccuracy: 1` so the script's first value is the decision roll; noise gets its own test.
- **Phase states:** tests build states with the fixtures `bot.test.ts` already uses. The no-`Math.random` test covers L1/L2 random discard and random trump, plus an L5 bid and play.
- **Default-path test:** spy on `Math.random` with an L1 opening state (`currentBid === 0`), which always draws.
- **No `Math.random` outside the fallback:** checked by the verifier with a grep. No source-scanning test.
- **Scripted source helper:** inline in `bot.test.ts`, throws when it runs out of values. Slice 2 copies or moves it only if it needs one.
- **Seed derivation:** Slice 2 keeps `dealSeed ^ 0xdeadbeef` as the bot source seed, so bot draws stay separate from the deal's seed.
- **Public API:** if `Rng` and the seeded generator are exported from `index.ts`, they are public engine API; `/ship` covers the changelog.
- **Slice 2 seam:** the Slice 1 architect pass also settles the simulator test seam and where `makeXorshift32` lives. Slice 2 skips its architect step when that's settled.

## Review Focus

Failure-mode sweep, core tier. Covered/deferred calls are the human's to confirm at plan approval.

- Developer-supplied scripted source returns a value outside [0, 1) or runs out of scripted values, so `pickRandom` indexes past the array and returns `undefined`: out of scope: test-only input, and the scripted helper throws on exhaustion
- Seed of 0, negative seeds, or a mixed per-game seed of 0 collapsing the xorshift generator to a constant stream (preserves an existing guard; not catastrophic): covered: Slice 2
- Other code drawing `Math.random` in the same process changing simulated bot results (the fragility the story names): covered: Slice 2
- Dev-only bot-decision annotation in `gameStore.ts` draws its own noise for `estimateHandValueWithNoise`/`computeBidCeiling`, so its displayed estimate differs from the value the bot actually used: out of scope: recorded as known issue #6 in `docs/backlog.md`
- NDJSON files from earlier simulator runs no longer match a fresh run of the same seed: out of scope: story permits a one-time output change

## Walkthrough Checklist
(Complete after all slices are implemented and committed)

- [x] Run `pnpm --filter @rook/engine simulate --games 20 --seed 12345 --out <a>` twice to two files; confirm the files are byte-identical.
- [x] Run with `--seed 12346`; confirm the output differs from the 12345 run.
- [x] Run with `--seed 0`; confirm it completes and bids vary across games (not every bot opening at the minimum).
- [x] Search `packages/engine/scripts/simulate.ts` for `Math.random`; confirm no assignment remains.
- [x] Load a fresh simulator NDJSON in `/replay` (dev); confirm games and tricks render.
- [x] Open `packages/engine/src/__tests__/bot.test.ts`; confirm tests force fishing, a jump bid, and a play-accuracy slip with a scripted source, and run `pnpm --filter @rook/engine test` twice with identical results.
- [x] Play an offline game against bots in `pnpm dev` for two hands; confirm bots bid and play normally and opening bids differ between hands or games.
- [x] Start a second offline game; confirm bot bids and card choices are not a repeat of the first game.
- [x] Play an online room with bots against `pnpm server:dev`; confirm bots bid and play normally and their choices vary between games.
- [x] `pnpm -r test` passes.

## ADR: Bot random source and simulator test seam
Added: Slice 1, 2026-11-19

**Context:** `bot.ts` draws from `Math.random` at 8 sites and the simulator patches `Math.random` for repeatable runs. The engine's `pure-rand` use in `deal.ts` is the immutable-generator API, with nothing in the `() => number` shape to reuse.

**Decision 1, type and module:** new `packages/engine/src/rng.ts`, re-exported from `index.ts`, holding `type Rng = () => number` (values in [0, 1)), `defaultRng: Rng = () => Math.random()`, and `makeXorshift32(seed): Rng` moved unchanged from `simulate.ts` with its zero-state guard. `defaultRng` is the single `Math.random` fallback for bot decisions. It is a wrapper so `vi.spyOn(Math, "random")` observes default-path draws.

**Decision 2, threading:** `botChooseCommand`, `estimateHandValueWithNoise`, and `computeBidCeiling` take a trailing `rng: Rng = defaultRng`. Private helpers that draw (`chooseBidAmount`, `pickRandom`, `chooseBestPlay`) take `rng: Rng` as a required trailing parameter. Helpers that don't draw keep their signatures. `gameStore.ts` and `room.ts` calls are unchanged.

**Decision 3, generator home:** `makeXorshift32` lives in the engine. Slice 1 adds and exports it and leaves the copy in `simulate.ts`. Slice 2 deletes the script copy and imports the engine one. The scripted test source stays inline in `bot.test.ts`.

**Decision 4, simulator seam (settles Slice 2's architect step):** `packages/engine/scripts/simulation.ts` exports `simulateGame(gameIndex, dealSeed, rng: Rng): GameRecord` and `simulateGames(games, baseSeed): GameRecord[]`, with per-game `dealSeed = baseSeed + k` and bot source `makeXorshift32(dealSeed ^ 0xdeadbeef)`. `scripts/simulate.ts` keeps arg parsing, file output, summary, and the `main()` call. Tests go in `packages/engine/scripts/__tests__/simulation.test.ts`. `package.json` is unchanged.

**Decision 5, default path:** each former `Math.random()` call becomes one `rng()` draw at the same point, so draw order and count are unchanged. Slice 1 does not change simulator output.

**Revisit if:** bot code draws randomness outside `botChooseCommand`'s call tree, or callers need one stream shared across games.

## Deferred findings

- `packages/engine/scripts/` (all files): never typechecked; engine tsconfig includes only `src` and `@types/node` is missing. Deferred: tsconfig and CI config outside this diff, affects every script. → backlog #8
- `packages/engine/scripts/simulation.ts` `simulateGame`: past the function-length threshold. Deferred: a structural split is wider than this slice, which only moved the function. → backlog #9
