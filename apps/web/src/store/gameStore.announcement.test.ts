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
    it("sets announcement to bidder won bid — human (N) dealer means E won", () => {
      // dealer=N → bidder=leftOf(N)=E → label "P2"
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
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`P2 won the bid at ${DEFAULT_RULES.autoBidAmount}`);
    });

    it("sets announcement to 'You won the bid' when human (N) is the bidder", () => {
      // dealer=W → bidder=leftOf(W)=N → label "You"
      const event: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "W",
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
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`You won the bid at ${DEFAULT_RULES.autoBidAmount}`);
    });

    it("sets correct label for S dealer (bidder = W = P4)", () => {
      // dealer=S → bidder=leftOf(S)=W → label "P4"
      const event: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "S",
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
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`P4 won the bid at ${DEFAULT_RULES.autoBidAmount}`);
    });
  });

  describe("HandStarted event", () => {
    it("sets announcement to bidder won bid — dealer E means bidder is S (P3)", () => {
      // dealer=E → bidder=leftOf(E)=S → label "P3"
      const event: GameEvent = {
        type: "HandStarted",
        handNumber: 2,
        dealer: "E",
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`P3 won the bid at ${DEFAULT_RULES.autoBidAmount}`);
    });

    it("sets 'You won the bid' when human (N) is bidder — dealer=W", () => {
      // dealer=W → bidder=leftOf(W)=N → label "You"
      const event: GameEvent = {
        type: "HandStarted",
        handNumber: 2,
        dealer: "W",
        timestamp: Date.now(),
      };
      useGameStore.getState()._applyEvents([event]);
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`You won the bid at ${DEFAULT_RULES.autoBidAmount}`);
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
    it("sets announcement for the opening bid (dealer=N → bidder=E → 'P2 won the bid')", () => {
      // startGame hardcodes dealer: "N", so bidder = leftOf("N") = "E" → "P2"
      useGameStore.getState().startGame("normal");
      const { announcement } = useGameStore.getState();
      expect(announcement).toBe(`P2 won the bid at ${DEFAULT_RULES.autoBidAmount}`);
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
