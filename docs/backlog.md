# Backlog

Not-yet-started work. List order is priority, top first. `#N` is a permanent ID in the order items were identified; it never changes and is never reused. Items move to the live release's README when scheduled. A `~` date is approximate.

Types: bug, feature, ux, debt.

- #1 feature, bot: Bots stop donating points when sluffing. Needs a `/story` redraft before `/plan`. Two observed mistakes, both in game-0004 from N's perspective: trick 3, N sluffed B14 (10 pts) into a trick the opponents were likely to win while R6, B8, G9, G11 (all 0 pts) were available; trick 6, with partner S guaranteed the trick, N sluffed G14, which could still win future Green tricks, instead of G10, which W's G12 and G13 both beat. Needs a trick-win estimate (partner vs. opponent) and a "dead card" notion shared by both cases (~2026-07-11)
- #2 feature, art: Bring Jae's artwork into the app: title/lobby hero (rook3), app icon and table watermark (rook4), win and loss screens (rook1, rook2), turn indicator (rook5 as a Variant A placeholder). Assets and the commission brief for Variants A to D live in `apps/web/public/art/`. Whether `brief.html` stays in the repo is undecided (2026-06-16)
- #4 debt, engine: Bot randomness isn't injectable. `botChooseCommand` calls `Math.random` directly and `packages/engine/scripts/simulate.ts` replaces the global `Math.random` per game for determinism. Pass a draw function with a `Math.random` default so tests and the simulator seed it without global patching (~2026-06-13)
- #5 feature, bot tooling: LLM judge for simulated games, flagging likely bot mistakes for review in `/replay`. Deferred until manual replay review becomes the bottleneck (2026-06-10)
