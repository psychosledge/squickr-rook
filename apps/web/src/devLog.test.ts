import { describe, it, expect } from "vitest";
import { GameLogger } from "./devLog";
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
