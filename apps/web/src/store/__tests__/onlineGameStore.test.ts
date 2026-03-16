import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useOnlineGameStore, INITIAL_ONLINE_STATE } from "../onlineGameStore";
import { INITIAL_STATE, DEFAULT_RULES, applyEvent, BOT_PRESETS } from "@rook/engine";
import type { BotDifficulty, GameEvent, GameState, Seat } from "@rook/engine";
import type { WelcomeMsg, LobbyUpdatedMsg, EventBatchMsg, CommandErrorMsg } from "../onlineGameStore.types";

function resetStore() {
  useOnlineGameStore.setState({ ...INITIAL_ONLINE_STATE });
}

/** Build a 4-seat SeatInfo array for Welcome messages */
function makeSeats(myPlayerId: string, mySeat: "N" | "E" | "S" | "W" | null = "N") {
  const seats = (["N", "E", "S", "W"] as const).map((seat) => ({
    seat,
    playerId: seat === mySeat ? myPlayerId : `bot-${seat}`,
    displayName: seat === mySeat ? "Alice" : `Bot ${seat}`,
    connected: true,
    isBot: seat !== mySeat,
  }));
  return seats;
}

/** Build a GameState in bidding phase */
function makeBiddingState(activePlayer: "N" | "E" | "S" | "W" = "N"): GameState {
  const gameStarted: GameEvent = {
    type: "GameStarted",
    seed: 42,
    dealer: "W",
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "Bot E", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "Bot S", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "Bot W", kind: "bot", botProfile: BOT_PRESETS[3] },
    ],
    rules: DEFAULT_RULES,
    timestamp: Date.now(),
  };
  let state = applyEvent(INITIAL_STATE, gameStarted);
  // If we need a specific activePlayer other than the default (leftOf dealer=W = N)
  if (activePlayer !== "N") {
    state = { ...state, activePlayer };
  }
  return state;
}

/** Build a GameState in the nest phase (N won the bid) */
function makeNestState(activePlayer: "N" | "E" | "S" | "W" = "N"): GameState {
  let state = makeBiddingState("N");
  // N bids 100, others pass → BiddingComplete
  state = applyEvent(state, { type: "BidPlaced", seat: "N", amount: 100, handNumber: 0, timestamp: 1001 });
  state = applyEvent(state, { type: "BidPassed", seat: "E", handNumber: 0, timestamp: 1002 });
  state = applyEvent(state, { type: "BidPassed", seat: "S", handNumber: 0, timestamp: 1003 });
  state = applyEvent(state, { type: "BidPassed", seat: "W", handNumber: 0, timestamp: 1004 });
  state = applyEvent(state, { type: "BiddingComplete", winner: "N", amount: 100, forced: false, shotMoon: false, handNumber: 0, timestamp: 1005 });
  // Take nest for N
  state = applyEvent(state, { type: "NestTaken", seat: "N", nestCards: [...state.nest], handNumber: 0, timestamp: 2000 });
  if (activePlayer !== "N") {
    state = { ...state, activePlayer };
  }
  return state;
}

/** Create a mock WebSocket that records sent messages */
function makeMockSocket() {
  const sent: string[] = [];
  const mockSocket = {
    readyState: WebSocket.OPEN,
    send: (data: string) => sent.push(data),
    close: () => {},
  } as unknown as WebSocket;
  return { mockSocket, sent };
}

/** Inject mock socket into store */
function injectMockSocket() {
  const { mockSocket, sent } = makeMockSocket();
  useOnlineGameStore.setState({ _socket: mockSocket });
  return { mockSocket, sent };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("onlineGameStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Test 1: Initial state ─────────────────────────────────────────────────
  describe("initial state", () => {
    it("has lobbyPhase === 'idle'", () => {
      const state = useOnlineGameStore.getState();
      expect(state.lobbyPhase).toBe("idle");
    });

    it("has gameState === null", () => {
      const state = useOnlineGameStore.getState();
      expect(state.gameState).toBeNull();
    });

    it("has mySeat === null", () => {
      const state = useOnlineGameStore.getState();
      expect(state.mySeat).toBeNull();
    });
  });

  // ── Test 2: _handleMessage dropped when idle ─────────────────────────────
  describe("_handleMessage dropped when lobbyPhase === 'idle'", () => {
    it("ignores EventBatch before connect() is called", () => {
      const msg: EventBatchMsg = {
        type: "EventBatch",
        events: [
          {
            type: "GameStarted",
            seed: 42,
            dealer: "N",
            players: [],
            rules: DEFAULT_RULES,
            timestamp: Date.now(),
          },
        ],
      };
      useOnlineGameStore.getState()._handleMessage(msg);
      expect(useOnlineGameStore.getState().gameState).toBeNull();
    });
  });

  // ── Test 3: handleWelcome (lobby phase) ──────────────────────────────────
  describe("handleWelcome — lobby phase", () => {
    it("sets lobbyPhase, roomCode, seats from Welcome message", () => {
      // Arrange: set up store as if connecting
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        myDisplayName: "Alice",
      });

      const msg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ABC123",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "lobby",
      };

      // Act
      useOnlineGameStore.getState()._handleMessage(msg);

      // Assert
      const state = useOnlineGameStore.getState();
      expect(state.lobbyPhase).toBe("lobby");
      expect(state.roomCode).toBe("ABC123");
      expect(state.seats).toHaveLength(4);
    });
  });

  // ── Test 4: handleWelcome — mySeat derivation ────────────────────────────
  describe("handleWelcome — mySeat derivation", () => {
    it("derives mySeat from seats matching myPlayerId", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        myDisplayName: "Alice",
      });

      const msg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "S"), // p1 is seated at S
        phase: "lobby",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      expect(useOnlineGameStore.getState().mySeat).toBe("S");
    });

    it("sets mySeat to null when player is not seated", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p-unseat",
        myDisplayName: "Ghost",
      });

      const msg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM2",
        hostId: "other",
        seats: makeSeats("p1", "N"), // p-unseat is not in seats
        phase: "lobby",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      expect(useOnlineGameStore.getState().mySeat).toBeNull();
    });
  });

  // ── Test 5: handleLobbyUpdated ────────────────────────────────────────────
  describe("handleLobbyUpdated", () => {
    it("updates seats, hostId and re-derives mySeat", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        mySeat: null,
      });

      const msg: LobbyUpdatedMsg = {
        type: "LobbyUpdated",
        seats: makeSeats("p1", "E"),
        hostId: "p1",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      const state = useOnlineGameStore.getState();
      expect(state.seats).toHaveLength(4);
      expect(state.hostId).toBe("p1");
      expect(state.mySeat).toBe("E");
    });
  });

  // ── Test 6: handleEventBatch buffered during "connecting" ─────────────────
  describe("handleEventBatch — buffered during 'connecting'", () => {
    it("buffers events in _pendingBatch when lobbyPhase === 'connecting'", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
      });

      const gameStartedEvent: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "N",
        players: [],
        rules: DEFAULT_RULES,
        timestamp: Date.now(),
      };

      const msg: EventBatchMsg = {
        type: "EventBatch",
        events: [gameStartedEvent],
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      const state = useOnlineGameStore.getState();
      expect(state._pendingBatch).toHaveLength(1);
      expect(state.gameState).toBeNull(); // not applied yet
    });
  });

  // ── Test 7: handleEventBatch applied during "lobby" ───────────────────────
  describe("handleEventBatch — applied during 'lobby' or 'playing'", () => {
    it("applies GameStarted event and sets lobbyPhase to 'playing'", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        mySeat: "N",
      });

      const gameStartedEvent: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "W",
        players: [
          { seat: "N", name: "Alice", kind: "human" },
          { seat: "E", name: "Bot E", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "S", name: "Bot S", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "W", name: "Bot W", kind: "bot", botProfile: BOT_PRESETS[3] },
        ],
        rules: DEFAULT_RULES,
        timestamp: Date.now(),
      };

      const msg: EventBatchMsg = {
        type: "EventBatch",
        events: [gameStartedEvent],
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      const state = useOnlineGameStore.getState();
      expect(state.gameState).not.toBeNull();
      expect(state.lobbyPhase).toBe("playing");
    });
  });

  // ── Test 8: _applyIncomingEvents with HandScored ──────────────────────────
  describe("_applyIncomingEvents — HandScored event", () => {
    it("sets pendingHandScore and overlay to 'hand-result'", () => {
      // Need a valid game state first to apply events on
      const biddingState = makeBiddingState("N");

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingState,
      });

      const handScore = {
        hand: 1,
        bidder: "N" as const,
        bidAmount: 100,
        nestCards: [],
        discarded: [],
        nsPointCards: 120,
        ewPointCards: 0,
        nsMostCardsBonus: 0,
        ewMostCardsBonus: 0,
        nsNestBonus: 0,
        ewNestBonus: 0,
        nsWonLastTrick: true,
        ewWonLastTrick: false,
        nsTotal: 120,
        ewTotal: 0,
        nsDelta: 100,
        ewDelta: 0,
        shotMoon: false,
        moonShooterWentSet: false,
      };

      const handScoredEvent: GameEvent = {
        type: "HandScored",
        score: handScore,
        handNumber: 1,
        timestamp: Date.now(),
      };

      useOnlineGameStore.getState()._applyIncomingEvents([handScoredEvent]);

      const state = useOnlineGameStore.getState();
      expect(state.pendingHandScore).not.toBeNull();
      expect(state.overlay).toBe("hand-result");
    });
  });

  // ── Test 9: _applyIncomingEvents with GameFinished ────────────────────────
  describe("_applyIncomingEvents — GameFinished event", () => {
    it("sets overlay to 'game-over' when game is finished", () => {
      const biddingState = makeBiddingState("N");

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingState,
      });

      const gameFinishedEvent: GameEvent = {
        type: "GameFinished",
        winner: "NS",
        reason: "threshold-reached",
        finalScores: { NS: 500, EW: 200 },
        timestamp: Date.now(),
      };

      useOnlineGameStore.getState()._applyIncomingEvents([gameFinishedEvent]);

      const state = useOnlineGameStore.getState();
      expect(state.gameOverReason).toBe("threshold-reached");
      expect(state.overlay).toBe("game-over");
    });
  });

  // ── Test 10: _updateOverlayAfterBatch — bidding, human's turn ─────────────
  describe("_updateOverlayAfterBatch — bidding phase", () => {
    it("sets overlay to 'bidding' and biddingThinkingSeat null when activePlayer === mySeat", () => {
      const biddingState = makeBiddingState("N"); // N is active

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingState,
        biddingThinkingSeat: "E", // some stale value
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("bidding");
      expect(state.biddingThinkingSeat).toBeNull();
    });

    // ── Test 11: _updateOverlayAfterBatch — bidding, opponent's turn ─────────
    it("sets biddingThinkingSeat to activePlayer when it is NOT the human's turn", () => {
      const biddingState = makeBiddingState("E"); // E is active (not human)

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingState,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("bidding");
      expect(state.biddingThinkingSeat).toBe("E");
    });
  });

  // ── Test 12: _updateOverlayAfterBatch — nest, human's turn ───────────────
  describe("_updateOverlayAfterBatch — nest phase", () => {
    it("sets overlay to 'nest' when it is the human's turn in nest phase AND nest already taken (originalNest.length > 0)", () => {
      const nestState = makeNestState("N"); // N is active in nest, NestTaken already applied

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: nestState,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      expect(useOnlineGameStore.getState().overlay).toBe("nest");
    });

    // ── Test 12b: _updateOverlayAfterBatch — nest, human's turn, nest NOT yet taken ───
    it("sends TakeNest command (not overlay:'nest') when phase=nest, activePlayer=mySeat, originalNest is empty", () => {
      const { sent } = injectMockSocket();

      // Build a state in nest phase but originalNest is still empty (NestTaken not applied yet)
      let state = makeBiddingState("N");
      state = applyEvent(state, { type: "BidPlaced", seat: "N", amount: 100, handNumber: 0, timestamp: 1001 });
      state = applyEvent(state, { type: "BidPassed", seat: "E", handNumber: 0, timestamp: 1002 });
      state = applyEvent(state, { type: "BidPassed", seat: "S", handNumber: 0, timestamp: 1003 });
      state = applyEvent(state, { type: "BidPassed", seat: "W", handNumber: 0, timestamp: 1004 });
      state = applyEvent(state, { type: "BiddingComplete", winner: "N", amount: 100, forced: false, shotMoon: false, handNumber: 0, timestamp: 1005 });
      // Do NOT apply NestTaken — originalNest is still []

      expect(state.phase).toBe("nest");
      expect(state.originalNest).toHaveLength(0);

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: state,
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      // Should send TakeNest, NOT open nest overlay
      const messages = sent.map((s) => JSON.parse(s));
      const takeNestMsgs = messages.filter(
        (m) => m.type === "SendCommand" && m.command?.type === "TakeNest",
      );
      expect(takeNestMsgs).toHaveLength(1);
      expect(takeNestMsgs[0].command.seat).toBe("N");

      // Overlay must NOT be set to "nest" yet
      expect(useOnlineGameStore.getState().overlay).toBe("none");
    });

    // ── Test 13: _updateOverlayAfterBatch — nest, not human's turn ───────────
    it("sets overlay to 'none' when it is NOT the human's turn in nest phase", () => {
      const nestState = makeNestState("E"); // E is active (not human)

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: nestState,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      expect(useOnlineGameStore.getState().overlay).toBe("none");
    });
  });

  // ── Test 14: toggleDiscard ────────────────────────────────────────────────
  describe("toggleDiscard", () => {
    beforeEach(() => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
      });
    });

    it("adds a card to pendingDiscards", () => {
      useOnlineGameStore.getState().toggleDiscard("Black-10");
      expect(useOnlineGameStore.getState().pendingDiscards).toContain("Black-10");
    });

    it("removes a card when toggled again", () => {
      useOnlineGameStore.getState().toggleDiscard("Black-10");
      useOnlineGameStore.getState().toggleDiscard("Black-10");
      expect(useOnlineGameStore.getState().pendingDiscards).not.toContain("Black-10");
    });

    it("caps at 5 cards — does not add a 6th", () => {
      const cards = ["c1", "c2", "c3", "c4", "c5", "c6"];
      for (const c of cards) {
        useOnlineGameStore.getState().toggleDiscard(c);
      }
      expect(useOnlineGameStore.getState().pendingDiscards).toHaveLength(5);
      expect(useOnlineGameStore.getState().pendingDiscards).not.toContain("c6");
    });
  });

  // ── Test 15: confirmDiscards sends 5 DiscardCard commands ────────────────
  describe("confirmDiscards", () => {
    it("sends 5 DiscardCard commands and no TakeNest command", () => {
      const { sent } = injectMockSocket();

      const nestState = makeNestState("N");

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: nestState,
        _socket: useOnlineGameStore.getState()._socket,
        pendingDiscards: ["c1", "c2", "c3", "c4", "c5"],
      });

      useOnlineGameStore.getState().confirmDiscards();

      // Parse sent messages
      const messages = sent.map((s) => JSON.parse(s));
      const sendCommandMsgs = messages.filter((m) => m.type === "SendCommand");
      const discardMsgs = sendCommandMsgs.filter((m) => m.command?.type === "DiscardCard");
      const takeNestMsgs = sendCommandMsgs.filter((m) => m.command?.type === "TakeNest");

      expect(discardMsgs).toHaveLength(5);
      expect(takeNestMsgs).toHaveLength(0);
    });

    // ── Test 16: confirmDiscards no-op if fewer than 5 ───────────────────────
    it("does not send anything if pendingDiscards has fewer than 5 cards", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        _socket: useOnlineGameStore.getState()._socket,
        pendingDiscards: ["c1", "c2", "c3"],
      });

      useOnlineGameStore.getState().confirmDiscards();

      expect(sent).toHaveLength(0);
    });
  });

  // ── Test 17: acknowledgeHandResult ───────────────────────────────────────
  describe("acknowledgeHandResult", () => {
    it("clears pendingHandScore and sets correct overlay when game is ongoing", () => {
      const biddingState = makeBiddingState("N");

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingState,
        pendingHandScore: {
          hand: 1, bidder: "N", bidAmount: 100, nestCards: [], discarded: [],
          nsPointCards: 120, ewPointCards: 0, nsMostCardsBonus: 0, ewMostCardsBonus: 0,
          nsNestBonus: 0, ewNestBonus: 0, nsWonLastTrick: true, ewWonLastTrick: false,
          nsTotal: 120, ewTotal: 0, nsDelta: 100, ewDelta: 0, shotMoon: false, moonShooterWentSet: false,
        },
        overlay: "hand-result",
      });

      useOnlineGameStore.getState().acknowledgeHandResult();

      const state = useOnlineGameStore.getState();
      expect(state.pendingHandScore).toBeNull();
      // game not finished, so overlay should be determined by game phase
      expect(state.overlay).not.toBe("hand-result");
    });

    it("sets overlay to 'game-over' when game is finished", () => {
      const finishedState = { ...makeBiddingState("N"), phase: "finished" as const };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: finishedState,
        pendingHandScore: {
          hand: 1, bidder: "N", bidAmount: 100, nestCards: [], discarded: [],
          nsPointCards: 120, ewPointCards: 0, nsMostCardsBonus: 0, ewMostCardsBonus: 0,
          nsNestBonus: 0, ewNestBonus: 0, nsWonLastTrick: true, ewWonLastTrick: false,
          nsTotal: 120, ewTotal: 0, nsDelta: 100, ewDelta: 0, shotMoon: false, moonShooterWentSet: false,
        },
        overlay: "hand-result",
      });

      useOnlineGameStore.getState().acknowledgeHandResult();

      expect(useOnlineGameStore.getState().overlay).toBe("game-over");
    });
  });

  // ── Test 18: _pendingBatch drained on Welcome ─────────────────────────────
  describe("_pendingBatch drained on Welcome", () => {
    it("applies buffered events when Welcome is received after EventBatch", () => {
      // Start as connecting
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        myDisplayName: "Alice",
      });

      // Receive EventBatch during connecting (gets buffered)
      const gameStartedEvent: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "W",
        players: [
          { seat: "N", name: "Alice", kind: "human" },
          { seat: "E", name: "Bot E", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "S", name: "Bot S", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "W", name: "Bot W", kind: "bot", botProfile: BOT_PRESETS[3] },
        ],
        rules: DEFAULT_RULES,
        timestamp: Date.now(),
      };

      const batchMsg: EventBatchMsg = {
        type: "EventBatch",
        events: [gameStartedEvent],
      };

      useOnlineGameStore.getState()._handleMessage(batchMsg);

      // Verify it's buffered, not applied
      expect(useOnlineGameStore.getState()._pendingBatch).toHaveLength(1);
      expect(useOnlineGameStore.getState().gameState).toBeNull();

      // Now receive Welcome with phase: "playing" (or lobby, then events drain)
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "lobby", // Welcome sets lobby, then pending batch is drained
      };

      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // After Welcome, pending batch should be drained and gameState applied
      const state = useOnlineGameStore.getState();
      expect(state._pendingBatch).toHaveLength(0);
      expect(state.gameState).not.toBeNull();
    });
  });

  // ── Test 19: handleCommandError ───────────────────────────────────────────
  describe("handleCommandError", () => {
    it("sets connectionError from CommandError message", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
      });

      const msg: CommandErrorMsg = {
        type: "CommandError",
        reason: "Invalid move: card not in hand",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      expect(useOnlineGameStore.getState().connectionError).toBe("Invalid move: card not in hand");
    });
  });

  // ── Additional: _sendRaw no-op when socket not OPEN ───────────────────────
  describe("_sendRaw", () => {
    it("does not throw when socket is null", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        _socket: null,
      });

      // Should not throw
      expect(() => {
        useOnlineGameStore.getState()._sendRaw({ type: "LeaveSeat" });
      }).not.toThrow();
    });
  });

  // ── Additional: claimSeat, leaveSeat, startGame send correct messages ─────
  describe("lobby actions", () => {
    it("claimSeat sends ClaimSeat message", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().claimSeat("W");

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "ClaimSeat", seat: "W" });
    });

    it("leaveSeat sends LeaveSeat message", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().leaveSeat();

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "LeaveSeat" });
    });

    it("startGame sends StartGame message", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().startGame();

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "StartGame" });
    });
  });

  // ── Test: _updateOverlayAfterBatch — trump phase ──────────────────────────
  describe("_updateOverlayAfterBatch — trump phase", () => {
    it("sets overlay to 'trump' when it is the human's turn in trump phase", () => {
      const gameState = { ...INITIAL_STATE, phase: "trump" as const, activePlayer: "N" as Seat };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("trump");
      expect(state.biddingThinkingSeat).toBeNull();
    });

    it("sets overlay to 'none' when it is NOT the human's turn in trump phase", () => {
      const gameState = { ...INITIAL_STATE, phase: "trump" as const, activePlayer: "E" as Seat };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("none");
      expect(state.biddingThinkingSeat).toBeNull();
    });
  });

  // ── Tests: _applyIncomingEvents — TrickCompleted queue ────────────────────
  describe("_applyIncomingEvents — TrickCompleted queue", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      resetStore();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const makeTrickCompleted = (): GameEvent => ({
      type: "TrickCompleted",
      plays: [
        { seat: "N", cardId: "Black-10" },
        { seat: "E", cardId: "Red-5" },
        { seat: "S", cardId: "Green-7" },
        { seat: "W", cardId: "Yellow-3" },
      ],
      winner: "N",
      leadColor: "Black",
      trickIndex: 0,
      handNumber: 1,
      timestamp: Date.now(),
    });

    const makeCardPlayed = (seat: "N" | "E" | "S" | "W", cardId: string): GameEvent => ({
      type: "CardPlayed",
      seat,
      cardId: cardId as import("@rook/engine").CardId,
      trickIndex: 1,
      handNumber: 1,
      timestamp: Date.now(),
    });

    const makeHandScored = (): GameEvent => ({
      type: "HandScored",
      score: {
        hand: 1,
        bidder: "N" as const,
        bidAmount: 100,
        nestCards: [],
        discarded: [],
        nsPointCards: 120,
        ewPointCards: 0,
        nsMostCardsBonus: 0,
        ewMostCardsBonus: 0,
        nsNestBonus: 0,
        ewNestBonus: 0,
        nsWonLastTrick: true,
        ewWonLastTrick: false,
        nsTotal: 120,
        ewTotal: 0,
        nsDelta: 100,
        ewDelta: 0,
        shotMoon: false,
        moonShooterWentSet: false,
      },
      handNumber: 1,
      timestamp: Date.now(),
    });

    const makeFakePlayingState = (): GameState => ({
      ...INITIAL_STATE,
      phase: "playing",
      rules: { ...DEFAULT_RULES, botDelayMs: 100 },
      currentTrick: [],
      tricksPlayed: 0,
      activePlayer: "N",
    });

    it("buffers batches that arrive during TrickCompleted defer window", () => {
      const playingState = makeFakePlayingState();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
        _deferredEventQueue: [], // simulating mid-defer
      });

      const cardPlayed = makeCardPlayed("E", "Red-5");

      // Call _applyIncomingEvents while deferred queue is open
      useOnlineGameStore.getState()._applyIncomingEvents([cardPlayed]);

      // Batch should be buffered, NOT applied
      const state = useOnlineGameStore.getState();
      expect(state._deferredEventQueue).toHaveLength(1);
      // gameState should NOT have changed (no CardPlayed applied)
      expect(state.gameState).toEqual(playingState);
    });

    it("drains queued batches after TrickCompleted is applied", async () => {
      const playingState = makeFakePlayingState();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
      });

      const trickCompleted = makeTrickCompleted();
      const anotherCardPlayed = makeCardPlayed("E", "Red-5");

      // Call with TrickCompleted — should open the deferred queue
      useOnlineGameStore.getState()._applyIncomingEvents([trickCompleted]);

      // Queue should be open (empty array, not null)
      expect(useOnlineGameStore.getState()._deferredEventQueue).toEqual([]);

      // Another batch arrives during the defer window — should be buffered
      useOnlineGameStore.getState()._applyIncomingEvents([anotherCardPlayed]);
      expect(useOnlineGameStore.getState()._deferredEventQueue).toHaveLength(1);

      // Advance past botDelayMs (100ms) + microtask (0ms)
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(0);

      // Queue should be closed (null) after drain
      expect(useOnlineGameStore.getState()._deferredEventQueue).toBeNull();
    });

    it("processes afterTrickEvents inline without going through queue", async () => {
      const playingState = makeFakePlayingState();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
      });

      const trickCompleted = makeTrickCompleted();
      const handScored = makeHandScored();

      // Batch with TrickCompleted followed by HandScored
      useOnlineGameStore.getState()._applyIncomingEvents([trickCompleted, handScored]);

      // Before timers fire, pendingHandScore should be null
      expect(useOnlineGameStore.getState().pendingHandScore).toBeNull();

      // Advance past botDelayMs (100ms) — TrickCompleted applied
      await vi.advanceTimersByTimeAsync(100);
      // Flush the nested 0ms microtask timer — afterTrickEvents applied
      await vi.runAllTimersAsync();

      // pendingHandScore should now be set (HandScored was applied after TrickCompleted)
      expect(useOnlineGameStore.getState().pendingHandScore).not.toBeNull();
    });

    it("acknowledgeHandResult drains queued batches and closes the queue", async () => {
      const playingState = makeFakePlayingState();
      const cardPlayed = makeCardPlayed("E", "Red-5");

      // Simulate a state where the deferred queue has a buffered batch
      // (as if TrickCompleted fired, timer is resolved, but queue has a batch from next hand)
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
        pendingHandScore: {
          hand: 1,
          bidder: "N",
          bidAmount: 100,
          nestCards: [],
          discarded: [],
          nsPointCards: 120,
          ewPointCards: 0,
          nsMostCardsBonus: 0,
          ewMostCardsBonus: 0,
          nsNestBonus: 0,
          ewNestBonus: 0,
          nsWonLastTrick: true,
          ewWonLastTrick: false,
          nsTotal: 120,
          ewTotal: 0,
          nsDelta: 100,
          ewDelta: 0,
          shotMoon: false,
          moonShooterWentSet: false,
        },
        // Queue is open with one buffered batch
        _deferredEventQueue: [[cardPlayed]],
      });

      // Queue is non-null before acknowledgement
      expect(useOnlineGameStore.getState()._deferredEventQueue).not.toBeNull();

      // Acknowledge — should drain the queue
      useOnlineGameStore.getState().acknowledgeHandResult();

      // Queue must be closed (null) after acknowledgement
      expect(useOnlineGameStore.getState()._deferredEventQueue).toBeNull();
    });
  });

  // ── Test: disconnect() resets to idle state ───────────────────────────────
  describe("disconnect", () => {
    it("resets to idle state after disconnect()", () => {
      useOnlineGameStore.setState({
        lobbyPhase: "playing",
        roomCode: "ABC123",
        gameState: { ...INITIAL_STATE },
        mySeat: "N",
      });

      useOnlineGameStore.getState().disconnect();

      const s = useOnlineGameStore.getState();
      expect(s.lobbyPhase).toBe("idle");
      expect(s.roomCode).toBeNull();
      expect(s.gameState).toBeNull();
      expect(s.mySeat).toBeNull();
      expect(s._socket).toBeNull();
    });
  });

  // ── Test: TrickCompleted delay — trick NOT cleared immediately ─────────────
  describe("_applyIncomingEvents — TrickCompleted delay", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("trick cards stay visible immediately after batch arrives; cleared after botDelayMs", async () => {
      vi.useFakeTimers();

      // Build a playing-phase state with a populated currentTrick
      const playingState: GameState = {
        ...INITIAL_STATE,
        phase: "playing",
        rules: { ...DEFAULT_RULES, botDelayMs: 500 },
        currentTrick: [
          { seat: "N", cardId: "Black-10" },
          { seat: "E", cardId: "Red-5" },
          { seat: "S", cardId: "Green-7" },
          { seat: "W", cardId: "Yellow-3" },
        ],
        // Fake completed tricks / other needed fields
        tricksPlayed: 0,
        activePlayer: "E",
      };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
      });

      // Events: CardPlayed (pre) + TrickCompleted (the split point) + CardPlayed (post, next trick)
      const cardPlayedPre: GameEvent = {
        type: "CardPlayed",
        seat: "N",
        cardId: "Black-10",
        trickIndex: 1,
        handNumber: 1,
        timestamp: Date.now(),
      };

      const trickCompleted: GameEvent = {
        type: "TrickCompleted",
        plays: [
          { seat: "N", cardId: "Black-10" },
          { seat: "E", cardId: "Red-5" },
          { seat: "S", cardId: "Green-7" },
          { seat: "W", cardId: "Yellow-3" },
        ],
        winner: "N",
        leadColor: "Black",
        trickIndex: 0,
        handNumber: 1,
        timestamp: Date.now(),
      };

      const cardPlayedPost: GameEvent = {
        type: "CardPlayed",
        seat: "E",
        cardId: "Red-5",
        trickIndex: 1,
        handNumber: 1,
        timestamp: Date.now(),
      };

      useOnlineGameStore.getState()._applyIncomingEvents([
        cardPlayedPre,
        trickCompleted,
        cardPlayedPost,
      ]);

      // IMMEDIATELY: trick should still be populated (pre-events applied, post-events deferred)
      const stateImmediate = useOnlineGameStore.getState();
      expect(stateImmediate.gameState?.currentTrick.length).toBeGreaterThan(0);

      // AFTER botDelayMs: post-events applied, trick cleared
      await vi.advanceTimersByTimeAsync(500);

      const stateAfter = useOnlineGameStore.getState();
      expect(stateAfter.gameState?.currentTrick).toHaveLength(0);
    });

    it("no delay when batch has no TrickCompleted event — original behaviour", () => {
      vi.useFakeTimers();

      const playingState: GameState = {
        ...INITIAL_STATE,
        phase: "playing",
        rules: { ...DEFAULT_RULES, botDelayMs: 500 },
        currentTrick: [{ seat: "N", cardId: "Black-10" }],
        tricksPlayed: 0,
        activePlayer: "E",
      };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: playingState,
      });

      const cardPlayedEvent: GameEvent = {
        type: "CardPlayed",
        seat: "E",
        cardId: "Red-5",
        trickIndex: 0,
        handNumber: 1,
        timestamp: Date.now(),
      };

      useOnlineGameStore.getState()._applyIncomingEvents([cardPlayedEvent]);

      // No TrickCompleted in batch → applied synchronously, overlay updated immediately
      // The state should be updated right away (no async needed)
      const state = useOnlineGameStore.getState();
      expect(state.gameState).not.toBeNull();
    });
  });

  // ── Test: "Your Turn!" announcement ──────────────────────────────────────
  describe("_applyIncomingEvents — 'Your Turn!' announcement", () => {
    /** Build a minimal playing-phase GameState with the given activePlayer */
    function makePlayingState(activePlayer: Seat): GameState {
      return {
        ...INITIAL_STATE,
        phase: "playing",
        rules: { ...DEFAULT_RULES, botDelayMs: 0 },
        activePlayer,
        currentTrick: [],
        tricksPlayed: 0,
      };
    }

    it("sets announcement to 'Your Turn!' when activePlayer transitions to mySeat (playing phase)", () => {
      // Arrange: playing state with activePlayer=W (mySeat=N is NOT active)
      // CardPlayed(W) uses nextSeat(W)=N, so after applying it activePlayer becomes N.
      const prevPlayingState = makePlayingState("W");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: prevPlayingState,
        announcement: null,
      });

      // CardPlayed(W) → engine sets activePlayer = nextSeat(W) = N
      const cardPlayedEvent: GameEvent = {
        type: "CardPlayed",
        seat: "W",
        cardId: "Black-10" as import("@rook/engine").CardId,
        trickIndex: 0,
        handNumber: 0,
        timestamp: Date.now(),
      };

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents([cardPlayedEvent]);

      // Assert: nextActive = N (mySeat), prevActive = W, phase = playing → "Your Turn!"
      const state = useOnlineGameStore.getState();
      expect(state.gameState?.activePlayer).toBe("N");
      expect(state.gameState?.phase).toBe("playing");
      expect(state.announcement).toBe("Your Turn!");
    });

    it("does NOT set 'Your Turn!' when activePlayer transitions to a different seat (not mySeat)", () => {
      // Playing state where N is active; CardPlayed(N) → nextSeat(N) = E (not mySeat=N)
      const prevPlayingState = makePlayingState("N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: prevPlayingState,
        announcement: null,
      });

      // CardPlayed(N) → engine sets activePlayer = nextSeat(N) = E
      const cardPlayedEvent: GameEvent = {
        type: "CardPlayed",
        seat: "N",
        cardId: "Black-10" as import("@rook/engine").CardId,
        trickIndex: 0,
        handNumber: 0,
        timestamp: Date.now(),
      };

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents([cardPlayedEvent]);

      // Assert: nextActive = E (not mySeat N) → no "Your Turn!"
      const state = useOnlineGameStore.getState();
      expect(state.gameState?.activePlayer).toBe("E");
      expect(state.announcement).not.toBe("Your Turn!");
    });

    it("does NOT set 'Your Turn!' during bidding phase (even if activePlayer === mySeat)", () => {
      // mySeat = N, activePlayer was E (bidding), then transitions to N during bidding
      const prevBiddingState = makeBiddingState("E"); // E's turn to bid
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: prevBiddingState,
        announcement: null,
      });

      // Apply BidPassed for E → active moves to S... still not N in bidding.
      // Actually to get N as next bidder after E in a 4-seat game:
      // If E passes, S passes, W passes → N wins by force, → BiddingComplete, not helpful.
      // Easier: use a state where E bids, and BidPlaced advances to S.
      // Or: just set up state directly. prev=S (bidding), apply BidPassed for S → next=W.
      // The point is: whatever the transition, if phase=bidding, no "Your Turn!".
      //
      // Let's use BidPlaced(E) from prevBiddingState(E) → advances to S (still bidding).
      // That means nextActive=S != mySeat=N → announcement won't fire regardless.
      // To isolate the "bidding phase" rule, we need nextActive=N but phase=bidding.
      // BidPlaced(E) → S, BidPlaced(S) → W, BidPlaced(W) → N (N is back to bid).
      // After 3 BidPlaced events applied in sequence, nextActive = N, phase = bidding.
      const events: GameEvent[] = [
        { type: "BidPlaced", seat: "E", amount: 70, handNumber: 0, timestamp: 1001 },
        { type: "BidPlaced", seat: "S", amount: 75, handNumber: 0, timestamp: 1002 },
        { type: "BidPlaced", seat: "W", amount: 80, handNumber: 0, timestamp: 1003 },
      ];

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents(events);

      // Assert: nextActive = N, phase = bidding → no "Your Turn!"
      const state = useOnlineGameStore.getState();
      expect(state.gameState?.activePlayer).toBe("N");
      expect(state.gameState?.phase).toBe("bidding");
      expect(state.announcement).not.toBe("Your Turn!");
    });

    it("does NOT stomp a BiddingComplete/TrumpSelected announcement from the same batch", () => {
      // Build a state with bidder=W in trump phase.
      // TrumpSelected(W) → phase="playing", activePlayer=leftOf(W)=N (mySeat).
      // buildAnnouncementFromEvent sets announcement="W chose Red as trump" first,
      // so shouldAnnounceYourTurn must be false (announcement already set in this batch).
      let state2 = makeBiddingState("N");
      state2 = applyEvent(state2, { type: "BidPassed", seat: "N", handNumber: 0, timestamp: 1001 });
      state2 = applyEvent(state2, { type: "BidPassed", seat: "E", handNumber: 0, timestamp: 1002 });
      state2 = applyEvent(state2, { type: "BidPassed", seat: "S", handNumber: 0, timestamp: 1003 });
      state2 = applyEvent(state2, { type: "BiddingComplete", winner: "W", amount: 70, forced: true, shotMoon: false, handNumber: 0, timestamp: 1005 });
      state2 = applyEvent(state2, { type: "NestTaken", seat: "W", nestCards: [...state2.nest], handNumber: 0, timestamp: 2000 });
      // Skip discards — force into trump phase directly
      state2 = { ...state2, phase: "trump" as const, activePlayer: "W" as Seat };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: { ...state2, phase: "trump", activePlayer: "W" },
        announcement: null,
      });

      // Apply TrumpSelected(W) → phase=playing, activePlayer= leftOf(W) = N
      const trumpSelectedEvent: GameEvent = {
        type: "TrumpSelected",
        seat: "W",
        color: "Red",
        handNumber: state2.handNumber,
        timestamp: Date.now(),
      };

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents([trumpSelectedEvent]);

      // Assert: announcement should be "W chose Red as trump", NOT "Your Turn!"
      const s = useOnlineGameStore.getState();
      expect(s.gameState?.activePlayer).toBe("N"); // next active is N (mySeat)
      expect(s.gameState?.phase).toBe("playing");   // transitioned to playing
      expect(s.announcement).not.toBe("Your Turn!"); // TrumpSelected announcement wins
      expect(s.announcement).toContain("Red");       // TrumpSelected announcement is present
    });

    it("does NOT set 'Your Turn!' when mySeat is null (single-player / spectator)", () => {
      // Arrange: mySeat is null — no seat assigned (spectator / single-player mode)
      // Playing state with activePlayer=W; CardPlayed(W) → nextActive=N
      const prevPlayingState = makePlayingState("W");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: null, // no seat
        gameState: prevPlayingState,
        announcement: null,
      });

      // CardPlayed(W) → engine sets activePlayer = nextSeat(W) = N
      const cardPlayedEvent: GameEvent = {
        type: "CardPlayed",
        seat: "W",
        cardId: "Black-10" as import("@rook/engine").CardId,
        trickIndex: 0,
        handNumber: 0,
        timestamp: Date.now(),
      };

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents([cardPlayedEvent]);

      // Assert: mySeat is null → no "Your Turn!" regardless of activePlayer transition
      const state = useOnlineGameStore.getState();
      expect(state.announcement).not.toBe("Your Turn!");
    });

    it("does NOT set 'Your Turn!' when the transition arrives via TrickCompleted path (deferred)", () => {
      vi.useFakeTimers();
      try {
        // Arrange: playing state where W is active; TrickCompleted(winner=W) → after trick, activePlayer=N=mySeat
        const prevPlayingState: GameState = {
          ...INITIAL_STATE,
          phase: "playing",
          rules: { ...DEFAULT_RULES, botDelayMs: 0 },
          activePlayer: "W",
          currentTrick: [],
          tricksPlayed: 0,
        };
        useOnlineGameStore.setState({
          ...INITIAL_ONLINE_STATE,
          lobbyPhase: "playing",
          myPlayerId: "p1",
          mySeat: "N",
          gameState: prevPlayingState,
          announcement: null,
        });

        const trickCompleted: GameEvent = {
          type: "TrickCompleted",
          plays: [
            { seat: "N", cardId: "Black-10" as import("@rook/engine").CardId },
            { seat: "E", cardId: "Red-5" as import("@rook/engine").CardId },
            { seat: "S", cardId: "Green-7" as import("@rook/engine").CardId },
            { seat: "W", cardId: "Yellow-3" as import("@rook/engine").CardId },
          ],
          winner: "N",
          leadColor: "Black",
          trickIndex: 0,
          handNumber: 1,
          timestamp: Date.now(),
        };

        // Act: TrickCompleted batch — takes the deferred setTimeout path, not the "Your Turn!" path
        useOnlineGameStore.getState()._applyIncomingEvents([trickCompleted]);

        // Before timer fires: announcement should still be null (not "Your Turn!")
        expect(useOnlineGameStore.getState().announcement).not.toBe("Your Turn!");

        // After timer fires: still no "Your Turn!" — the TrickCompleted path never sets it
        vi.runAllTimers();
        expect(useOnlineGameStore.getState().announcement).not.toBe("Your Turn!");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── updateDisplayName ─────────────────────────────────────────────────────
  describe("updateDisplayName", () => {
    // localStorage stub (node environment has no localStorage)
    const localStorageStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { localStorageStore[key] = value; },
      removeItem: (key: string) => { delete localStorageStore[key]; },
    };

    beforeEach(() => {
      // Stub localStorage on globalThis
      vi.stubGlobal("localStorage", mockLocalStorage);
      // Clear store
      delete localStorageStore["rookDisplayName"];
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("trims the name, updates localStorage and store state", () => {
      const { mockSocket } = injectMockSocket();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        myDisplayName: "Alice",
        _socket: mockSocket,
      });

      useOnlineGameStore.getState().updateDisplayName("  Bob  ");

      const state = useOnlineGameStore.getState();
      expect(state.myDisplayName).toBe("Bob");
      expect(localStorage.getItem("rookDisplayName")).toBe("Bob");
    });

    it("sends UpdateName message via _sendRaw", () => {
      const { mockSocket, sent } = injectMockSocket();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        myDisplayName: "Alice",
        _socket: mockSocket,
      });

      useOnlineGameStore.getState().updateDisplayName("Charlie");

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "UpdateName", displayName: "Charlie" });
    });

    it("does nothing when trimmed name is empty", () => {
      const { mockSocket, sent } = injectMockSocket();
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        myDisplayName: "Alice",
        _socket: mockSocket,
      });

      useOnlineGameStore.getState().updateDisplayName("   ");

      const state = useOnlineGameStore.getState();
      expect(state.myDisplayName).toBe("Alice");
      expect(sent).toHaveLength(0);
      expect(localStorage.getItem("rookDisplayName")).toBeNull();
    });

    it("does nothing when not connected (_socket is null)", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        myDisplayName: "Alice",
        _socket: null,
      });

      // Should not throw, should not update anything
      expect(() => {
        useOnlineGameStore.getState().updateDisplayName("Dave");
      }).not.toThrow();

      const state = useOnlineGameStore.getState();
      expect(state.myDisplayName).toBe("Alice");
      expect(localStorage.getItem("rookDisplayName")).toBeNull();
    });
  });

  // ── buildAnnouncementFromEvent — seatNames display names ─────────────────
  describe("buildAnnouncementFromEvent — display names in announcements", () => {
    it("BiddingComplete announcement uses display name from seats when available", () => {
      // Arrange: set up store with seats having display names, gameState in bidding phase
      const biddingState = makeBiddingState("N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        seats: makeSeats("p1", "N"), // Alice is at N
        gameState: biddingState,
      });

      // Act: apply BiddingComplete event for seat N (Alice)
      const biddingCompleteEvent: GameEvent = {
        type: "BiddingComplete",
        winner: "N",
        amount: 120,
        forced: false,
        shotMoon: false,
        handNumber: biddingState.handNumber,
        timestamp: Date.now(),
      };
      useOnlineGameStore.getState()._applyIncomingEvents([biddingCompleteEvent]);

      // Assert: announcement uses display name "Alice", not the seat label "You"
      const announcement = useOnlineGameStore.getState().announcement;
      expect(announcement).not.toBeNull();
      expect(announcement).toContain("Alice");
    });

    it("TrumpSelected announcement uses display name from seats when available", () => {
      // Arrange: set up store at nest phase
      const nestState = makeNestState("N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        seats: makeSeats("p1", "N"), // Alice is at N
        gameState: nestState,
      });

      // Act: apply TrumpSelected event for seat N (Alice)
      const trumpSelectedEvent: GameEvent = {
        type: "TrumpSelected",
        seat: "N",
        color: "Green",
        handNumber: nestState.handNumber,
        timestamp: Date.now(),
      };
      useOnlineGameStore.getState()._applyIncomingEvents([trumpSelectedEvent]);

      // Assert: announcement uses display name "Alice"
      const announcement = useOnlineGameStore.getState().announcement;
      expect(announcement).not.toBeNull();
      expect(announcement).toContain("Alice");
    });
  });

  // ── PlayerDisconnected handling ───────────────────────────────────────────
  describe("PlayerDisconnected handling", () => {
    it("sets disconnectedAlert and gamePaused:true on PlayerDisconnected message", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: makeBiddingState("E"),
      });

      const msg: import("../onlineGameStore.types").PlayerDisconnectedMsg = {
        type: "PlayerDisconnected",
        seat: "E",
        displayName: "Bob",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      const state = useOnlineGameStore.getState();
      expect(state.disconnectedAlert).toEqual({ seat: "E", displayName: "Bob" });
      expect(state.gamePaused).toBe(true);
    });
  });

  // ── PlayerReconnected handling ────────────────────────────────────────────
  describe("PlayerReconnected handling", () => {
    it("clears disconnectedAlert and gamePaused:false on PlayerReconnected message", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: makeBiddingState("E"),
        disconnectedAlert: { seat: "E", displayName: "Bob" },
        gamePaused: true,
      });

      const msg: import("../onlineGameStore.types").PlayerReconnectedMsg = {
        type: "PlayerReconnected",
        seat: "E",
        displayName: "Bob",
      };

      useOnlineGameStore.getState()._handleMessage(msg);

      const state = useOnlineGameStore.getState();
      expect(state.disconnectedAlert).toBeNull();
      expect(state.gamePaused).toBe(false);
    });
  });

  // ── replaceWithBot action ─────────────────────────────────────────────────
  describe("replaceWithBot action", () => {
    it("sends ReplaceWithBot message when caller is host", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        hostId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().replaceWithBot("E");

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "ReplaceWithBot", seat: "E" });
    });

    it("is no-op when caller is not host", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        hostId: "p2", // different player is host
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().replaceWithBot("E");

      expect(sent).toHaveLength(0);
    });

    it("is no-op when _socket is null", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        hostId: "p1",
        _socket: null,
      });

      expect(() => {
        useOnlineGameStore.getState().replaceWithBot("E");
      }).not.toThrow();

      // No socket, nothing sent (can't assert sent here since no mock socket)
      // Just verify it didn't crash
      const state = useOnlineGameStore.getState();
      expect(state._socket).toBeNull();
    });
  });

  // ── setBotDifficulty action ───────────────────────────────────────────────
  describe("setBotDifficulty action", () => {
    it("sends SetBotDifficulty message with seat and difficulty", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        hostId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().setBotDifficulty("E", 3 as BotDifficulty);

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "SetBotDifficulty", seat: "E", difficulty: 3 });
    });

    it("sends SetBotDifficulty with difficulty 5 (Expert)", () => {
      const { sent } = injectMockSocket();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        hostId: "p1",
        _socket: useOnlineGameStore.getState()._socket,
      });

      useOnlineGameStore.getState().setBotDifficulty("S", 5 as BotDifficulty);

      const messages = sent.map((s) => JSON.parse(s));
      expect(messages).toContainEqual({ type: "SetBotDifficulty", seat: "S", difficulty: 5 });
    });

    it("is no-op when _socket is null", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        hostId: "p1",
        _socket: null,
      });

      expect(() => {
        useOnlineGameStore.getState().setBotDifficulty("E", 3 as BotDifficulty);
      }).not.toThrow();

      const state = useOnlineGameStore.getState();
      expect(state._socket).toBeNull();
    });
  });

  // ── dismissDisconnectAlert action ─────────────────────────────────────────
  describe("dismissDisconnectAlert action", () => {
    it("clears disconnectedAlert and sets gamePaused:false", () => {
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        disconnectedAlert: { seat: "W", displayName: "Dave" },
        gamePaused: true,
      });

      useOnlineGameStore.getState().dismissDisconnectAlert();

      const state = useOnlineGameStore.getState();
      expect(state.disconnectedAlert).toBeNull();
      expect(state.gamePaused).toBe(false);
    });
  });

  // ── _updateOverlayAfterBatch — gamePaused short-circuit ───────────────────
  describe("_updateOverlayAfterBatch — gamePaused short-circuit", () => {
    it("sets overlay:'none' when gamePaused AND activePlayer is the disconnected seat", () => {
      const gameState = makeBiddingState("E"); // E is active player

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
        gamePaused: true,
        disconnectedAlert: { seat: "E", displayName: "Bob" }, // E disconnected
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("none");
      expect(state.biddingThinkingSeat).toBeNull();
    });

    it("does NOT short-circuit when gamePaused but activePlayer is NOT the disconnected seat", () => {
      const gameState = makeBiddingState("N"); // N is active player, mySeat=N

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
        gamePaused: true,
        disconnectedAlert: { seat: "E", displayName: "Bob" }, // E disconnected, but N is active
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      // N is active and human's turn → overlay should be "bidding", not short-circuited to "none"
      const state = useOnlineGameStore.getState();
      expect(state.overlay).toBe("bidding");
    });

    it("still shows hand-result overlay even when gamePaused (pendingHandScore takes priority)", () => {
      const gameState = makeBiddingState("E");

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
        gamePaused: true,
        disconnectedAlert: { seat: "E", displayName: "Bob" },
        pendingHandScore: {
          hand: 1, bidder: "N", bidAmount: 100, nestCards: [], discarded: [],
          nsPointCards: 120, ewPointCards: 0, nsMostCardsBonus: 0, ewMostCardsBonus: 0,
          nsNestBonus: 0, ewNestBonus: 0, nsWonLastTrick: true, ewWonLastTrick: false,
          nsTotal: 120, ewTotal: 0, nsDelta: 100, ewDelta: 0, shotMoon: false, moonShooterWentSet: false,
        },
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      expect(useOnlineGameStore.getState().overlay).toBe("hand-result");
    });

    it("still shows game-over overlay even when gamePaused (finished phase takes priority)", () => {
      const gameState = { ...makeBiddingState("E"), phase: "finished" as const };

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState,
        gamePaused: true,
        disconnectedAlert: { seat: "E", displayName: "Bob" },
      });

      useOnlineGameStore.getState()._updateOverlayAfterBatch();

      expect(useOnlineGameStore.getState().overlay).toBe("game-over");
    });
  });

  // ── connect() preserves gameState during reconnect ────────────────────────
  describe("connect() preserves gameState during reconnect", () => {
    // localStorage/sessionStorage stubs for the connect() call
    const localStorageStore: Record<string, string> = {};
    const sessionStorageStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { localStorageStore[key] = value; },
      removeItem: (key: string) => { delete localStorageStore[key]; },
    };
    const mockSessionStorage = {
      getItem: (key: string) => sessionStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { sessionStorageStore[key] = value; },
      removeItem: (key: string) => { delete sessionStorageStore[key]; },
    };

    beforeEach(() => {
      vi.stubGlobal("localStorage", mockLocalStorage);
      vi.stubGlobal("sessionStorage", mockSessionStorage);
      // Pre-seed a playerId so connect() reuses it
      sessionStorageStore["rookPlayerId"] = "p1";
      localStorageStore["rookDisplayName"] = "Alice";
      // Stub WebSocket so connect() doesn't blow up
      vi.stubGlobal("WebSocket", class {
        readyState = WebSocket.CONNECTING;
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        send() {}
      });
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      // Reset storage
      for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
    });

    it("keeps existing gameState when connect() called with a game in progress", () => {
      // Arrange: store is already in a playing state (mid-game reconnect scenario)
      const existingGameState = makeBiddingState("N");
      const existingSeats = makeSeats("p1", "N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        mySeat: "N",
        roomCode: "ROOM1",
        seats: existingSeats,
        gameState: existingGameState,
        connectionError: "Disconnected from server.",
      });

      // Act: reconnect
      useOnlineGameStore.getState().connect("ROOM1");

      // Assert: gameState preserved
      const state = useOnlineGameStore.getState();
      expect(state.gameState).not.toBeNull();
      expect(state.gameState).toEqual(existingGameState);

      // Assert: lobbyPhase is "connecting" (reset to connecting for the new socket)
      expect(state.lobbyPhase).toBe("connecting");

      // Assert: connectionError cleared
      expect(state.connectionError).toBeNull();
    });

    it("resets gameState to null when connect() called without a prior game (fresh join)", () => {
      // Arrange: store is in idle/connecting state with no game yet
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "idle",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        gameState: null,
      });

      // Act: fresh connect
      useOnlineGameStore.getState().connect("ROOM2");

      // Assert: gameState stays null (no game to preserve)
      const state = useOnlineGameStore.getState();
      expect(state.gameState).toBeNull();
      expect(state.lobbyPhase).toBe("connecting");
    });

    it("preserves mySeat during reconnect", () => {
      // Arrange
      const existingGameState = makeBiddingState("N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "S",
        roomCode: "ROOM3",
        gameState: existingGameState,
      });

      // Act
      useOnlineGameStore.getState().connect("ROOM3");

      // Assert: mySeat preserved
      expect(useOnlineGameStore.getState().mySeat).toBe("S");
    });

    it("preserves seats during reconnect", () => {
      // Arrange
      const existingGameState = makeBiddingState("N");
      const existingSeats = makeSeats("p1", "N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        roomCode: "ROOM4",
        seats: existingSeats,
        gameState: existingGameState,
      });

      // Act
      useOnlineGameStore.getState().connect("ROOM4");

      // Assert: seats preserved (stale until Welcome arrives, but not cleared)
      expect(useOnlineGameStore.getState().seats).toEqual(existingSeats);
    });
  });

  // ── PlayerReconnected overlay resume ──────────────────────────────────────
  describe("PlayerReconnected handling — overlay resumes", () => {
    it("calls _updateOverlayAfterBatch after PlayerReconnected — overlay resumes for active player", () => {
      // Arrange: store in "playing" phase, gamePaused:true, E was disconnected
      // mySeat=N, activePlayer=N (human's turn in bidding) — but paused because E disconnected
      // (E is NOT the active player, so the gamePaused short-circuit doesn't fire for N)
      const biddingGameState = makeBiddingState("N"); // N is the active player

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        gameState: biddingGameState,
        gamePaused: true,
        disconnectedAlert: { seat: "E", displayName: "Bob" },
        overlay: "none", // paused, so overlay was suppressed
      });

      // Act: E reconnects
      const reconnectedMsg: import("../onlineGameStore.types").PlayerReconnectedMsg = {
        type: "PlayerReconnected",
        seat: "E",
        displayName: "Bob",
      };
      useOnlineGameStore.getState()._handleMessage(reconnectedMsg);

      // Assert: gamePaused cleared, disconnectedAlert cleared
      const state = useOnlineGameStore.getState();
      expect(state.gamePaused).toBe(false);
      expect(state.disconnectedAlert).toBeNull();

      // Assert: _updateOverlayAfterBatch fired — N is active in bidding → overlay = "bidding"
      // (i.e., overlay is NOT "none" — the game resumed normal overlay logic)
      expect(state.overlay).not.toBe("none");
      expect(state.overlay).toBe("bidding");
    });
  });

  // ── Stale socket onclose guard ────────────────────────────────────────────
  describe("stale socket onclose guard", () => {
    const localStorageStore: Record<string, string> = {};
    const sessionStorageStore: Record<string, string> = {};

    beforeEach(() => {
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
      });
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { sessionStorageStore[k] = v; },
        removeItem: (k: string) => { delete sessionStorageStore[k]; },
      });
      sessionStorageStore["rookPlayerId"] = "p1";
      localStorageStore["rookDisplayName"] = "Alice";
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
    });

    it("does not set connectionError when a replaced (stale) socket fires onclose", () => {
      // Simulate two rapid connect() calls — the second replaces the first.
      // The first socket's onclose should be ignored since it's no longer current.
      const sockets: Array<{ onclose: (() => void) | null; close: () => void }> = [];
      vi.stubGlobal("WebSocket", class {
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        constructor() { sockets.push(this); }
      });

      // First connect
      useOnlineGameStore.getState().connect("ROOM1");
      expect(sockets).toHaveLength(1);
      const firstSocket = sockets[0];

      // Second connect (replaces first)
      useOnlineGameStore.getState().connect("ROOM1");
      expect(sockets).toHaveLength(2);

      // First socket's onclose fires (stale)
      firstSocket.onclose?.();

      // Should NOT set a connectionError — the stale close is ignored
      expect(useOnlineGameStore.getState().connectionError).toBeNull();
      expect(useOnlineGameStore.getState().lobbyPhase).toBe("connecting");
    });
  });

  // ── RCA-2: Welcome playing with no state prevents redirect loop ──────────
  describe("Welcome handler — redirect loop prevention (RCA-2)", () => {
    it("Welcome playing with no state and no client gameState sets lobbyPhase to lobby (prevents redirect loop)", () => {
      // Arrange: client has NO existing gameState (fresh join, not a mid-game reconnect)
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        gameState: null, // no client game state
      });

      // Act: server sends Welcome with phase "playing" but NO state attached
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        // no state field
      };
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert: lobbyPhase should be "lobby" (not "playing") to prevent redirect loop
      const state = useOnlineGameStore.getState();
      expect(state.lobbyPhase).toBe("lobby");
    });

    it("Welcome playing with state sets gameState and lobbyPhase to playing (normal reconnect path works)", () => {
      // Arrange: client is reconnecting mid-game
      const freshGameState = makeBiddingState("E");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        myDisplayName: "Alice",
        gameState: null,
      });

      // Act: server sends Welcome with phase "playing" AND a state
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        state: freshGameState,
      };
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert: gameState set, lobbyPhase = "playing"
      const state = useOnlineGameStore.getState();
      expect(state.gameState).toEqual(freshGameState);
      expect(state.lobbyPhase).toBe("playing");
    });
  });

  // ── Reconnect race condition: isReconnecting flag ─────────────────────────
  describe("isReconnecting flag — mid-game reconnect race condition", () => {
    const localStorageStore: Record<string, string> = {};
    const sessionStorageStore: Record<string, string> = {};

    beforeEach(() => {
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
      });
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { sessionStorageStore[k] = v; },
        removeItem: (k: string) => { delete sessionStorageStore[k]; },
      });
      sessionStorageStore["rookPlayerId"] = "p1";
      localStorageStore["rookDisplayName"] = "Alice";
      vi.stubGlobal("WebSocket", class {
        readyState = WebSocket.CONNECTING;
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        send() {}
      });
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
    });

    it("initial state has isReconnecting: false", () => {
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(false);
    });

    it("connect() sets isReconnecting: true when gameState exists (mid-game reconnect)", () => {
      // Arrange: store has an active game
      const existingGameState = makeBiddingState("N");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        myPlayerId: "p1",
        mySeat: "N",
        roomCode: "ROOM1",
        seats: makeSeats("p1", "N"),
        gameState: existingGameState,
        connectionError: "Disconnected from server.",
      });

      // Act: reconnect
      useOnlineGameStore.getState().connect("ROOM1");

      // Assert: isReconnecting is true to prevent premature redirect
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(true);
      // gameState still preserved
      expect(state.gameState).not.toBeNull();
      expect(state.gameState).toEqual(existingGameState);
    });

    it("connect() does not set isReconnecting when no gameState (fresh join)", () => {
      // Arrange: fresh store with no game
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "idle",
        myPlayerId: "p1",
        gameState: null,
      });

      // Act: fresh connect
      useOnlineGameStore.getState().connect("ROOM2");

      // Assert: isReconnecting should stay false on fresh connect
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.gameState).toBeNull();
    });

    it("Welcome clears isReconnecting regardless of payload", () => {
      // Arrange: set up a reconnecting state
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        isReconnecting: true,
        gameState: makeBiddingState("N"),
      });

      // Act: Welcome arrives (lobby phase, no state)
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "lobby",
      };
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert: isReconnecting cleared
      expect(useOnlineGameStore.getState().isReconnecting).toBe(false);
    });

    it("Welcome with state and isReconnecting: true correctly updates game and clears flag", () => {
      // Arrange: set up a reconnecting state mid-game
      const existingGameState = makeBiddingState("N");
      const freshGameState = makeBiddingState("E"); // different state from server
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        mySeat: "N",
        isReconnecting: true,
        gameState: existingGameState,
        seats: makeSeats("p1", "N"),
      });

      // Act: Welcome arrives with full game state (reconnect path)
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        state: freshGameState,
      };
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert: gameState updated to server's fresh state, isReconnecting cleared
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.gameState).toEqual(freshGameState);
      expect(state.lobbyPhase).toBe("playing");
    });

    it("Welcome with phase='playing' but no state still clears isReconnecting", () => {
      // Arrange
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        isReconnecting: true,
        gameState: makeBiddingState("N"),
      });

      // Act: Welcome with playing phase but no state object
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        // no state field
      };
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert
      expect(useOnlineGameStore.getState().isReconnecting).toBe(false);
    });
  });

  // ── Fix 1: stale-socket guard in ws.onmessage ────────────────────────────
  describe("Fix 1: stale socket onmessage guard", () => {
    const localStorageStore: Record<string, string> = {};
    const sessionStorageStore: Record<string, string> = {};

    beforeEach(() => {
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
      });
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { sessionStorageStore[k] = v; },
        removeItem: (k: string) => { delete sessionStorageStore[k]; },
      });
      sessionStorageStore["rookPlayerId"] = "p1";
      localStorageStore["rookDisplayName"] = "Alice";
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
    });

    it("stale socket onmessage does NOT update store state when a new socket has replaced it", () => {
      // Capture sockets so we can manually invoke onmessage
      const capturedSockets: Array<{
        onmessage: ((e: MessageEvent) => void) | null;
        close: () => void;
      }> = [];

      vi.stubGlobal("WebSocket", class {
        readyState = 1; // OPEN
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        send() {}
        constructor() { capturedSockets.push(this); }
      });

      // First connect
      useOnlineGameStore.getState().connect("ROOM1");
      const firstSocket = capturedSockets[0];
      expect(firstSocket).toBeDefined();

      // Second connect (replaces first socket)
      useOnlineGameStore.getState().connect("ROOM1");
      expect(capturedSockets).toHaveLength(2);

      // Store is now in connecting phase for the second socket
      expect(useOnlineGameStore.getState().lobbyPhase).toBe("connecting");

      // Manually fire onmessage on the STALE (first) socket — should be a no-op
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "lobby",
      };

      // The first socket's onmessage handler should NOT update the store
      firstSocket.onmessage?.({ data: JSON.stringify(welcomeMsg) } as unknown as MessageEvent);

      // Store lobbyPhase must NOT have changed to "lobby" — the stale message was dropped
      expect(useOnlineGameStore.getState().lobbyPhase).toBe("connecting");
    });
  });

  // ── Fix 2: Welcome handler atomic set() ──────────────────────────────────
  describe("Fix 2: Welcome with state produces atomic update (no intermediate render gap)", () => {
    const sessionStorageStore: Record<string, string> = {};

    beforeEach(() => {
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => sessionStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { sessionStorageStore[k] = v; },
        removeItem: (k: string) => { delete sessionStorageStore[k]; },
      });
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
    });

    it("after Welcome with state: isReconnecting===false AND gameState is non-null simultaneously (atomic)", () => {
      // Arrange: store in reconnecting state
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        isReconnecting: true,
        gameState: null,
      });

      const serverGameState = makeBiddingState("E");

      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        state: serverGameState,
      };

      // Act
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert: in the final state, both conditions must hold together
      // (The test verifies atomicity by checking final state — if two set() calls
      // were used, there would be an intermediate state, but we verify the final
      // state has both correct values simultaneously)
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.gameState).not.toBeNull();
      expect(state.gameState).toEqual(serverGameState);
      expect(state.lobbyPhase).toBe("playing");
    });

    it("after Welcome with state: both isReconnecting and gameState are updated in one logical step", () => {
      // Additional atomicity check: subscribe to store changes and verify
      // there is never a state where isReconnecting===false but gameState===null
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
        isReconnecting: true,
        gameState: null,
      });

      const serverGameState = makeBiddingState("N");
      let sawBadIntermediateState = false;

      // Subscribe to store to detect any intermediate bad state
      const unsubscribe = useOnlineGameStore.subscribe((state) => {
        // If isReconnecting became false but gameState is still null — that's the bug
        // exclude idle — that's the store reset, not an intermediate bad state
        if (state.isReconnecting === false && state.gameState === null && state.lobbyPhase !== "idle") {
          sawBadIntermediateState = true;
        }
      });

      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "ROOM1",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        state: serverGameState,
      };

      useOnlineGameStore.getState()._handleMessage(welcomeMsg);
      unsubscribe();

      // The bad intermediate state must never have occurred
      expect(sawBadIntermediateState).toBe(false);

      // And final state is correct
      const state = useOnlineGameStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.gameState).not.toBeNull();
    });
  });

  // ── Mid-game refresh: sessionStorage flag ────────────────────────────────
  describe("mid-game refresh — sessionStorage flag", () => {
    // Use a shared storage mock for the whole describe block
    const sessionStorageStore: Record<string, string> = {};
    const mockSessionStorage = {
      getItem: (key: string) => sessionStorageStore[key] ?? null,
      setItem: (key: string, value: string) => { sessionStorageStore[key] = value; },
      removeItem: (key: string) => { delete sessionStorageStore[key]; },
    };

    beforeEach(() => {
      vi.stubGlobal("sessionStorage", mockSessionStorage);
      // Clear the storage before every test to avoid pollution
      for (const k of Object.keys(sessionStorageStore)) delete sessionStorageStore[k];
      resetStore();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // T1 — sessionStorage written on GameStarted
    it("T1: writes rookMidGameRoom to sessionStorage when GameStarted event is applied", () => {
      // Arrange: store in lobby phase with a roomCode, about to receive GameStarted
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "lobby",
        myPlayerId: "p1",
        mySeat: "N",
        roomCode: "XKCD12",
        seats: makeSeats("p1", "N"),
      });

      const gameStartedEvent: GameEvent = {
        type: "GameStarted",
        seed: 42,
        dealer: "W",
        players: [
          { seat: "N", name: "Alice", kind: "human" },
          { seat: "E", name: "Bot E", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "S", name: "Bot S", kind: "bot", botProfile: BOT_PRESETS[3] },
          { seat: "W", name: "Bot W", kind: "bot", botProfile: BOT_PRESETS[3] },
        ],
        rules: DEFAULT_RULES,
        timestamp: Date.now(),
      };

      // Act
      useOnlineGameStore.getState()._applyIncomingEvents([gameStartedEvent]);

      // Assert
      expect(sessionStorage.getItem("rookMidGameRoom")).toBe("XKCD12");
    });

    // T2 — sessionStorage written on Welcome with state
    it("T2: writes rookMidGameRoom to sessionStorage on Welcome with state", () => {
      // Arrange: store connecting
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
      });

      const gameState = makeBiddingState("N");
      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "XKCD12",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "playing",
        state: gameState,
      };

      // Act
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert
      expect(sessionStorage.getItem("rookMidGameRoom")).toBe("XKCD12");
    });

    // T3 — sessionStorage cleared on Welcome without state
    it("T3: clears rookMidGameRoom from sessionStorage on Welcome with no state", () => {
      // Arrange: pre-set sessionStorage
      sessionStorage.setItem("rookMidGameRoom", "XKCD12");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "connecting",
        myPlayerId: "p1",
      });

      const welcomeMsg: WelcomeMsg = {
        type: "Welcome",
        roomCode: "XKCD12",
        hostId: "p1",
        seats: makeSeats("p1", "N"),
        phase: "lobby",
        // no state
      };

      // Act
      useOnlineGameStore.getState()._handleMessage(welcomeMsg);

      // Assert
      expect(sessionStorage.getItem("rookMidGameRoom")).toBeNull();
    });

    // T4 — sessionStorage cleared on disconnect()
    it("T4: clears rookMidGameRoom from sessionStorage on disconnect()", () => {
      // Arrange
      sessionStorage.setItem("rookMidGameRoom", "XKCD12");
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        lobbyPhase: "playing",
        roomCode: "XKCD12",
        gameState: makeBiddingState("N"),
      });

      // Act
      useOnlineGameStore.getState().disconnect();

      // Assert
      expect(sessionStorage.getItem("rookMidGameRoom")).toBeNull();
    });

    // T5 — connect() sets isReconnecting: true from sessionStorage
    it("T5: connect() sets isReconnecting:true when sessionStorage code matches", () => {
      // Arrange
      const localStorageStore: Record<string, string> = {};
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
      });
      sessionStorageStore["rookPlayerId"] = "p1";
      sessionStorageStore["rookMidGameRoom"] = "XKCD12";
      localStorageStore["rookDisplayName"] = "Alice";

      vi.stubGlobal("WebSocket", class {
        readyState = WebSocket.CONNECTING;
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        send() {}
      });

      resetStore();

      // Store has no gameState (fresh tab after refresh)
      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        gameState: null,
      });

      // Act
      useOnlineGameStore.getState().connect("XKCD12");

      // Assert
      expect(useOnlineGameStore.getState().isReconnecting).toBe(true);
    });

    // T6 — connect() does NOT set isReconnecting when sessionStorage code mismatches
    it("T6: connect() does NOT set isReconnecting when sessionStorage code mismatches", () => {
      // Arrange
      const localStorageStore: Record<string, string> = {};
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
      });
      sessionStorageStore["rookPlayerId"] = "p1";
      sessionStorageStore["rookMidGameRoom"] = "OTHER1"; // different room code
      localStorageStore["rookDisplayName"] = "Alice";

      vi.stubGlobal("WebSocket", class {
        readyState = WebSocket.CONNECTING;
        onopen: (() => void) | null = null;
        onmessage: ((e: MessageEvent) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {}
        send() {}
      });

      resetStore();

      useOnlineGameStore.setState({
        ...INITIAL_ONLINE_STATE,
        gameState: null,
      });

      // Act
      useOnlineGameStore.getState().connect("XKCD12");

      // Assert: code mismatch → no isReconnecting
      expect(useOnlineGameStore.getState().isReconnecting).toBe(false);
    });
  });
});
