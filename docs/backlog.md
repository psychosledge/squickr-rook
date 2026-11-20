# Backlog

Not-yet-started work. List order is priority, top first. `#N` is a permanent ID in the order items were identified; it never changes and is never reused. Items move to the live release's README when scheduled. A `~` date is approximate.

Types: bug, feature, ux, debt.

- #1 feature, bot: Bots stop donating points when sluffing. Two observed mistakes, both in game-0004 from N's perspective: trick 3, N sluffed B14 (10 pts) into a trick the opponents were likely to win while R6, B8, G9, G11 (all 0 pts) were available; trick 6, with partner S guaranteed the trick, N sluffed G14, which could still win future Green tricks, instead of G10, which W's G12 and G13 both beat. Needs a trick-win estimate (partner vs. opponent) and a "dead card" notion shared by both cases (~2026-07-11)
- #2 feature, art: Bring Jae's artwork into the app: title/lobby hero (rook3), app icon and table watermark (rook4), win and loss screens (rook1, rook2), turn indicator (rook5 as a Variant A placeholder). Assets and the commission brief for Variants A to D live in `docs/art/`. Assets used in the app get copied into `apps/web/public/`, which the PWA precaches under Workbox's per-file size limit, so rook1 and rook3 need web-sized copies. Whether `brief.html` stays in the repo is undecided (2026-06-16)
- #5 feature, bot tooling: LLM judge for simulated games, flagging likely bot mistakes for review in `/replay`. Deferred until manual replay review becomes the bottleneck (2026-06-10)
- #10 bug, web: Offline games show the wrong partnerships on the hand result and game over screens. getTeamLabel in apps/web/src/utils/seatLabel.ts maps NS to "P1 & P2" and EW to "P3 & P4", but getSeatLabel numbers N, E, S, W as P1 to P4, so partners are P1 & P3 and P2 & P4. teamDisplay falls back to getTeamLabel when no seatNames are passed, and apps/web/src/pages/GamePage.tsx passes none to HandResultOverlay or GameOverScreen. Online rooms pass seatNames and are correct. Seen when P2 bid 105, EW made it, and the banner read "P3 & P4 bid 105 — MADE IT". Found in seeded-bot-decisions walkthrough (2026-11-20)
- #11 ux, web: The turn indicator in apps/web/src/components/ScoreBar/ScoreBar.tsx reads "You's turn" on the human's turn. Found in seeded-bot-decisions walkthrough (2026-11-20)

## Known issues

Not scheduled. Fixed only when work in the affected area needs it.

- #6 debt, bot tooling: The dev-only bot-decision annotation in apps/web/src/store/gameStore.ts calls estimateHandValueWithNoise and computeBidCeiling itself, so the estimate and ceiling it logs for L2 to L4 bots differ from the values the bot used. Affects bid tuning in packages/engine/src/bot.ts that relies on the dev or coaching log. Found while planning seeded-bot-decisions (2026-11-19)
- #7 debt, bot: packages/engine/src/bot.ts and packages/engine/src/__tests__/bot.test.ts are past the verifier's file-size thresholds, and botChooseCommand is past its function-length threshold. Natural split: bidding, nest and trump, and card play, each with its own test file. Split when work adds a new responsibility to bot.ts, not when it only threads a parameter through. Found in seeded-bot-decisions Slice 1 review (2026-11-20)
- #8 debt, tooling: packages/engine/scripts/ is never typechecked. The engine tsconfig includes only src, and @types/node isn't installed for the engine, so simulate.ts can't be checked at all. Fix with a scripts tsconfig checked in CI. Found in seeded-bot-decisions Slice 2 review (2026-11-20)
- #9 debt, bot tooling: simulateGame in packages/engine/scripts/simulation.ts is past the verifier's function-length threshold. Natural split: game setup, trick-snapshot capture, and bid-history capture. Split when work adds a new responsibility to it. Found in seeded-bot-decisions Slice 2 review (2026-11-20)
- #13 debt, tooling: .github/workflows/ci.yml runs only the engine and web tests and builds, so packages/server tests and typecheck never run in CI and a broken room server passes with a green check. Found while planning online-play-restored (2026-11-20)
