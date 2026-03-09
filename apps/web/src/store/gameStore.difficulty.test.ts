import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGameStore } from "./gameStore";
import { BOT_PRESETS } from "@rook/engine";
import type { BotDifficulty } from "@rook/engine";

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
    historyModalOpen: false,
    biddingThinkingSeat: null,
  });
}

describe("gameStore per-seat difficulty", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("default state", () => {
    it("botDifficulties defaults to { E: 3, S: 3, W: 3 }", () => {
      resetStore();
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual({ E: 3, S: 3, W: 3 });
    });
  });

  describe("setAllBotDifficulty", () => {
    it("sets all three seats to the given difficulty", () => {
      useGameStore.getState().setAllBotDifficulty(5);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual({ E: 5, S: 5, W: 5 });
    });

    it("sets all three seats to difficulty 1", () => {
      useGameStore.getState().setAllBotDifficulty(1);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual({ E: 1, S: 1, W: 1 });
    });

    it("overwrites previously diverged seats", () => {
      useGameStore.getState().setBotDifficultySeat("E", 2);
      useGameStore.getState().setBotDifficultySeat("S", 4);
      useGameStore.getState().setAllBotDifficulty(3);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual({ E: 3, S: 3, W: 3 });
    });
  });

  describe("setBotDifficultySeat", () => {
    it("changes only the E seat, leaves S and W unchanged", () => {
      useGameStore.getState().setBotDifficultySeat("E", 2);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties.E).toBe(2);
      expect(botDifficulties.S).toBe(3);
      expect(botDifficulties.W).toBe(3);
    });

    it("changes only the S seat, leaves E and W unchanged", () => {
      useGameStore.getState().setBotDifficultySeat("S", 1);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties.E).toBe(3);
      expect(botDifficulties.S).toBe(1);
      expect(botDifficulties.W).toBe(3);
    });

    it("changes only the W seat, leaves E and S unchanged", () => {
      useGameStore.getState().setBotDifficultySeat("W", 5);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties.E).toBe(3);
      expect(botDifficulties.S).toBe(3);
      expect(botDifficulties.W).toBe(5);
    });

    it("allows each seat to be set independently", () => {
      useGameStore.getState().setBotDifficultySeat("E", 1);
      useGameStore.getState().setBotDifficultySeat("S", 3);
      useGameStore.getState().setBotDifficultySeat("W", 5);
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual({ E: 1, S: 3, W: 5 });
    });
  });

  describe("startGame with per-seat difficulties", () => {
    it("creates players with the correct botProfile per seat based on difficulties", () => {
      const difficulties: Record<"E" | "S" | "W", BotDifficulty> = { E: 1, S: 4, W: 2 };
      useGameStore.getState().startGame(difficulties);
      vi.runAllTimers();

      const { gameState } = useGameStore.getState();
      expect(gameState).not.toBeNull();
      if (!gameState) return;

      const eastPlayer = gameState.players.find((p) => p.seat === "E");
      const southPlayer = gameState.players.find((p) => p.seat === "S");
      const westPlayer = gameState.players.find((p) => p.seat === "W");

      expect(eastPlayer?.botProfile).toEqual(BOT_PRESETS[1]);
      expect(southPlayer?.botProfile).toEqual(BOT_PRESETS[4]);
      expect(westPlayer?.botProfile).toEqual(BOT_PRESETS[2]);
    });

    it("E gets BOT_PRESETS[difficulties.E], S gets BOT_PRESETS[difficulties.S], W gets BOT_PRESETS[difficulties.W]", () => {
      const difficulties: Record<"E" | "S" | "W", BotDifficulty> = { E: 5, S: 5, W: 5 };
      useGameStore.getState().startGame(difficulties);
      vi.runAllTimers();

      const { gameState } = useGameStore.getState();
      expect(gameState).not.toBeNull();
      if (!gameState) return;

      for (const seat of ["E", "S", "W"] as const) {
        const player = gameState.players.find((p) => p.seat === seat);
        expect(player?.botProfile).toEqual(BOT_PRESETS[5]);
      }
    });

    it("persists botDifficulties in the store after startGame", () => {
      const difficulties: Record<"E" | "S" | "W", BotDifficulty> = { E: 2, S: 3, W: 4 };
      useGameStore.getState().startGame(difficulties);
      vi.runAllTimers();
      const { botDifficulties } = useGameStore.getState();
      expect(botDifficulties).toEqual(difficulties);
    });

    it("human seat N is always kind='human' with no botProfile", () => {
      useGameStore.getState().startGame({ E: 3, S: 3, W: 3 });
      vi.runAllTimers();
      const { gameState } = useGameStore.getState();
      const north = gameState?.players.find((p) => p.seat === "N");
      expect(north?.kind).toBe("human");
      expect(north?.botProfile).toBeUndefined();
    });
  });
});
