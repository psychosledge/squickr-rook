# Seeded bot decisions without global patching

Tier: core

## Summary

A developer can make any bot's bidding and card play repeat exactly by giving it a seed, without the simulator overriding the program-wide random number generator.

## Background

Today, the only way to make bot decisions repeatable is for the simulator to swap out the program's shared source of randomness before each game. That works for the simulator but nowhere else. Tests can't pin down a bot's chance-driven choices, such as a fishing bid or a play-accuracy slip, so those behaviors go untested. The swap is also fragile: anything else drawing randomness in the same run changes the bot's results without warning.

## What needs to happen

- Bot decisions take their randomness from a source the caller can supply. When the caller supplies none, they use ordinary randomness, so the app and online rooms behave as they do now.
- The simulator supplies a seeded source per game and stops overriding the shared generator.
- Tests can supply a scripted source to force a specific chance outcome.

## Notes

- `botChooseCommand` in `packages/engine/src/bot.ts` has 7 `Math.random` call sites: opening and jump bid fractions, fishing probability, noise, the 25% opening branch, `playAccuracy`, and the random-pick helper (around line 1477).
- `packages/engine/scripts/simulate.ts` patches `Math.random` per game (lines 38 to 57 and 283).
- Callers: `simulate.ts`, `apps/web/src/store/gameStore.ts`, `packages/server/src/room.ts`. Web and server keep the default.
- Simulator output for an existing seed may change once. Byte-identical output for old seeds is not required.
- Backlog #4.

## Acceptance criteria

- Running the simulator twice with the same seed gives identical games.
- Running the simulator with different seeds gives different games.
- A developer can write a test that forces a bot to fish, jump-bid, or slip on play accuracy, and the test gives the same result every run.
- Offline and online games against bots play the same as before, with bids and card choices that still vary between games.
- The simulator no longer overrides the program-wide random number generator.
