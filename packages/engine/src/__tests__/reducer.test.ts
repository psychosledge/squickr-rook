import { describe, it, expect } from "vitest";
import { INITIAL_STATE, applyEvent, reduceEvents } from "../reducer.js";
import { validateCommand, legalCommands } from "../validator.js";
import type { GameEvent } from "../events.js";
import type { GameState, Seat } from "../types.js";
import { DEFAULT_RULES, leftOf } from "../types.js";


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
      minimumBid: 100,
      bidIncrement: 5,
      maximumBid: 200,
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
  it("sets phase to bidding after GameStarted", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.phase).toBe("bidding");
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
    // Advance through bidding to nest phase
    state = { ...state, phase: "nest", activePlayer: leftOf(state.dealer), bidder: leftOf(state.dealer) };
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
    state = { ...state, phase: "nest", activePlayer: leftOf(state.dealer), bidder: leftOf(state.dealer) };
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
    state = { ...state, phase: "nest", activePlayer: leftOf(state.dealer), bidder: leftOf(state.dealer) };
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
    state = { ...state, phase: "nest", activePlayer: leftOf(state.dealer), bidder: leftOf(state.dealer) };
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

  it("activePlayer is leftOf(bidder) after TrumpSelected", () => {
    let state = setupBeforeTrump();
    // bidder is leftOf(dealer) = E
    const nestPlayer = leftOf(state.dealer);
    state = applyEvent(state, {
      type: "TrumpSelected",
      seat: nestPlayer,
      color: "Red",
      handNumber: 0,
      timestamp: 4000,
    });
    // bidder should be E (leftOf(N)), so first player = leftOf(E) = S
    expect(state.activePlayer).toBe(leftOf(state.bidder!));
  });
});

describe("applyEvent - CardPlayed and TrickCompleted", () => {
  function buildFullTrick(): { events: GameEvent[]; startState: GameState } {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    state = { ...state, phase: "nest", activePlayer: leftOf(state.dealer), bidder: leftOf(state.dealer) };
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
    // leftOf(bidder=E) = S leads first
    const seats: Seat[] = ["S", "W", "N", "E"];

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
      shotMoon: false,
      moonShooterWentSet: false,
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

// ── Bidding phase reducer tests ───────────────────────────────────────────────

describe("applyEvent - bidding phase (HandStarted and GameStarted)", () => {
  it("HandStarted → phase = 'bidding', activePlayer = leftOf(dealer)", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    // Simulate going through some hands, then HandStarted
    state = applyEvent(state, {
      type: "HandStarted",
      handNumber: 1,
      dealer: "E",
      timestamp: 10000,
    });
    expect(state.phase).toBe("bidding");
    expect(state.activePlayer).toBe(leftOf("E")); // "S"
  });

  it("HandStarted → bids all null, moonShooters = [], currentBid = 0, bidder = null, bidAmount = 0, shotMoon = false", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    state = applyEvent(state, {
      type: "HandStarted",
      handNumber: 1,
      dealer: "E",
      timestamp: 10000,
    });
    expect(state.bids).toEqual({ N: null, E: null, S: null, W: null });
    expect(state.moonShooters).toEqual([]);
    expect(state.currentBid).toBe(0);
    expect(state.bidder).toBeNull();
    expect(state.bidAmount).toBe(0);
    expect(state.shotMoon).toBe(false);
  });

  it("GameStarted → phase = 'bidding', bids all null, moonShooters = [], currentBid = 0", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    expect(state.phase).toBe("bidding");
    expect(state.bids).toEqual({ N: null, E: null, S: null, W: null });
    expect(state.moonShooters).toEqual([]);
    expect(state.currentBid).toBe(0);
    expect(state.bidder).toBeNull();
    expect(state.bidAmount).toBe(0);
    expect(state.shotMoon).toBe(false);
  });
});

describe("applyEvent - BidPlaced", () => {
  function biddingState(): GameState {
    return applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
  }

  it("BidPlaced → updates bids[seat], currentBid, advances activePlayer", () => {
    let state = biddingState();
    // activePlayer = E (leftOf(N))
    expect(state.activePlayer).toBe("E");
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "E",
      amount: 100,
      handNumber: 0,
      timestamp: 2000,
    });
    expect(state.bids["E"]).toBe(100);
    expect(state.currentBid).toBe(100);
    expect(state.activePlayer).toBe("S"); // next clockwise
  });

  it("BidPlaced multiple times same seat → each update applies", () => {
    let state = biddingState();
    // E bids 100
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "E",
      amount: 100,
      handNumber: 0,
      timestamp: 2000,
    });
    // After E: S is active. S bids 105. W bids 110. N bids 115. E comes back and re-bids 120.
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "S",
      amount: 105,
      handNumber: 0,
      timestamp: 2001,
    });
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "W",
      amount: 110,
      handNumber: 0,
      timestamp: 2002,
    });
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "N",
      amount: 115,
      handNumber: 0,
      timestamp: 2003,
    });
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "E",
      amount: 120,
      handNumber: 0,
      timestamp: 2004,
    });
    expect(state.bids["E"]).toBe(120);
    expect(state.currentBid).toBe(120);
  });
});

describe("applyEvent - BidPassed", () => {
  function biddingState(): GameState {
    return applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
  }

  it("BidPassed → bids[seat] = 'pass', advances activePlayer", () => {
    let state = biddingState();
    // activePlayer = E
    state = applyEvent(state, {
      type: "BidPassed",
      seat: "E",
      handNumber: 0,
      timestamp: 2000,
    });
    expect(state.bids["E"]).toBe("pass");
    expect(state.activePlayer).toBe("S");
  });

  it("BidPassed → advances activePlayer, skips already-passed seats", () => {
    let state = biddingState();
    // E passes, S passes — when W passes, next should skip E and S → goes to N
    state = applyEvent(state, {
      type: "BidPassed",
      seat: "E",
      handNumber: 0,
      timestamp: 2000,
    });
    state = applyEvent(state, {
      type: "BidPlaced",
      seat: "S",
      amount: 100,
      handNumber: 0,
      timestamp: 2001,
    });
    // After S bids, next is W (E already passed, so we skip E and go to W)
    // Actually getNextBidder skips "pass" seats
    // After S bids, next clockwise from S → W
    expect(state.activePlayer).toBe("W");
  });
});

describe("applyEvent - MoonDeclared", () => {
  function biddingState(): GameState {
    return applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
  }

  it("MoonDeclared → bids[seat] = 200, currentBid = 200, adds to moonShooters, advances activePlayer", () => {
    let state = biddingState();
    state = applyEvent(state, {
      type: "MoonDeclared",
      seat: "E",
      amount: 200,
      handNumber: 0,
      timestamp: 2000,
    });
    expect(state.bids["E"]).toBe(200);
    expect(state.currentBid).toBe(200);
    expect(state.moonShooters).toContain("E");
    expect(state.activePlayer).toBe("S");
  });

  it("MoonDeclared twice (double shoot) → moonShooters has both seats", () => {
    let state = biddingState();
    state = applyEvent(state, {
      type: "MoonDeclared",
      seat: "E",
      amount: 200,
      handNumber: 0,
      timestamp: 2000,
    });
    state = applyEvent(state, {
      type: "MoonDeclared",
      seat: "S",
      amount: 200,
      handNumber: 0,
      timestamp: 2001,
    });
    expect(state.moonShooters).toContain("E");
    expect(state.moonShooters).toContain("S");
    expect(state.moonShooters).toHaveLength(2);
  });
});

describe("applyEvent - BiddingComplete", () => {
  function biddingState(): GameState {
    return applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
  }

  it("BiddingComplete → phase = 'nest', bidder = winner, bidAmount = amount, shotMoon set", () => {
    let state = biddingState();
    state = applyEvent(state, {
      type: "BiddingComplete",
      winner: "E",
      amount: 100,
      forced: false,
      shotMoon: false,
      handNumber: 0,
      timestamp: 3000,
    });
    expect(state.phase).toBe("nest");
    expect(state.bidder).toBe("E");
    expect(state.bidAmount).toBe(100);
    expect(state.shotMoon).toBe(false);
    expect(state.activePlayer).toBe("E");
  });

  it("BiddingComplete forced → bidder = dealer, bidAmount = minimumBid", () => {
    let state = biddingState();
    // dealer = N
    state = applyEvent(state, {
      type: "BiddingComplete",
      winner: "N",
      amount: 100,
      forced: true,
      shotMoon: false,
      handNumber: 0,
      timestamp: 3000,
    });
    expect(state.phase).toBe("nest");
    expect(state.bidder).toBe("N");
    expect(state.bidAmount).toBe(100);
    expect(state.shotMoon).toBe(false);
  });

  it("BiddingComplete with shotMoon: true → state.shotMoon = true", () => {
    let state = biddingState();
    state = applyEvent(state, {
      type: "BiddingComplete",
      winner: "E",
      amount: 200,
      forced: false,
      shotMoon: true,
      handNumber: 0,
      timestamp: 3000,
    });
    expect(state.shotMoon).toBe(true);
    expect(state.bidder).toBe("E");
    expect(state.bidAmount).toBe(200);
  });
});

describe("applyEvent - TrumpSelected uses bidder (not leftOf(leftOf(dealer)))", () => {
  it("TrumpSelected → activePlayer = leftOf(bidder)", () => {
    // Set up a state where bidder != leftOf(dealer)
    // dealer = N, leftOf(N) = E, but bidder = S (different)
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    // Manually set bidder = S and go to trump phase
    state = {
      ...state,
      phase: "trump",
      bidder: "S",
      activePlayer: "S",
    };
    state = applyEvent(state, {
      type: "TrumpSelected",
      seat: "S",
      color: "Red",
      handNumber: 0,
      timestamp: 5000,
    });
    // activePlayer should be leftOf(bidder=S) = W
    expect(state.activePlayer).toBe(leftOf("S")); // W
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

    // 1b. Complete bidding: E is active, have E win the bid at 100, others pass
    const result1 = validateCommand(state, { type: "PlaceBid", seat: "E", amount: 100 }, DEFAULT_RULES);
    expect(result1.ok).toBe(true);
    if (!result1.ok) throw new Error(result1.error);
    for (const ev of result1.events) {
      state = applyEvent(state, ev);
    }
    // S passes
    const result2 = validateCommand(state, { type: "PassBid", seat: "S" }, DEFAULT_RULES);
    expect(result2.ok).toBe(true);
    if (!result2.ok) throw new Error(result2.error);
    for (const ev of result2.events) {
      state = applyEvent(state, ev);
    }
    // W passes
    const result3 = validateCommand(state, { type: "PassBid", seat: "W" }, DEFAULT_RULES);
    expect(result3.ok).toBe(true);
    if (!result3.ok) throw new Error(result3.error);
    for (const ev of result3.events) {
      state = applyEvent(state, ev);
    }
    // N passes → BiddingComplete, E wins
    const result4 = validateCommand(state, { type: "PassBid", seat: "N" }, DEFAULT_RULES);
    expect(result4.ok).toBe(true);
    if (!result4.ok) throw new Error(result4.error);
    for (const ev of result4.events) {
      state = applyEvent(state, ev);
    }

    expect(state.phase).toBe("nest");
    expect(state.bidder).toBe("E");

    // 2. TakeNest
    const nestPlayer = state.bidder!; // "E"
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
      const cmds = legalCommands(state, nestPlayer, DEFAULT_RULES);
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
    const trumpCmds = legalCommands(state, nestPlayer, DEFAULT_RULES);
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
      const cmds = legalCommands(state, activePlayer, DEFAULT_RULES);
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

// (duplicate describe blocks below are legacy — kept for coverage but updated to match bidding flow)

describe("applyEvent - GameStarted (legacy)", () => {
  it("sets phase to bidding after GameStarted", () => {
    const state = applyEvent(INITIAL_STATE, makeGameStarted());
    expect(state.phase).toBe("bidding");
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

describe("applyEvent - NestTaken (legacy)", () => {
  it("nest player has 15 cards after NestTaken", () => {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    // Manually advance past bidding for legacy tests
    state = { ...state, phase: "nest", bidder: leftOf(state.dealer) };
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
    state = { ...state, phase: "nest", bidder: leftOf(state.dealer) };
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

describe("applyEvent - CardDiscarded (legacy)", () => {
  function setupAfterNestTaken(seed = 42, dealer: Seat = "N"): GameState {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(seed, dealer));
    // Manually advance past bidding for legacy tests
    state = { ...state, phase: "nest", bidder: leftOf(state.dealer) };
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

describe("applyEvent - TrumpSelected (legacy)", () => {
  function setupBeforeTrump(): GameState {
    let state = applyEvent(INITIAL_STATE, makeGameStarted(42, "N"));
    // Manually advance past bidding for legacy tests
    state = { ...state, phase: "nest", bidder: leftOf(state.dealer) };
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

  it("activePlayer is leftOf(leftOf(dealer)) after TrumpSelected", () => {
    let state = setupBeforeTrump();
    // bidder = leftOf(dealer) = E, so leftOf(bidder) = S = leftOf(leftOf(dealer))
    const nestPlayer = leftOf(state.dealer);
    state = applyEvent(state, {
      type: "TrumpSelected",
      seat: nestPlayer,
      color: "Red",
      handNumber: 0,
      timestamp: 4000,
    });
    expect(state.activePlayer).toBe(leftOf(leftOf(state.dealer)));
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
    const seats: Seat[] = ["S", "W", "N", "E"]; // leftOf(leftOf(N)) = S leads

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
      shotMoon: false,
      moonShooterWentSet: false,
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

    // 1b. Complete bidding: E is active, have E win the bid at 100, others pass
    const bid1 = validateCommand(state, { type: "PlaceBid", seat: "E", amount: 100 }, DEFAULT_RULES);
    expect(bid1.ok).toBe(true);
    if (!bid1.ok) throw new Error(bid1.error);
    for (const ev of bid1.events) { state = applyEvent(state, ev); }
    const pass1 = validateCommand(state, { type: "PassBid", seat: state.activePlayer! }, DEFAULT_RULES);
    expect(pass1.ok).toBe(true);
    if (!pass1.ok) throw new Error(pass1.error);
    for (const ev of pass1.events) { state = applyEvent(state, ev); }
    const pass2 = validateCommand(state, { type: "PassBid", seat: state.activePlayer! }, DEFAULT_RULES);
    expect(pass2.ok).toBe(true);
    if (!pass2.ok) throw new Error(pass2.error);
    for (const ev of pass2.events) { state = applyEvent(state, ev); }
    const pass3 = validateCommand(state, { type: "PassBid", seat: state.activePlayer! }, DEFAULT_RULES);
    expect(pass3.ok).toBe(true);
    if (!pass3.ok) throw new Error(pass3.error);
    for (const ev of pass3.events) { state = applyEvent(state, ev); }
    expect(state.phase).toBe("nest");
    expect(state.bidder).toBe("E");

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
