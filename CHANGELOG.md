# Changelog

All notable changes to Squickr Rook are documented here.

---

## [v1.0.0] — 2026-03-05

### New Features
- **Online multiplayer** — play with up to 4 real players over the internet via a shared room code
  - Create or join a room from the lobby; share the 6-character room code with friends
  - Each player sees their own hand face-up; opponents' hands are hidden
  - Player display names shown throughout: bidding overlay, score bar, trick area, result overlays, and game over screen
  - Seats rotate so your hand is always at the bottom regardless of which seat you occupy
  - Full reconnect support — rejoining with the same browser tab restores your seat and game state
- **Moon bidding lock** — once any player shoots the moon, the bidding overlay hides the numeric stepper so only additional ShootMoon declarations are possible
- **Moon scoring display** — Points and Delta columns are hidden in the hand result overlay when a moon shot occurred, avoiding misleading deltas

### Bug Fixes
- **Card visibility** — your cards are always fully visible; only opponents' face-down hands are hidden
- **Card dimming** — unplayable cards dim correctly; no cards are incorrectly dimmed when it is not your turn
- **You Win / You Lose** — online players seated East or West now see the correct win/lose outcome
- **Bot delay** — bot think-time delay now fires before the bot acts (not after), making pacing feel natural in online rooms
- **Trick linger race condition** — event batches arriving during the 1-second trick-completion linger are now queued and applied in order, preventing game state corruption

---

## [v0.4.3] — 2026-03-04

### Improvements
- **A11y: nest card screen reader label** — cards dealt from the nest now announce `" (from nest)"` in their `aria-label`, giving screen readers parity with the visual amber pip indicator added in v0.4.1

### Internal
- Removed dead `outcomeBadge` field and `OutcomeBadge` type from `HandHistoryRow` — was computed but never rendered; outcome display is derived from `bidMade`/`shotMoon`/`moonShooterWentSet` at the render layer

---

## [v0.4.2] — 2026-03-04

### New Features
- **Bot bid pacing** — bots now pause for the same `botDelayMs` delay during bidding that they use when playing cards, making the bidding phase feel more natural
- **Bidding overlay stays open** — the overlay no longer flashes closed between bids; it remains visible throughout the entire bidding round and closes only when bidding is complete
- **"Thinking…" indicator** — while a bot is deciding its bid, the waiting message changes from "P2 is bidding…" to "P2 is thinking…" with a subtle opacity pulse animation

---

## [v0.4.1] — 2026-03-04

### New Features
- **Nest card indicator** — during the discard phase, cards that came from the nest show a small amber pip (●) in the top-left corner so you can instantly tell them apart from your hand cards
- **Bid amount in NestOverlay** — the discard screen now shows the winning bid amount (and 🌙 if Shoot the Moon was called) so you know your target while choosing discards
- **Hand History table redesign** — 5-column layout: outcome icon (✓/✗), Bidder, Bid (with 🌙 for moon bids), NS score (cumulative + delta), EW score (cumulative + delta)

### Bug Fixes
- **Hand History EW column** — EW score column was blank due to `display: flex` applied directly to `<td>`; fixed by wrapping content in an inner `<div>`
- **Hand History dark theme** — modal now uses correct CSS surface/text tokens instead of hardcoded light colours

---

## [v0.4.0] — 2026-03-04

### New Features
- **Score History / Hand Log** — track every hand's outcome across the full game
  - 📋 history button in ScoreBar opens a full hand-log modal at any point during the game
  - **History tab** in the post-hand result overlay shows cumulative scores after each hand
  - **Hand Log section** on the Game Over screen shows the complete match history with a collapsible toggle
  - Each row shows: hand #, bid team, bid amount, points taken, outcome badge (Made / Set / Moon), and running NS/EW scores

---

## [v0.3.0] — 2026-03-04

### New Features
- **Simplified bidding UX** — quick-bid button (one-tap minimum bid) plus always-visible +/− stepper; no more "Bid more…" toggle
- **Winning bid badge** — HUD/ScoreBar now shows the winning bidder, bid amount, and 🌙 indicator post-bidding
- **Shoot the Moon blocked after numeric bid** — once you've placed a numeric bid you can no longer switch to Shoot the Moon (engine + UI enforced)

### Bug Fixes
- **Shoot the Moon instant win/loss** — moon-set is now an instant loss; moon-made from a positive score is an instant win; moon-made while in the hole resets the shooting team's score to 0 and play continues
- **Game-over reason display** — EW-bidder moon outcomes now display correctly (was re-deriving winner from NS assumption)
- **Race condition** — human could play a card during the 1-second bot trick-completion animation delay; now blocked at both store and engine layers
- **Bot bidding** — bots were bidding too aggressively (nearly every hand); ceiling cap on `bidWillingness()` now produces realistic bid ranges (120–165)

### Developer
- `window.__rookCheat.dealMoonHand()` console cheat for UAT of Shoot the Moon scenarios (dev build only)

---

## [v0.2.1] — prior release
