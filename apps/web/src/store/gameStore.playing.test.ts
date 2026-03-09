import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGameStore } from "./gameStore";
import { INITIAL_STATE, DEFAULT_RULES, applyEvent, BOT_PRESETS } from "@rook/engine";
import type { GameEvent, GameState } from "@rook/engine";

function resetStore() {
  useGameStore.setState({
    gameState: null,
    eventLog: [],
    overlay: "none",
    pendingDiscards: [],
    pendingHandScore: null,
    botTimeoutId: null,
    botDifficulties: { E: 3, S: 3, W: 3 },
    announcement: null,
    gameOverReason: null,
  });
}

/**
 * Build a minimal GameState in the "playing" phase with:
 * - activePlayer: "N" (human)
 * - hands["N"] containing known cards
 * - currentTrick: [] (empty, so a normal play is valid)
 * - trump: "Black"
 */
function makePlayingState(): GameState {
  const gameStarted: GameEvent = {
    type: "GameStarted",
    seed: 42,
    dealer: "W", // leftOf("W") = N, so N bids first
    players: [
      { seat: "N", name: "You",   kind: "human" },
      { seat: "E", name: "P2", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "P3", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "P4", kind: "bot", botProfile: BOT_PRESETS[3] },
    ],
    rules: { ...DEFAULT_RULES, botDelayMs: 1000 },
    timestamp: Date.now(),
  };

  // Build a real post-trump-selected state (playing phase)
  let state = applyEvent(INITIAL_STATE, gameStarted);

  // N bids 100, E/S/W pass → N wins bid
  state = applyEvent(state, { type: "BidPlaced", seat: "N", amount: 100, handNumber: 0, timestamp: 1001 });
  state = applyEvent(state, { type: "BidPassed", seat: "E", handNumber: 0, timestamp: 1002 });
  state = applyEvent(state, { type: "BidPassed", seat: "S", handNumber: 0, timestamp: 1003 });
  state = applyEvent(state, { type: "BidPassed", seat: "W", handNumber: 0, timestamp: 1004 });
  state = applyEvent(state, { type: "BiddingComplete", winner: "N", amount: 100, forced: false, shotMoon: false, handNumber: 0, timestamp: 1005 });

  // Take nest
  state = applyEvent(state, { type: "NestTaken", seat: "N", nestCards: [...state.nest], handNumber: 0, timestamp: 2000 });

  // Discard 5 non-ROOK cards
  const hand = [...state.hands["N"]!];
  let discardCount = 0;
  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    state = applyEvent(state, { type: "CardDiscarded", seat: "N", cardId, handNumber: 0, timestamp: 3000 });
    discardCount++;
    if (discardCount === 5) break;
  }

  // Select trump
  state = applyEvent(state, { type: "TrumpSelected", seat: "N", color: "Black", handNumber: 0, timestamp: 4000 });

  // Now we're in playing phase. Override to ensure N is active with known cards.
  return {
    ...state,
    phase: "playing",
    activePlayer: "N",
    trump: "Black",
    hands: {
      ...state.hands,
      N: ["B5", "B6", "B7"],  // N has 3 known Black cards
    },
    currentTrick: [],  // empty — N is leading
  };
}

describe("gameStore playing — humanPlayCard race condition guard", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("humanPlayCard is ignored when botTimeoutId is non-null (bot animation window)", () => {
    // Arrange
    const gs = makePlayingState();
    const pendingTimeoutId = setTimeout(() => {}, 99999);
    useGameStore.setState({
      gameState: gs,
      botTimeoutId: pendingTimeoutId,
    });

    const handSizeBefore = useGameStore.getState().gameState!.hands["N"]!.length;

    // Act: human tries to play a card during the bot animation window
    useGameStore.getState().humanPlayCard("B5");

    // Assert: hand should be UNCHANGED — the play was rejected
    const handSizeAfter = useGameStore.getState().gameState!.hands["N"]!.length;
    expect(handSizeAfter).toBe(handSizeBefore);

    clearTimeout(pendingTimeoutId);
  });

  it("humanPlayCard proceeds when botTimeoutId is null", () => {
    // Arrange
    const gs = makePlayingState();
    useGameStore.setState({
      gameState: gs,
      botTimeoutId: null,
    });

    const handSizeBefore = useGameStore.getState().gameState!.hands["N"]!.length;

    // Act: human plays a valid card with no bot timeout pending
    useGameStore.getState().humanPlayCard("B5");

    // Assert: hand should have decreased by 1 (card was consumed)
    const handSizeAfter = useGameStore.getState().gameState!.hands["N"]!.length;
    expect(handSizeAfter).toBe(handSizeBefore - 1);
  });
});
