# Changelog

All notable changes to Squickr Rook are documented here.

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
