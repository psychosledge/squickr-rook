# Slice Plan — Bot Improvement Pipeline Phase 1

**Story:** Bot Card-Play Improvement Pipeline — Phase 1 (trump-lead fix, shared types, simulation harness, visual replay)
**Spec:** `docs/bot-improvement-pipeline.md`
**Date:** 2026-06-10

---

## Slice Plan

### Slice 1: Fix trump-lead bug
**Scope:** Change one comparator in `packages/engine/src/bot.ts` (line 813) so the bidding team leads the highest non-Rook trump rather than the lowest when pulling trump. No new files, no new types, no behaviour change in any other branch.
**Status:** ✅ done
**Commit:** a8d4e91
**Acceptance Criteria:**
- [x] Line 813 of `bot.ts` reads `trumpRank(cmd.cardId, trump) > trumpRank(best.cardId, trump)` (greater-than, not less-than)
- [x] The surrounding trump-pull branch and all other bot logic are unchanged
- [x] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** no — the fix is a single character change prescribed exactly in the spec
**Scaffolding for:** Slice 3: Simulation harness — the harness will run games using this corrected logic so its output reflects the improved baseline

**Interface contract:** The `bot.ts` public surface (`botChooseCommand`, `BOT_PRESETS`) is unchanged. The only observable difference is that when `isBiddingTeam && !trumpPulled && trumpCards.length > 0`, the returned `PlayCard` command will target the highest-ranked non-Rook trump rather than the lowest.

---

### Slice 2: Shared simulation types
**Scope:** Add `TrickPlay`, `TrickSnapshot`, and `GameRecord` export types to `packages/engine/src/types.ts`. No runtime logic changes. `JudgeFinding` is explicitly out of scope (Phase 2 only).
**Status:** ✅ done
**Commit:** 7966ccc
**Acceptance Criteria:**
- [x] `TrickPlay` is exported from `packages/engine/src/types.ts` with fields: `seat: Seat`, `cardId: CardId`, `handAtTrickStart: CardId[]`
- [x] `TrickSnapshot` is exported with fields: `trickNumber: number`, `leadSeat: Seat`, `trump: Color`, `handsAtTrickStart: Record<Seat, CardId[]>`, `plays: TrickPlay[]`, `winner: Seat`, `pointsInTrick: number`, `cumulativeScore: Record<Team, number>`
- [x] `GameRecord` is exported with fields: `gameId: string`, `dealSeed: number`, `handNumber: number`, `transcript: TrickSnapshot[]`, `outcome: HandScore`
- [x] All three types are re-exported from `packages/engine/src/index.ts` (or already reachable via the package root export)
- [x] `pnpm --filter engine typecheck` passes with no errors
- [x] `pnpm --filter engine test` passes with no regressions
- [x] `JudgeFinding` is NOT added in this slice
**Needs Architect:** no — all field names and types are fully specified in the spec
**Scaffolding for:** Slice 3: Simulation harness, Slice 4: Visual replay — both import these types from `@rook/engine`

**Interface contract:** The three exported types must remain shape-stable as defined above. Slice 3 (harness) constructs instances of `TrickSnapshot` and `GameRecord`; Slice 4 (replay) consumes them. Any field rename or type change would break both consumers.

---

### Slice 3: Simulation harness
**Scope:** New script `packages/engine/scripts/simulate.ts` that runs N deterministic bot-vs-bot games at Expert difficulty and writes `GameRecord` NDJSON to `packages/engine/scripts/output/simulation-results.ndjson`. Adds `simulate` script to `packages/engine/package.json`. Adds `tsx` to engine devDependencies if not already present (currently absent). Adds `output/*.ndjson` to `.gitignore`. Creates `packages/engine/scripts/output/.gitkeep`. Does not touch `apps/web` or the production engine source beyond what was changed in Slices 1–2.
**Status:** ✅ done
**Commit:** ae56065
**Acceptance Criteria:**
- [x] `pnpm --filter engine simulate` runs without error and exits 0
- [x] Running with default flags (`--games 100 --seed 12345`) completes all 100 games and produces `packages/engine/scripts/output/simulation-results.ndjson`
- [x] The output file contains exactly 100 newline-delimited JSON objects, each parseable as a `GameRecord`
- [x] Each `GameRecord.transcript` is a non-empty array of `TrickSnapshot` objects
- [x] Each `TrickSnapshot` has `handsAtTrickStart` populated for all four seats before the first card of that trick is played (i.e. full 10-card hands on trick 1, decreasing by one card per trick thereafter)
- [x] Re-running with the same `--seed` value produces byte-identical output (determinism check)
- [x] Running with `--games 10 --seed 99` produces a 10-record file distinct from the `--seed 12345` run (seed isolation check)
- [x] CLI stdout reports: games completed, total tricks captured, bids made vs. set counts
- [x] `--out path` flag redirects output to the specified path
- [x] `packages/engine/scripts/output/*.ndjson` is gitignored; `.gitkeep` is tracked
- [x] `pnpm --filter engine test` passes with no regressions (harness is a script, not imported by tests)
**Needs Architect:** no — game loop structure, capture timing, and CLI flags are fully specified in the spec; `tsx` devDependency addition is mechanical
**Scaffolding for:** Slice 4: Visual replay — the replay page loads NDJSON files produced by this harness; a sample output file is the primary test fixture for Slice 4 development

**Interface contract:** The NDJSON output format is one `GameRecord` JSON object per line. `GameRecord` shape is as defined in Slice 2. Slice 4 parses this format verbatim via a file picker — any structural change to output would break the replay loader.

---

### Slice 4: Visual replay page
**Scope:** New dev-only route `/replay` in `apps/web` with `ReplayPage.tsx` and `ReplayPage.module.css`. Accessible only when `import.meta.env.DEV` is true. Provides file picker and paste input for loading NDJSON, game selection by `gameId`/`dealSeed`, trick-by-trick view of all four hands using existing card rendering components, perspective toggle (N/E/S/W), and Prev/Next trick navigation. No new card-rendering logic. No link to `/replay` appears anywhere in the production UI routes.
**Status:** ✅ done
**Commit:** 5d49231
**Acceptance Criteria:**
- [x] Navigating to `/replay` in a `pnpm dev` session renders the replay page without error
- [x] Navigating to `/replay` in a production build returns a 404 or redirects to `/` (the dev guard is active)
- [x] The file picker accepts `.ndjson` and `.json` files; loading a valid simulation output file populates a list of games identified by `gameId` and `dealSeed`
- [x] Selecting a game from the list transitions to the trick-by-trick view for that game
- [x] Trick view displays: trick number, lead seat, trump suit, points in trick, cumulative score for both teams
- [x] All four seats' hands are shown as they were at trick start (from `handsAtTrickStart`)
- [x] Cards played in the current trick are visually distinguished (highlighted or marked) from unplayed hand cards
- [x] The winning card of the trick is indicated
- [x] Prev / Next navigation moves between tricks; Prev is disabled on trick 1, Next is disabled on the last trick
- [x] The perspective toggle (N / E / S / W) rotates the layout so the selected seat appears at the bottom; all hands remain visible
- [x] The paste textarea accepts a single `GameRecord` JSON object and loads it the same way as a file
- [x] Existing card rendering components are used — no new card-rendering primitives are introduced
- [x] `pnpm --filter web build` completes without TypeScript errors (production build excludes the route)
- [x] `pnpm --filter engine test` and any web tests continue to pass
**Needs Architect:** no — layout, component boundaries, and existing rendering components are sufficient to scope the work; no new shared abstractions required

---

## UAT Checklist
(Complete after all slices are implemented and committed)

### Trump-lead fix (Slice 1)

- [ ] Open `packages/engine/src/bot.ts` at lines 807–814 and confirm the comparator on line 813 is `>` (greater-than), not `<`
- [ ] Run `pnpm --filter engine test` and confirm all tests pass

### Shared types (Slice 2)

- [ ] In a TypeScript file inside the engine package, import `TrickPlay`, `TrickSnapshot`, and `GameRecord` from the engine index and confirm no TS errors
- [ ] Confirm `JudgeFinding` does NOT appear in `packages/engine/src/types.ts`

### Simulation harness (Slice 3)

- [ ] Run `pnpm --filter engine simulate` with no flags; confirm it exits 0 and prints a summary line to stdout showing games completed, total tricks, and bid made/set counts
- [ ] Inspect `packages/engine/scripts/output/simulation-results.ndjson`; confirm each line is valid JSON and parses as a `GameRecord` with a non-empty `transcript`
- [ ] Run `pnpm --filter engine simulate --games 100 --seed 12345` twice; diff the two output files and confirm they are identical (determinism)
- [ ] Run `pnpm --filter engine simulate --games 10 --seed 99 --out /tmp/test-run.ndjson`; confirm the file appears at the specified path with 10 records
- [ ] Confirm `packages/engine/scripts/output/*.ndjson` does not appear in `git status` (gitignored)
- [ ] Confirm `packages/engine/scripts/output/.gitkeep` IS tracked by git

### Visual replay (Slice 4)

- [ ] Start the dev server (`pnpm dev` or equivalent); navigate to `http://localhost:<port>/replay`; confirm the page renders without console errors
- [ ] Use the file picker to load `simulation-results.ndjson`; confirm a list of games appears showing `gameId` and `dealSeed` for each entry
- [ ] Select any game from the list; confirm the trick view loads at trick 1
- [ ] Verify trick 1 shows: trick number (1), lead seat, trump suit, points in trick, and cumulative scores for NS and EW teams
- [ ] Verify all four hands are displayed with the correct number of cards (each seat should have 10 cards on trick 1)
- [ ] Click Next; confirm trick 2 loads with updated hands (9 cards per seat), the previous trick's played cards no longer appear in the hands
- [ ] Navigate to the last trick of the game; confirm Next is disabled
- [ ] Navigate back to trick 1; confirm Prev is disabled
- [ ] On any trick, click each of the four perspective buttons (N, E, S, W); confirm the layout rotates so the selected seat is at the bottom and all four hands remain visible
- [ ] Use the paste textarea to paste a single `GameRecord` JSON object; confirm the game loads and the trick view behaves identically to the file-loaded case
- [ ] Produce a production build (`pnpm build` or equivalent); confirm `/replay` is not accessible (navigating to it redirects to `/` or returns 404)
- [ ] Confirm no link or navigation element pointing to `/replay` exists in the production UI (LobbyPage, GamePage, etc.)
- [ ] Confirm existing card rendering components are used in the replay view (no duplicated rendering logic)
