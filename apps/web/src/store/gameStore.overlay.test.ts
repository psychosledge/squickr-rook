import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import type { GameEvent, HandScore } from "@rook/engine";

// ─── Helpers ───────────────────────────────────────────────────────────────

function resetStore() {
  useGameStore.setState({
    gameState: null,
    eventLog: [],
    overlay: "none",
    pendingDiscards: [],
    pendingHandScore: null,
    botTimeoutId: null,
    botDifficulty: "normal",
    announcement: null,
  });
}

/** Minimal HandScore fixture */
const MOCK_HAND_SCORE: HandScore = {
  hand: 1,
  bidder: "E",
  bidAmount: 70,
  nestCards: [],
  discarded: [],
  nsPointCards: 60,
  ewPointCards: 60,
  nsMostCardsBonus: 0,
  ewMostCardsBonus: 0,
  nsNestBonus: 0,
  ewNestBonus: 0,
  nsWonLastTrick: false,
  ewWonLastTrick: true,
  nsTotal: 60,
  ewTotal: 60,
  nsDelta: 0,
  ewDelta: 0,
};

const HAND_SCORED_EVENT: GameEvent = {
  type: "HandScored",
  score: MOCK_HAND_SCORE,
  handNumber: 1,
  timestamp: Date.now(),
};

const GAME_FINISHED_EVENT: GameEvent = {
  type: "GameFinished",
  winner: "EW",
  reason: "threshold-reached",
  finalScores: { NS: 0, EW: 300 },
  timestamp: Date.now(),
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("gameStore overlay — HandResultOverlay before GameOverScreen", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("_scheduleNextTurn priority: pendingHandScore before game-over", () => {
    it("shows 'hand-result' overlay when pendingHandScore is set, even if phase === 'finished'", () => {
      // Arrange: gameState is finished, but there is a pending hand score
      // Simulate _applyEvents processing HandScored then GameFinished in the same batch
      useGameStore.getState()._applyEvents([HAND_SCORED_EVENT, GAME_FINISHED_EVENT]);

      // Act: schedule next turn — should pick hand-result first
      useGameStore.getState()._scheduleNextTurn();

      // Assert
      expect(useGameStore.getState().overlay).toBe("hand-result");
    });

    it("shows 'game-over' overlay when phase === 'finished' and no pendingHandScore", () => {
      // Arrange: game finished but no pending hand score
      useGameStore.getState()._applyEvents([GAME_FINISHED_EVENT]);

      // Act
      useGameStore.getState()._scheduleNextTurn();

      // Assert
      expect(useGameStore.getState().overlay).toBe("game-over");
    });
  });

  describe("acknowledgeHandResult — transitions to game-over when game is finished", () => {
    it("sets overlay to 'game-over' when acknowledgeHandResult is called while phase === 'finished'", () => {
      // Arrange: game is over and hand-result overlay is showing
      useGameStore.getState()._applyEvents([HAND_SCORED_EVENT, GAME_FINISHED_EVENT]);
      useGameStore.setState({ overlay: "hand-result" });

      // Act: user dismisses the hand result overlay
      useGameStore.getState().acknowledgeHandResult();

      // Assert: should now show game-over
      expect(useGameStore.getState().overlay).toBe("game-over");
    });

    it("does NOT set overlay to 'game-over' when acknowledgeHandResult is called while phase !== 'finished'", () => {
      // Arrange: mid-game, hand just scored but game not over yet
      useGameStore.getState()._applyEvents([HAND_SCORED_EVENT]);
      useGameStore.setState({ overlay: "hand-result" });

      // Act
      useGameStore.getState().acknowledgeHandResult();

      // Assert: should not jump to game-over (game continues)
      expect(useGameStore.getState().overlay).not.toBe("game-over");
    });

    it("clears pendingHandScore after acknowledgeHandResult", () => {
      // Arrange
      useGameStore.getState()._applyEvents([HAND_SCORED_EVENT]);
      useGameStore.setState({ overlay: "hand-result" });

      // Act
      useGameStore.getState().acknowledgeHandResult();

      // Assert
      expect(useGameStore.getState().pendingHandScore).toBeNull();
    });
  });
});
