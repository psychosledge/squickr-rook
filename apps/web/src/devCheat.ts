/**
 * DEV-ONLY console cheat helpers.
 *
 * This module is NEVER imported in production builds.
 * It is loaded exclusively via the `if (import.meta.env.DEV)` dynamic import
 * in main.tsx, which Vite tree-shakes out of production bundles entirely.
 *
 * Usage (browser DevTools console):
 *   window.__rookCheat.dealMoonHand()
 */

import { DEFAULT_RULES, BOT_PRESETS } from "@rook/engine";
import type { GameState } from "@rook/engine";
import { useGameStore } from "./store/gameStore";

function dealMoonHand(): void {
  // 1. Clear any pending bot timeout so we don't have two bot loops racing.
  const { botTimeoutId } = useGameStore.getState();
  if (botTimeoutId !== null) {
    clearTimeout(botTimeoutId);
  }

  // 2. Build the rigged GameState.
  //    N holds all Black trumps + the Rook — leading trump every trick wins all 10.
  //    Preserve current scores so in-the-hole scenarios can be tested accurately.
  const currentScores = useGameStore.getState().gameState?.scores ?? { NS: 0, EW: 0 };
  const riggedState: GameState = {
    version: 1,
    phase: "playing",
    rules: DEFAULT_RULES,
    players: [
      { seat: "N", name: "You", kind: "human" },
      { seat: "E", name: "East", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "South", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "West", kind: "bot", botProfile: BOT_PRESETS[3] },
    ],
    handNumber: 0,
    dealer: "N",
    seed: 42,
    activePlayer: "N", // human leads first — simplest for testing
    hands: {
      N: ["B1", "B14", "B13", "B12", "B11", "B10", "B9", "B8", "R1", "ROOK"],
      E: ["R7", "R8", "R9", "R10", "R11", "G5", "G6", "G7", "G8", "G9"],
      S: ["G10", "G11", "G12", "G13", "G14", "Y5", "Y6", "Y7", "Y8", "Y9"],
      W: ["Y10", "Y11", "Y12", "Y13", "Y14", "R12", "R13", "R14", "G1", "Y1"],
    },
    nest: [],
    originalNest: ["B5", "B6", "B7", "R5", "R6"],
    discarded: ["B5", "B6", "B7", "R5", "R6"],
    trump: "Black",
    currentTrick: [],
    tricksPlayed: 0,
    completedTricks: [],
    capturedCards: { NS: [], EW: [] },
    scores: currentScores,
    handHistory: [],
    winner: null,
    playedCards: [],
    bids: { N: 200, E: "pass", S: "pass", W: "pass" },
    moonShooters: ["N"],
    currentBid: 200,
    bidder: "N",
    bidAmount: 200,
    shotMoon: true,
  };

  // 3. Inject directly into the store (bypasses all event sourcing — dev only).
  useGameStore.setState({
    gameState: riggedState,
    overlay: "none",
    pendingDiscards: [],
    pendingHandScore: null,
    botTimeoutId: null,
    announcement: "🌙 DEV: Moon hand — lead trump to win all 10 tricks!",
    gameOverReason: null,
    eventLog: [],
  });

  // 4. Kick off the bot loop so bots respond after each human card play.
  useGameStore.getState()._scheduleNextTurn();

  console.info(
    "%c[rookCheat] dealMoonHand() injected!",
    "color: #a78bfa; font-weight: bold",
    "\nN's hand: B1 B8–B14 R1 ROOK — lead Black trump every trick to shoot the moon.",
  );
}

export function registerCheat(): void {
  (window as Window & { __rookCheat?: { dealMoonHand: () => void } }).__rookCheat = {
    dealMoonHand,
  };
  console.info(
    "%c[rookCheat] registered",
    "color: #a78bfa",
    "→ window.__rookCheat.dealMoonHand()",
  );
}
