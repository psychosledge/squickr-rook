import { describe, it, expect } from "vitest";
import { INITIAL_STATE, applyEvent, reduceEvents } from "../reducer.js";
import { validateCommand, legalCommands } from "../validator.js";
import type { GameEvent } from "../events.js";
import type { GameState, Seat } from "../types.js";
import { DEFAULT_RULES, leftOf } from "../types.js";
import { deriveDeal } from "../deal.js";

// Helper to create a GameStarted event
function makeGameStarted(seed = 42, dealer: Seat = "N"): GameEvent {
  return {
    type: "GameStarted",
    seed,
    dealer,
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
      { seat: "S", name: "BotS",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
      { seat: "W", name: "BotW",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
    ],
    rules: {
      version: 1,
      winThreshold: 500,
      bustThreshold: -500,
      autoBidAmount: 100,
      botDelayMs: 500,
      nestAssignment: "left-of-dealer",
    },
    timestamp: 1000,
  };
}

describe("INITIAL_STATE", () => {
  it("has correct shape", () => {
    expect(INITIAL_STATE.phase).toBe("dealing");
    expect(INITIAL_STATE.players).toEqual([]);
    expect(INITIAL_STATE.handNumber).toBe(0);
    expect(INITIAL_STATE.dealer).toBe("N");
    expect(INITIAL_STATE.seed).toBe(0);
    expect(INITIAL_STATE.activePlayer).toBeNull();
    expect(INITIAL_STATE.hands).toEqual({ N: [], E: [], S: [], W: [] });
    expect(INITIAL_STATE.nest).toEqual([]);
    expect(INITIAL_STATE.trump).toBeNull();
    expect(INITIAL_STATE.scores).toEqual({ NS: 0, EW: 0 });
    expect(INITIAL_STATE.winner).toBeNull();
  });
});

describe("reduceEvents", () => {
  it("returns INITIAL_STATE for empty events", () => {
    const state = reduceEvents([]);
    expect(state).toEqual(INITIAL_STATE);
  });
});

describe("applyEvent - GameStarted", () => {
  it("sets phase to nest after GameStarted", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.phase).toBe("nest");
  });

  it("sets players correctly", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.players).toHaveLength(4);
    expect(state.players[0]!.seat).toBe("N");
  });

  it("deals hands — each player has 10 cards", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.hands.N).toHaveLength(10);
    expect(state.hands.E).toHaveLength(10);
    expect(state.hands.S).toHaveLength(10);
    expect(state.hands.W).toHaveLength(10);
  });

  it("nest has 5 cards", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.nest).toHaveLength(5);
  });

  it("activePlayer is leftOf(dealer)", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    expect(state.activePlayer).toBe(leftOf("N")); // "E"
  });

  it("scores start at 0", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.scores).toEqual({ NS: 0, EW: 0 });
  });
});

describe("applyEvent - NestTaken", () => {
  it("nest player has 15 cards after NestTaken", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    const nestPlayer = leftOf(state.dealer); // "E"
    const nestCards = [...state.nest];

    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });

    expect(state.hands[nestPlayer]).toHaveLength(15);
    expect(state.nest).toHaveLength(0);
  });

  it("nest is empty after NestTaken", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    const nestPlayer = leftOf(state.dealer);
    const nestCards = [...state.nest];

    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });

    expect(state.nest).toEqual([]);
  });
});

describe("applyEvent - CardDiscarded", () => {
  function setupAfterNestTaken(seed = 42, dealer: Seat = "N"): GameState {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(seed, dealer));
    const nestPlayer = leftOf(state.dealer);
    const nestCards = [...state.nest];
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });
    return state;
  }

  it("after 5 CardDiscarded, phase becomes trump", () => {
    let state = setupAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const hand = [...state.hands[nestPlayer]!];

    // Discard 5 non-ROOK cards
    let discarded = 0;
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      state = applyEvent(state, {
        type: "CardDiscarded",
        seat: nestPlayer,
        cardId,
        handNumber: 0,
        timestamp: 3000,
      });
      discarded++;
      if (discarded === 5) break;
    }

    expect(state.phase).toBe("trump");
    expect(state.discarded).toHaveLength(5);
  });

  it("phase stays nest after only 4 discards", () => {
    let state = setupAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const hand = [...state.hands[nestPlayer]!];

    let discarded = 0;
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      state = applyEvent(state, {
        type: "CardDiscarded",
        seat: nestPlayer,
        cardId,
        handNumber: 0,
        timestamp: 3000,
      });
      discarded++;
      if (discarded === 4) break;
    }

    expect(state.phase).toBe("nest");
  });
});

describe("applyEvent - TrumpSelected", () => {
  function setupBeforeTrump(): GameState {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    const nestPlayer = leftOf(state.dealer);
    const nestCards = [...state.nest];
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });
    const hand = [...state.hands[nestPlayer]!];
    let count = 0;
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      state = applyEvent(state, {
        type: "CardDiscarded",
        seat: nestPlayer,
        cardId,
        handNumber: 0,
        timestamp: 3000,
      });
      count++;
      if (count === 5) break;
    }
    return state;
  }

  it("phase becomes playing after TrumpSelected", () => {
    let state = setupBeforeTrump();
    const nestPlayer = leftOf(state.dealer);
    state = applyEvent(state, {
      type: "TrumpSelected",
      seat: nestPlayer,
      color: "Black",
      handNumber: 0,
      timestamp: 4000,
    });
    expect(state.phase).toBe("playing");
    expect(state.trump).toBe("Black");
  });

  it("activePlayer is leftOf(dealer) after TrumpSelected", () => {
    let state = setupBeforeTrump();
    const nestPlayer = leftOf(state.dealer);
    state = applyEvent(state, {
      type: "TrumpSelected",
      seat: nestPlayer,
      color: "Red",
      handNumber: 0,
      timestamp: 4000,
    });
    expect(state.activePlayer).toBe(leftOf(state.dealer));
  });
});

describe("applyEvent - CardPlayed and TrickCompleted", () => {
  function buildFullTrick(): { events: GameEvent[]; startState: GameState } {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    const nestPlayer = leftOf(state.dealer); // E
    const nestCards = [...state.nest];
    const events: GameEvent[] = [makeGameStarted(42, "N")];

    const nestTaken: GameEvent = {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    };
    events.push(nestTaken);
    state = applyEvent(state, nestTaken);

    const hand = [...state.hands[nestPlayer]!];
    let count = 0;
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      const ev: GameEvent = {
        type: "CardDiscarded",
        seat: nestPlayer,
        cardId,
        handNumber: 0,
        timestamp: 3000,
      };
      events.push(ev);
      state = applyEvent(state, ev);
      count++;
      if (count === 5) break;
    }

    const trumpEv: GameEvent = {
      type: "TrumpSelected",
      seat: nestPlayer,
      color: "Black",
      handNumber: 0,
      timestamp: 4000,
    };
    events.push(trumpEv);
    state = applyEvent(state, trumpEv);

    return { events, startState: state };
  }

  it("after TrickCompleted, currentTrick is cleared and capturedCards updated", () => {
    const { startState } = buildFullTrick();
    let state = startState;
    const seats: Seat[] = ["E", "S", "W", "N"]; // leftOf N = E leads

    const trick: Array<{ seat: Seat; cardId: string }> = [];
    for (const seat of seats) {
      const cardId = state.hands[seat]![0]!;
      trick.push({ seat, cardId });
      const ev: GameEvent = {
        type: "CardPlayed",
        seat,
        cardId,
        trickIndex: 0,
        handNumber: 0,
        timestamp: 5000,
      };
      state = applyEvent(state, ev);
    }

    // Now apply TrickCompleted
    const ev: GameEvent = {
      type: "TrickCompleted",
      plays: trick,
      winner: "E",
      leadColor: null, // determine from plays
      trickIndex: 0,
      handNumber: 0,
      timestamp: 5000,
    };
    state = applyEvent(state, ev);

    expect(state.currentTrick).toHaveLength(0);
    const totalCaptured = state.capturedCards.NS.length + state.capturedCards.EW.length;
    expect(totalCaptured).toBe(4);
  });
});

describe("applyEvent - HandScored", () => {
  it("updates scores and handHistory", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted());

    const score = {
      hand: 0,
      bidder: "E" as Seat,
      bidAmount: 100,
      nestCards: [],
      discarded: [],
      nsPointCards: 80,
      ewPointCards: 100,
      nsMostCardsBonus: 0,
      ewMostCardsBonus: 20,
      nsNestBonus: 0,
      ewNestBonus: 0,
      nsWonLastTrick: false,
      ewWonLastTrick: true,
      nsTotal: 80,
      ewTotal: 120,
      nsDelta: 80,
      ewDelta: 120,
    };

    state = applyEvent(state, {
      type: "HandScored",
      score,
      handNumber: 0,
      timestamp: 9000,
    });

    expect(state.scores.NS).toBe(80);
    expect(state.scores.EW).toBe(120);
    expect(state.handHistory).toHaveLength(1);
    expect(state.handHistory[0]).toEqual(score);
  });
});

describe("reduceEvents - replay", () => {
  it("step-by-step and reduceEvents produce identical state", () => {
    const events: GameEvent[] = [makeGameStarted(99, "S")];

    let stepState = INITIAL_STATE;
    for (const ev of events) {
      stepState = applyEvent(stepState, ev);
    }

    const replayState = reduceEvents(events);
    expect(replayState).toEqual(stepState);
  });
});

describe("Full hand integration — 10 tricks, scoring, next hand", () => {
  it("plays a complete hand via validateCommand and produces correct HandScored event", () => {
    // 1. Create game with GameStarted
    const gameStartedEvent: GameEvent = {
      type: "GameStarted",
      seed: 42,
      dealer: "N",
      players: [
        { seat: "N", name: "Alice", kind: "human" },
        { seat: "E", name: "BotE",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
        { seat: "S", name: "BotS",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
        { seat: "W", name: "BotW",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
      ],
      rules: DEFAULT_RULES,
      timestamp: 1000,
    };
    let state = applyEvent(INITIAL_STATE, gameStartedEvent);

    // 2. TakeNest
    const nestPlayer = leftOf(state.dealer); // "E"
    const takeNestResult = validateCommand(state, { type: "TakeNest", seat: nestPlayer }, DEFAULT_RULES);
    expect(takeNestResult.ok).toBe(true);
    if (!takeNestResult.ok) throw new Error(takeNestResult.error);
    for (const ev of takeNestResult.events) {
      state = applyEvent(state, ev);
    }
    expect(state.originalNest).toHaveLength(5);
    const savedNest = [...state.originalNest];

    // 3. Discard 5 cards
    let discardCount = 0;
    while (discardCount < 5) {
      const cmds = legalCommands(state, nestPlayer);
      const discardCmd = cmds.find(c => c.type === "DiscardCard");
      expect(discardCmd).toBeDefined();
      const result = validateCommand(state, discardCmd!, DEFAULT_RULES);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      for (const ev of result.events) {
        state = applyEvent(state, ev);
      }
      discardCount++;
    }
    expect(state.phase).toBe("trump");

    // 4. Select trump
    const trumpCmds = legalCommands(state, nestPlayer);
    const trumpCmd = trumpCmds.find(c => c.type === "SelectTrump");
    expect(trumpCmd).toBeDefined();
    const trumpResult = validateCommand(state, trumpCmd!, DEFAULT_RULES);
    expect(trumpResult.ok).toBe(true);
    if (!trumpResult.ok) throw new Error(trumpResult.error);
    for (const ev of trumpResult.events) {
      state = applyEvent(state, ev);
    }
    expect(state.phase).toBe("playing");

    // 5. Play all 10 tricks using legalCommands to pick first legal card
    const allGeneratedEvents: GameEvent[] = [];
    let tricksCompleted = 0;
    while (state.phase === "playing") {
      const activePlayer = state.activePlayer!;
      const cmds = legalCommands(state, activePlayer);
      expect(cmds.length).toBeGreaterThan(0);
      const playCmd = cmds[0]!;
      const result = validateCommand(state, playCmd, DEFAULT_RULES);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      for (const ev of result.events) {
        allGeneratedEvents.push(ev);
        state = applyEvent(state, ev);
        if (ev.type === "TrickCompleted") tricksCompleted++;
      }
      // Safety: prevent infinite loop
      if (tricksCompleted > 10) throw new Error("Too many tricks");
    }
    expect(tricksCompleted).toBe(10);

    // 6. Find HandScored event
    const handScoredEvent = allGeneratedEvents.find(ev => ev.type === "HandScored");
    expect(handScoredEvent).toBeDefined();
    expect(handScoredEvent!.type).toBe("HandScored");

    const handScore = (handScoredEvent as Extract<GameEvent, { type: "HandScored" }>).score;

    // 7. Assert nestCards has length > 0 (HIGH-1 fix)
    expect(handScore.nestCards).toHaveLength(savedNest.length);
    expect(handScore.nestCards.length).toBeGreaterThan(0);

    // 8. Assert hand === 0
    expect(handScore.hand).toBe(0);

    // 9. Assert nsTotal + ewTotal is in a reasonable range
    const combinedTotal = handScore.nsTotal + handScore.ewTotal;
    expect(combinedTotal).toBeGreaterThanOrEqual(160);
    expect(combinedTotal).toBeLessThanOrEqual(200);
  });
});
