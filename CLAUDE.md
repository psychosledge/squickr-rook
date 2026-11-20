# Squickr Rook

Four-player Rook card game PWA with offline bot play and online rooms. Deployed to GitHub Pages at rook.squickr.com.

## Development Loop

### Feature / design work

```
/story → [explicit approval] → /plan → [explicit approval] → /slice (repeat) → /code-review → /ship
```

`/brainstorm` comes first when the design is still open.

### Bug fixes

Bugs are stories. They skip `/story` unless the fix needs product framing:

```
/plan → [explicit approval] → /slice (repeat) → /code-review → /ship
```

Each bug slice starts with a failing regression test.

### Commands

- `/story`: draft a story card in product language
- `/plan`: decompose an approved story into thin vertical slices with acceptance criteria and a walkthrough checklist
- `/slice`: execute one slice: architect check, coder (TDD), verifier, human approval gate before commit
- `/code-review`: verify correctness, walk through changes with the human, handle fixes, and commit
- `/ship`: run all tests, bump versions, update the changelog, build, commit, tag, push, and deploy the server if it changed
- `/analyze-game`: critique a trick or bidding step from a `/replay` game

> **Approval gates are non-negotiable.** Every phase transition requires explicit human approval.

## Branching

- Model: trunk-based
- Trunk: master
- Feature branches: no
- Release: skill ship
- CI runs build and tests on every push and PR to `master`. Pushing a `v*` tag deploys the web app; the tag must match the root `package.json` version.

## PR Platform

- Platform: GitHub

## Tech Stack

- React 19 + TypeScript + Vite, React Router, Zustand
- PartyKit for online rooms (`packages/server`, deployed separately with `pnpm server:ship`)
- Vitest (strict TDD)

## Package Structure

```
packages/
├── engine/   # Pure game rules, reducer, bots, simulation harness (scripts/simulate.ts)
└── server/   # PartyKit room server
apps/
└── web/      # React PWA, including the dev-only /replay route
```

## Key Rules

- **Tests first.** Red-Green-Refactor, always.
- **The engine stays pure.** Game state changes go through `applyEvent` in `packages/engine/src/reducer.ts`; the engine has no UI or network code.
- **No commits without the full suite passing** (`pnpm -r test`).
- **Never generate artwork.** All art is Jae's, placed from `apps/web/public/art/`.

## Common Commands

```bash
pnpm -r test                                        # all tests across packages
pnpm dev                                            # web dev server
pnpm server:dev                                     # PartyKit dev server
pnpm build                                          # engine + web production build
pnpm --filter @rook/engine simulate --games 100 --seed 12345   # bot-vs-bot NDJSON for /replay
```

## Bot Analysis

Bot card-play improvements come from replay analysis: run the simulator, load the NDJSON in `/replay` (dev only), and use `/analyze-game` on suspect tricks. Each fix cites the game, trick, and perspective that showed the mistake.

## Key Files

- `packages/engine/src/bot.ts`: all bot bidding and card-play logic
- `packages/engine/src/types.ts`: game types, `BotProfile`, `BOT_PRESETS`
- `apps/web/src/store/gameStore.ts`: offline game store
- `docs/tracking/`: the live release's README holds active work; `docs/backlog.md` holds unscheduled work
- `docs/deployment-guide.md`: hosting and deploy setup
