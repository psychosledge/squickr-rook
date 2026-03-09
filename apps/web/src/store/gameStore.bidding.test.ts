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
    biddingThinkingSeat: null,
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
      { seat: "E", name: "P2", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "P3", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "P4", kind: "bot", botProfile: BOT_PRESETS[3] },
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

  describe("initial state", () => {
    it("biddingThinkingSeat is null in initial state", () => {
      expect(useGameStore.getState().biddingThinkingSeat).toBeNull();
    });
  });

  describe("resetGame", () => {
    it("biddingThinkingSeat is null after resetGame", () => {
      // Set a non-null value first
      useGameStore.setState({ biddingThinkingSeat: "E" });
      expect(useGameStore.getState().biddingThinkingSeat).toBe("E");
      useGameStore.getState().resetGame();
      expect(useGameStore.getState().biddingThinkingSeat).toBeNull();
    });
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

    it("sets biddingThinkingSeat to null when it is the human's turn to bid", () => {
      const gs = makeBiddingState("W"); // N bids first
      useGameStore.setState({ gameState: gs, biddingThinkingSeat: "E" });
      useGameStore.getState()._scheduleNextTurn();
      expect(useGameStore.getState().biddingThinkingSeat).toBeNull();
    });

    it("sets overlay to 'bidding' and biddingThinkingSeat to bot seat when it is a bot's turn during bidding", () => {
      const gs = makeBiddingState("N"); // dealer=N → leftOf(N)=E → bot bids first
      expect(gs.phase).toBe("bidding");
      expect(gs.activePlayer).toBe("E");
      useGameStore.setState({ gameState: gs });
      useGameStore.getState()._scheduleNextTurn();
      // Overlay SHOULD be 'bidding' (overlay stays open during entire bidding phase)
      expect(useGameStore.getState().overlay).toBe("bidding");
      // biddingThinkingSeat should be the active bot seat
      expect(useGameStore.getState().biddingThinkingSeat).toBe("E");
      // A timeout should be scheduled (botTimeoutId set)
      expect(useGameStore.getState().botTimeoutId).not.toBeNull();
    });

    it("schedules bot turn WITH delay (botDelayMs) during bidding phase", () => {
      const gs = makeBiddingState("N"); // E bids first
      const rulesWithDelay = { ...DEFAULT_RULES, botDelayMs: 500 };
      const gsWithDelay = { ...gs, rules: rulesWithDelay };
      useGameStore.setState({ gameState: gsWithDelay });
      useGameStore.getState()._scheduleNextTurn();
      // botTimeoutId should be set — bot scheduled with a delay
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

    it("does NOT force overlay to 'none' after human bids (overlay stays 'bidding' while bidding continues)", () => {
      const gs = makeBiddingState("W"); // N bids first, next will be E (bot)
      useGameStore.setState({ gameState: gs, overlay: "bidding", biddingThinkingSeat: null });
      useGameStore.getState().humanPlaceBid(100);
      const state = useGameStore.getState();
      // overlay should NOT be forced to "none" by humanPlaceBid
      // (it should remain "bidding" while bidding continues with bots)
      expect(state.overlay).not.toBe("none");
      // After the bot's turn is scheduled, biddingThinkingSeat should be set to the next bot
      expect(state.biddingThinkingSeat).toBe("E");
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

    it("clears biddingThinkingSeat (does NOT keep the old seat) and overlay stays 'bidding' after human passes while bidding continues", () => {
      const gs = makeBiddingState("W"); // N is active, next will be E (bot)
      useGameStore.setState({ gameState: gs, overlay: "bidding", biddingThinkingSeat: "S" });
      useGameStore.getState().humanPassBid();
      const state = useGameStore.getState();
      // overlay should remain "bidding" — not forced to "none"
      expect(state.overlay).toBe("bidding");
      // biddingThinkingSeat should NOT be the stale "S" value — it's been updated to the next bot
      expect(state.biddingThinkingSeat).not.toBe("S");
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

    it("clears biddingThinkingSeat (does NOT keep the old seat) and overlay stays 'bidding' after human shoots moon while bidding continues", () => {
      const gs = makeBiddingState("W"); // N is active, next will be E (bot)
      useGameStore.setState({ gameState: gs, overlay: "bidding", biddingThinkingSeat: "W" });
      useGameStore.getState().humanShootMoon();
      const state = useGameStore.getState();
      // overlay should remain "bidding" — not forced to "none"
      expect(state.overlay).toBe("bidding");
      // biddingThinkingSeat should NOT be the stale "W" value
      expect(state.biddingThinkingSeat).not.toBe("W");
    });
  });
});
