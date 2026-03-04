import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";

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
    gameOverReason: null,
    historyModalOpen: false,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("gameStore history modal", () => {
  beforeEach(() => {
    resetStore();
  });

  it("initial state — historyModalOpen is false", () => {
    // Assert
    expect(useGameStore.getState().historyModalOpen).toBe(false);
  });

  it("openHistoryModal() — sets historyModalOpen to true", () => {
    // Act
    useGameStore.getState().openHistoryModal();

    // Assert
    expect(useGameStore.getState().historyModalOpen).toBe(true);
  });

  it("closeHistoryModal() — sets historyModalOpen back to false", () => {
    // Arrange
    useGameStore.getState().openHistoryModal();
    expect(useGameStore.getState().historyModalOpen).toBe(true);

    // Act
    useGameStore.getState().closeHistoryModal();

    // Assert
    expect(useGameStore.getState().historyModalOpen).toBe(false);
  });

  it("startGame() resets historyModalOpen — if true, calling startGame('normal') resets it to false", () => {
    // Arrange
    useGameStore.getState().openHistoryModal();
    expect(useGameStore.getState().historyModalOpen).toBe(true);

    // Act
    useGameStore.getState().startGame("normal");

    // Assert
    expect(useGameStore.getState().historyModalOpen).toBe(false);
  });

  it("resetGame() resets historyModalOpen — if true, calling resetGame() resets it to false", () => {
    // Arrange
    useGameStore.getState().openHistoryModal();
    expect(useGameStore.getState().historyModalOpen).toBe(true);

    // Act
    useGameStore.getState().resetGame();

    // Assert
    expect(useGameStore.getState().historyModalOpen).toBe(false);
  });
});
