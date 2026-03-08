import { describe, it, expect } from "vitest";
import { maskState, filterEvent } from "../mask.js";
import { INITIAL_STATE } from "../reducer.js";
import type { GameState, Seat } from "../types.js";
import type { GameEvent } from "../events.js";
import { BOT_PRESETS } from "../types.js";

// ---------------------------------------------------------------------------
// Base state helper — spread INITIAL_STATE and override only what we need
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...INITIAL_STATE, ...overrides };
}

// ---------------------------------------------------------------------------
// maskState — own hand
// ---------------------------------------------------------------------------

describe("maskState — own hand", () => {
  it("TC-1: own hand passes through unchanged", () => {
    const state = makeState({
      hands: { N: ["B5", "R10", "G7"], E: [], S: [], W: [] },
    });
    const result = maskState(state, "N");
    expect(result.hands.N).toEqual(["B5", "R10", "G7"]);
  });

  it('TC-2: opponent hand replaced with "??" placeholders, length preserved', () => {
    const state = makeState({
      hands: { N: ["B5", "R10", "G7"], E: ["B1", "Y14", "G9"], S: [], W: [] },
    });
    const result = maskState(state, "N");
    expect(result.hands.E).toEqual(["??", "??", "??"]);
  });

  it("TC-3: all three opponent hands masked with correct lengths", () => {
    const nHand = Array(10).fill("B1") as string[];
    const eHand = Array(8).fill("B2") as string[];
    const sHand = Array(6).fill("B3") as string[];
    const wHand = Array(4).fill("B4") as string[];

    const state = makeState({
      hands: { N: nHand, E: eHand, S: sHand, W: wHand },
    });
    const result = maskState(state, "N");

    expect(result.hands.N).toEqual(nHand);
    expect(result.hands.E).toEqual(Array(8).fill("??"));
    expect(result.hands.S).toEqual(Array(6).fill("??"));
    expect(result.hands.W).toEqual(Array(4).fill("??"));
  });

  it("TC-4: empty opponent hand stays []", () => {
    const state = makeState({
      hands: { N: ["B5"], E: [], S: [], W: [] },
    });
    const result = maskState(state, "N");
    expect(result.hands.E).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// maskState — nest
// ---------------------------------------------------------------------------

describe("maskState — nest", () => {
  it("TC-5: nest always cleared regardless of forSeat", () => {
    const state = makeState({
      nest: ["B5", "R6", "G7", "Y8", "B9"],
      hands: { N: [], E: [], S: [], W: [] },
    });
    expect(maskState(state, "N").nest).toEqual([]);
    expect(maskState(state, "E").nest).toEqual([]);
  });

  it("TC-6: nest cleared even when already empty", () => {
    const state = makeState({
      nest: [],
      hands: { N: [], E: [], S: [], W: [] },
    });
    expect(maskState(state, "N").nest).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// maskState — originalNest
// ---------------------------------------------------------------------------

describe("maskState — originalNest", () => {
  it("TC-7: bidder receives full originalNest", () => {
    const state = makeState({
      bidder: "E",
      originalNest: ["B1", "R5", "G7", "Y8", "B9"],
      hands: { N: [], E: [], S: [], W: [] },
    });
    const result = maskState(state, "E");
    expect(result.originalNest).toEqual(["B1", "R5", "G7", "Y8", "B9"]);
  });

  it("TC-8: non-bidder receives [] for originalNest", () => {
    const state = makeState({
      bidder: "E",
      originalNest: ["B1", "R5", "G7", "Y8", "B9"],
      hands: { N: [], E: [], S: [], W: [] },
    });
    const result = maskState(state, "N");
    expect(result.originalNest).toEqual([]);
  });

  it("TC-9: bidder === null → all seats get [] for originalNest", () => {
    const state = makeState({
      bidder: null,
      originalNest: ["B1", "R5", "G7", "Y8", "B9"],
      hands: { N: [], E: [], S: [], W: [] },
    });
    const seats: Seat[] = ["N", "E", "S", "W"];
    for (const seat of seats) {
      expect(maskState(state, seat).originalNest).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// maskState — public fields
// ---------------------------------------------------------------------------

describe("maskState — public fields", () => {
  it("TC-10: non-private fields pass through unchanged", () => {
    const state = makeState({
      phase: "playing",
      trump: "Red",
      scores: { NS: 100, EW: 200 },
      currentBid: 120,
      bidder: "S",
      activePlayer: "N",
      hands: { N: [], E: [], S: [], W: [] },
    });
    const result = maskState(state, "N");

    expect(result.phase).toBe("playing");
    expect(result.trump).toBe("Red");
    expect(result.scores).toEqual({ NS: 100, EW: 200 });
    expect(result.currentBid).toBe(120);
    expect(result.bidder).toBe("S");
    expect(result.activePlayer).toBe("N");
  });

  it("TC-11: maskState does not mutate input state", () => {
    const originalHands = { N: ["B5", "R10"], E: ["G1", "Y2", "B3"], S: ["R6"], W: [] };
    const originalNest = ["B1", "R5"];
    const originalOriginalNest = ["G7", "Y8"];

    const state = makeState({
      bidder: "N",
      hands: originalHands,
      nest: originalNest,
      originalNest: originalOriginalNest,
    });

    maskState(state, "N");

    // Original state must not be mutated
    expect(state.hands).toBe(originalHands);
    expect(state.hands.N).toEqual(["B5", "R10"]);
    expect(state.hands.E).toEqual(["G1", "Y2", "B3"]);
    expect(state.nest).toBe(originalNest);
    expect(state.originalNest).toBe(originalOriginalNest);
  });
});

// ---------------------------------------------------------------------------
// filterEvent — NestTaken
// ---------------------------------------------------------------------------

const nestTakenEvent: Extract<GameEvent, { type: "NestTaken" }> = {
  type: "NestTaken",
  seat: "E",
  nestCards: ["B1", "R5", "G7", "Y8", "B9"],
  handNumber: 0,
  timestamp: 1000,
};

describe("filterEvent — NestTaken", () => {
  it("TC-12: bidder receives full nestCards", () => {
    const result = filterEvent(nestTakenEvent, "E", "E");
    expect((result as typeof nestTakenEvent).nestCards).toEqual(["B1", "R5", "G7", "Y8", "B9"]);
  });

  it("TC-13: non-bidder receives nestCards: []", () => {
    const result = filterEvent(nestTakenEvent, "N", "E");
    expect((result as typeof nestTakenEvent).nestCards).toEqual([]);
  });

  it("TC-14: non-bidder result preserves other NestTaken fields", () => {
    const result = filterEvent(nestTakenEvent, "N", "E") as typeof nestTakenEvent;
    expect(result.type).toBe("NestTaken");
    expect(result.seat).toBe("E");
    expect(result.handNumber).toBe(0);
    expect(result.timestamp).toBe(1000);
  });

  it("TC-15: bidder === null → nestCards: [] even for event.seat", () => {
    const result = filterEvent(nestTakenEvent, "E", null) as typeof nestTakenEvent;
    expect(result.nestCards).toEqual([]);
  });

  it("TC-16: filterEvent does not mutate input NestTaken event", () => {
    const originalNestCards = ["B1", "R5", "G7", "Y8", "B9"];
    const event: typeof nestTakenEvent = {
      ...nestTakenEvent,
      nestCards: originalNestCards,
    };

    filterEvent(event, "N", "E"); // non-bidder call that strips nestCards

    // Original event must not be mutated
    expect(event.nestCards).toBe(originalNestCards);
    expect(event.nestCards).toEqual(["B1", "R5", "G7", "Y8", "B9"]);
  });
});

// ---------------------------------------------------------------------------
// filterEvent — pass-through events
// ---------------------------------------------------------------------------

describe("filterEvent — pass-through", () => {
  it("TC-17: GameStarted passes through unchanged", () => {
    const event: GameEvent = {
      type: "GameStarted",
      seed: 42,
      dealer: "N",
      players: [
        { seat: "N", name: "Alice", kind: "human" },
        { seat: "E", name: "BotE", kind: "bot", botProfile: BOT_PRESETS[1] },
        { seat: "S", name: "BotS", kind: "bot", botProfile: BOT_PRESETS[1] },
        { seat: "W", name: "BotW", kind: "bot", botProfile: BOT_PRESETS[1] },
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
    const result = filterEvent(event, "N", "E");
    expect(result).toBe(event);
  });

  it("TC-18: CardPlayed passes through unchanged", () => {
    const event: GameEvent = {
      type: "CardPlayed",
      seat: "N",
      cardId: "B5",
      trickIndex: 0,
      handNumber: 0,
      timestamp: 2000,
    };
    const result = filterEvent(event, "N", "E");
    expect(result).toBe(event);
  });

  it("TC-19: HandScored passes through with score.nestCards intact", () => {
    const event: GameEvent = {
      type: "HandScored",
      score: {
        hand: 0,
        bidder: "E",
        bidAmount: 100,
        nestCards: ["B1", "R5", "G7", "Y8", "B9"],
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
      },
      handNumber: 0,
      timestamp: 9000,
    };
    const result = filterEvent(event, "N", "E");
    expect(result).toBe(event);
    expect((result as Extract<GameEvent, { type: "HandScored" }>).score.nestCards).toEqual([
      "B1", "R5", "G7", "Y8", "B9",
    ]);
  });

  it("TC-20: BiddingComplete passes through unchanged", () => {
    const event: GameEvent = {
      type: "BiddingComplete",
      winner: "E",
      amount: 100,
      forced: false,
      shotMoon: false,
      handNumber: 0,
      timestamp: 3000,
    };
    const result = filterEvent(event, "N", "E");
    expect(result).toBe(event);
  });
});
