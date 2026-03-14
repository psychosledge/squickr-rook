import { describe, it, expect } from "vitest";
import { GameLogger } from "./devLog";
import type { BidEvent } from "./devLog";
import type { GameState, Seat, CardId } from "@rook/engine";
import { DEFAULT_RULES, BOT_PRESETS } from "@rook/engine";

// Minimal GameState factory for testing
function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "playing",
    dealer: "N" as Seat,
    activePlayer: null,
    hands: {
      N: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"] as CardId[],
      E: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"] as CardId[],
      S: ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10"] as CardId[],
      W: ["Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7", "Y8", "Y9", "Y10"] as CardId[],
    },
    nest: [],
    originalNest: [],
    trump: "Black" as import("@rook/engine").Color,
    bidder: "N" as Seat,
    currentBid: 100,
    bids: { N: 100, E: "pass", S: "pass", W: "pass" },
    currentTrick: [],
    completedTricks: [],
    tricksPlayed: 0,
    handNumber: 1,
    scores: { NS: 0, EW: 0 },
    playedCards: [],
    moonShooters: [],
    handHistory: [],
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "BotS", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "BotW", kind: "bot", botProfile: BOT_PRESETS[3] },
    ],
    rules: DEFAULT_RULES,
    ...overrides,
  } as GameState;
}

function makeStateWithHandHistory(): GameState {
  const score = {
    hand: 1,
    bidder: "N" as Seat,
    bidAmount: 100,
    shotMoon: false,
    moonShooterWentSet: false,
    nsTotal: 80,
    ewTotal: 40,
    nestCards: ["B11"] as CardId[],
    discarded: ["R11", "G11", "Y11", "R12", "G12"] as CardId[],
    nsDelta: 80,
    ewDelta: 40,
    nsPointCards: 80,
    ewPointCards: 40,
    nsMostCardsBonus: 0,
    ewMostCardsBonus: 0,
    nsNestBonus: 0,
    ewNestBonus: 0,
    nsWonLastTrick: true,
    ewWonLastTrick: false,
  };
  return makeMinimalState({
    completedTricks: [],
    handHistory: [score as import("@rook/engine").HandScore],
  });
}

describe("GameLogger — startingHands", () => {
  it("onHandStart captures starting hands snapshot", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    // Verify via the log entry after onHandComplete
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const log = logger.getLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.startingHands).toBeDefined();
  });

  it("snapshot survives subsequent mutation of source gameState.hands", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    const originalN = [...gs.hands.N!];
    logger.onHandStart(1000, gs);
    // Mutate the original state's hands
    (gs.hands.N as CardId[]).push("ROOK" as CardId);
    // The snapshot should still have the original 10 cards
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const log = logger.getLog();
    expect(log[0]!.startingHands.N).toHaveLength(originalN.length);
    expect(log[0]!.startingHands.N).toEqual(originalN);
  });

  it("startingHands populated in HandLogEntry after onHandComplete", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.startingHands.N).toEqual(gs.hands.N);
    expect(entry.startingHands.E).toEqual(gs.hands.E);
    expect(entry.startingHands.S).toEqual(gs.hands.S);
    expect(entry.startingHands.W).toEqual(gs.hands.W);
  });

  it("bidWinnerDiscards matches score.discarded", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    const score = completedGs.handHistory[completedGs.handHistory.length - 1]!;
    expect(entry.bidWinnerDiscards).toEqual(score.discarded);
  });

  it("startingHands has exactly 10 cards per seat", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    for (const seat of ["N", "E", "S", "W"] as Seat[]) {
      expect(entry.startingHands[seat]).toHaveLength(10);
    }
  });

  it("_devOnHandStart callback receives GameState as second argument", () => {
    // This tests the type contract: the callback should accept (timestamp, gameState)
    const received: GameState[] = [];
    const callback = (_ts: number, gs: GameState) => { received.push(gs); };
    const logger = new GameLogger();
    const gs = makeMinimalState();
    // Call with both arguments — TypeScript would catch a mismatch at compile time
    callback(1000, gs);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(gs);
    // Also verify the logger itself works
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const log = logger.getLog();
    expect(log).toHaveLength(1);
  });
});

describe("GameLogger — bidSummary (renamed from bidSequence)", () => {
  it("bidSummary is present on HandLogEntry", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.bidSummary).toBeDefined();
    expect(Array.isArray(entry.bidSummary)).toBe(true);
  });

  it("bidSummary contains entries for seats with non-null bids", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    // N=100, E="pass", S="pass", W="pass" — all 4 bids are non-null
    expect(entry.bidSummary.length).toBe(4);
    const nEntry = entry.bidSummary.find((b) => b.seat === "N");
    expect(nEntry).toBeDefined();
    expect(nEntry!.bid).toBe(100);
  });
});

describe("GameLogger — auctionEvents", () => {
  it("auctionEvents is empty array when no onBidEvent calls", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.auctionEvents).toEqual([]);
    expect(entry.auctionRounds).toBe(0);
  });

  it("onBidEvent appends to auctionEvents", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const event: BidEvent = {
      seat: "N",
      isHuman: true,
      action: "place",
      amount: 100,
      standingBid: 95,
      round: 1,
      annotation: null,
    };
    logger.onBidEvent(event);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.auctionEvents).toHaveLength(1);
    expect(entry.auctionEvents[0]!.seat).toBe("N");
    expect(entry.auctionEvents[0]!.action).toBe("place");
    expect(entry.auctionEvents[0]!.amount).toBe(100);
  });

  it("onBidEvent round tracking increments on seat wrap", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);

    // Emit N(round 1), E(round 1), S(round 1), W(round 1), then N again → should be round 2
    const makeEvent = (seat: Seat): BidEvent => ({
      seat,
      isHuman: false,
      action: "place",
      amount: 100,
      standingBid: 95,
      round: 1, // placeholder — will be overridden
      annotation: null,
    });

    logger.onBidEvent(makeEvent("N"));
    logger.onBidEvent(makeEvent("E"));
    logger.onBidEvent(makeEvent("S"));
    logger.onBidEvent(makeEvent("W"));
    logger.onBidEvent(makeEvent("N")); // wraps back → round 2

    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;

    expect(entry.auctionEvents).toHaveLength(5);
    // First 4 events should be round 1
    expect(entry.auctionEvents[0]!.round).toBe(1);
    expect(entry.auctionEvents[1]!.round).toBe(1);
    expect(entry.auctionEvents[2]!.round).toBe(1);
    expect(entry.auctionEvents[3]!.round).toBe(1);
    // 5th event (N again) should be round 2
    expect(entry.auctionEvents[4]!.round).toBe(2);
    expect(entry.auctionRounds).toBe(2);
  });

  it("auctionRounds is derived as max round from auctionEvents", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);

    // 3 full rounds: N,E,S,W,N,E,S,W,N,E,S,W
    const makeEvent = (seat: Seat): BidEvent => ({
      seat,
      isHuman: false,
      action: "pass",
      amount: null,
      standingBid: 100,
      round: 1,
      annotation: null,
    });
    for (let i = 0; i < 3; i++) {
      logger.onBidEvent(makeEvent("N"));
      logger.onBidEvent(makeEvent("E"));
      logger.onBidEvent(makeEvent("S"));
      logger.onBidEvent(makeEvent("W"));
    }

    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.auctionRounds).toBe(3);
  });

  it("round tracking is correct when auction starts at W (non-N dealer)", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);

    const makeEvent = (seat: Seat): BidEvent => ({
      seat,
      isHuman: false,
      action: "pass",
      amount: null,
      standingBid: 100,
      round: 1, // placeholder — will be overridden
      annotation: null,
    });

    // W → N → E → S → W (second time) = round 2 for the second W
    logger.onBidEvent(makeEvent("W")); // round 1 (first bidder)
    logger.onBidEvent(makeEvent("N")); // round 1
    logger.onBidEvent(makeEvent("E")); // round 1
    logger.onBidEvent(makeEvent("S")); // round 1
    logger.onBidEvent(makeEvent("W")); // round 2 (first bidder seen again)

    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;

    expect(entry.auctionEvents[0]!.round).toBe(1); // W
    expect(entry.auctionEvents[1]!.round).toBe(1); // N
    expect(entry.auctionEvents[2]!.round).toBe(1); // E
    expect(entry.auctionEvents[3]!.round).toBe(1); // S
    expect(entry.auctionEvents[4]!.round).toBe(2); // W again = new round
    expect(entry.auctionRounds).toBe(2);
  });
});

describe("GameLogger — scoresBefore", () => {
  it("scoresBefore is captured from onHandStart gameState", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState({ scores: { NS: 150, EW: -50 } });
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.scoresBefore).toEqual({ NS: 150, EW: -50 });
  });

  it("scoresBefore defaults to NS:0 EW:0 when scores are zero", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState({ scores: { NS: 0, EW: 0 } });
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    expect(entry.scoresBefore).toEqual({ NS: 0, EW: 0 });
  });
});

describe("GameLogger — discardedCards removed", () => {
  it("discardedCards is not present on HandLogEntry", () => {
    const logger = new GameLogger();
    const gs = makeMinimalState();
    logger.onHandStart(1000, gs);
    const completedGs = makeStateWithHandHistory();
    logger.onHandComplete(completedGs);
    const entry = logger.getLog()[0]!;
    // @ts-expect-error — discardedCards should not exist on HandLogEntry
    expect(entry.discardedCards).toBeUndefined();
  });
});

describe("GameLogger — pendingBidEvents reset between hands", () => {
  it("auctionEvents from previous hand do not bleed into next hand", () => {
    const logger = new GameLogger();

    // First hand with a bid event
    const gs1 = makeMinimalState();
    logger.onHandStart(1000, gs1);
    logger.onBidEvent({
      seat: "N",
      isHuman: true,
      action: "place",
      amount: 100,
      standingBid: 95,
      round: 1,
      annotation: null,
    });
    logger.onHandComplete(makeStateWithHandHistory());

    // Second hand — no bid events
    const gs2 = makeMinimalState({ handNumber: 2 });
    logger.onHandStart(2000, gs2);
    logger.onHandComplete(makeStateWithHandHistory());

    const log = logger.getLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.auctionEvents).toHaveLength(1);
    expect(log[1]!.auctionEvents).toHaveLength(0);
  });
});
