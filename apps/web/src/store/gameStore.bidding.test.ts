import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useGameStore } from "./gameStore";
import { INITIAL_STATE, DEFAULT_RULES, applyEvent } from "@rook/engine";
import type { GameEvent, GameState } from "@rook/engine";

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
  });
}

/** Build a GameState in the bidding phase with the given dealer */
function makeBiddingState(dealer: "N" | "E" | "S" | "W" = "N"): GameState {
  const gameStarted: GameEvent = {
    type: "GameStarted",
    seed: 42,
    dealer,
    players: [
      { seat: "N", name: "You",   kind: "human" },
      { seat: "E", name: "P2", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "S", name: "P3", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "W", name: "P4", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
    ],
    rules: DEFAULT_RULES,
    timestamp: Date.now(),
  };
  return applyEvent(INITIAL_STATE, gameStarted);
}

describe("gameStore bidding", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("_scheduleNextTurn — bidding phase", () => {
    it("sets overlay to 'bidding' when it is the human's turn to bid (dealer=W → activePlayer=N)", () => {
      const gs = makeBiddingState("W"); // dealer=W → leftOf(W)=N → human bids first
      expect(gs.phase).toBe("bidding");
      expect(gs.activePlayer).toBe("N");
      useGameStore.setState({ gameState: gs });
      useGameStore.getState()._scheduleNextTurn();
      expect(useGameStore.getState().overlay).toBe("bidding");
    });

    it("schedules bot turn with delay=0 when it is a bot's turn during bidding (dealer=N → activePlayer=E)", () => {
      const gs = makeBiddingState("N"); // dealer=N → leftOf(N)=E → bot bids first
      expect(gs.phase).toBe("bidding");
      expect(gs.activePlayer).toBe("E");
      useGameStore.setState({ gameState: gs });
      useGameStore.getState()._scheduleNextTurn();
      // Overlay should NOT be 'bidding'
      expect(useGameStore.getState().overlay).not.toBe("bidding");
      // A timeout should be scheduled (botTimeoutId set)
      expect(useGameStore.getState().botTimeoutId).not.toBeNull();
    });
  });

  describe("humanPlaceBid", () => {
    it("applies BidPlaced event when valid bid is made (human bids first, dealer=W)", () => {
      const gs = makeBiddingState("W"); // N bids first
      useGameStore.setState({ gameState: gs, overlay: "bidding" });
      useGameStore.getState().humanPlaceBid(100);
      const state = useGameStore.getState();
      expect(state.gameState?.bids["N"]).toBe(100);
      expect(state.gameState?.currentBid).toBe(100);
    });

    it("does nothing if not in bidding phase", () => {
      // No game state set
      useGameStore.getState().humanPlaceBid(100);
      expect(useGameStore.getState().gameState).toBeNull();
    });

    it("closes overlay and sets announcement when BiddingComplete fires (3 bots pass)", () => {
      // Set up: human (N) is active, E/S/W have already passed
      let gs = makeBiddingState("W"); // N bids first
      // Manually set E, S, W to passed, leaving N as sole bidder
      gs = {
        ...gs,
        bids: { N: null, E: "pass", S: "pass", W: "pass" },
        activePlayer: "N",
      };
      useGameStore.setState({ gameState: gs, overlay: "bidding" });
      // When human places a bid and 3 others have passed → BiddingComplete fires
      useGameStore.getState().humanPlaceBid(100);
      const state = useGameStore.getState();
      // bidder is now set
      expect(state.gameState?.bidder).toBe("N");
      // overlay should close (bidding complete → moves to nest phase)
      expect(state.overlay).not.toBe("bidding");
    });
  });

  describe("humanPassBid", () => {
    it("applies BidPassed event when human passes (dealer=W → N bids first)", () => {
      const gs = makeBiddingState("W"); // N is active
      useGameStore.setState({ gameState: gs, overlay: "bidding" });
      useGameStore.getState().humanPassBid();
      const state = useGameStore.getState();
      expect(state.gameState?.bids["N"]).toBe("pass");
    });

    it("does nothing if not in bidding phase", () => {
      useGameStore.getState().humanPassBid();
      expect(useGameStore.getState().gameState).toBeNull();
    });
  });

  describe("humanShootMoon", () => {
    it("applies MoonDeclared event (sets bid to maximumBid, adds to moonShooters)", () => {
      const gs = makeBiddingState("W"); // N is active
      useGameStore.setState({ gameState: gs, overlay: "bidding" });
      useGameStore.getState().humanShootMoon();
      const state = useGameStore.getState();
      expect(state.gameState?.moonShooters).toContain("N");
    });

    it("does nothing if not in bidding phase", () => {
      useGameStore.getState().humanShootMoon();
      expect(useGameStore.getState().gameState).toBeNull();
    });
  });
});
