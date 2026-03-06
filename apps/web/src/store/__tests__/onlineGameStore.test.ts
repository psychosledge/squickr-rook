import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useOnlineGameStore, INITIAL_ONLINE_STATE } from "../onlineGameStore";
import { INITIAL_STATE, DEFAULT_RULES, applyEvent } from "@rook/engine";
import type { GameEvent, GameState, Seat } from "@rook/engine";
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
      { seat: "E", name: "Bot E", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "S", name: "Bot S", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "W", name: "Bot W", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
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
          { seat: "E", name: "Bot E", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
          { seat: "S", name: "Bot S", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
          { seat: "W", name: "Bot W", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
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
          { seat: "E", name: "Bot E", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
          { seat: "S", name: "Bot S", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
          { seat: "W", name: "Bot W", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
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
});
