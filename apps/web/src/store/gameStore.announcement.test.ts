import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { DEFAULT_RULES } from "@rook/engine";
import type { GameEvent } from "@rook/engine";

// Reset the store before each test
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

describe("gameStore announcement state", () => {
  beforeEach(() => {
    resetStore();
  });

  it("has announcement: null in initial state", () => {
    resetStore();
    const { announcement } = useGameStore.getState();
    expect(announcement).toBeNull();
  });

  it("clearAnnouncement sets announcement to null", () => {
    useGameStore.setState({ announcement: "Test announcement" });
    useGameStore.getState().clearAnnouncement();
    expect(useGameStore.getState().announcement).toBeNull();
  });

  describe("GameStarted event", () => {
    it("does NOT produce a bid announcement (bidding not yet complete)", () => {
      const event: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "N",
        players: [
          { seat: "N", name: "You",   kind: "human" },
          { seat: "E", name: "P2", kind: "bot" },
          { seat: "S", name: "P3", kind: "bot" },
          { seat: "W", name: "P4", kind: "bot" },
        ],
        rules: DEFAULT_RULES,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      expect(useGameStore.getState().announcement).toBeNull();
    });
  });

  describe("HandStarted event", () => {
    it("does NOT produce a bid announcement (bidding not yet complete)", () => {
      const event: GameEvent = {
        type: "HandStarted",
        handNumber: 2,
        dealer: "E",
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      expect(useGameStore.getState().announcement).toBeNull();
    });
  });

  describe("BiddingComplete event", () => {
    it("sets announcement when E wins the bid at 120", () => {
      const event: GameEvent = {
        type: "BiddingComplete",
        winner: "E",
        amount: 120,
        forced: false,
        shotMoon: false,
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      expect(useGameStore.getState().announcement).toBe("P2 won the bid at 120");
    });

    it("sets 'You won the bid' when human (N) wins", () => {
      const event: GameEvent = {
        type: "BiddingComplete",
        winner: "N",
        amount: 105,
        forced: false,
        shotMoon: false,
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      expect(useGameStore.getState().announcement).toBe("You won the bid at 105");
    });

    it("appends SHOOT THE MOON when shotMoon is true", () => {
      const event: GameEvent = {
        type: "BiddingComplete",
        winner: "S",
        amount: 200,
        forced: false,
        shotMoon: true,
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      expect(useGameStore.getState().announcement).toBe("P3 won the bid at 200 — SHOOT THE MOON!");
    });
  });

  describe("TrumpSelected event", () => {
    it("sets announcement to 'P2 chose Red as trump' when E selects trump", () => {
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: "E",
        color: "Red",
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("P2 chose Red as trump");
    });

    it("sets announcement to 'You chose Green as trump' when N selects trump", () => {
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: "N",
        color: "Green",
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("You chose Green as trump");
    });

    it("sets announcement to 'P3 chose Black as trump' when S selects trump", () => {
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: "S",
        color: "Black",
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("P3 chose Black as trump");
    });

    it("sets announcement to 'P4 chose Yellow as trump' when W selects trump", () => {
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: "W",
        color: "Yellow",
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("P4 chose Yellow as trump");
    });

    it("clears previous announcement and replaces with trump announcement", () => {
      useGameStore.setState({ announcement: "Old announcement" });
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: "E",
        color: "Red",
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("P2 chose Red as trump");
    });
  });

  describe("resetGame", () => {
    it("clears announcement to null", () => {
      useGameStore.setState({ announcement: "Something was announced" });
      useGameStore.getState().resetGame();
      expect(useGameStore.getState().announcement).toBeNull();
    });
  });

  describe("startGame", () => {
    it("does NOT set announcement immediately (bidding hasn't completed yet)", () => {
      useGameStore.getState().startGame("normal");
      const { announcement } = useGameStore.getState();
      expect(announcement).toBeNull();
    });
  });

  describe("non-announcement events", () => {
    it("does not change announcement for CardPlayed events", () => {
      useGameStore.setState({ announcement: "Existing announcement" });
      const event: GameEvent = {
        type: "CardPlayed",
        seat: "E",
        cardId: "R5",
        trickIndex: 0,
        handNumber: 1,
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      // announcement should remain unchanged (store keeps it as-is)
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe("Existing announcement");
    });
  });
});
