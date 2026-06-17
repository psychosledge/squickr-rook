import { describe, it, expect } from "vitest";
import { parseInput, computeOriginalHand, computeDisplayScores, computeRemainingPoints } from "./ReplayPage";
import type { GameRecord, HandScore, TrickSnapshot } from "@rook/engine";

// Minimal GameRecord fixture
const record: GameRecord = {
  gameId: "game-0001",
  dealSeed: 42,
  handNumber: 0,
  transcript: [],
  outcome: {
    hand: 0,
    bidder: "N",
    bidAmount: 100,
    nestCards: [],
    discarded: [],
    nsPointCards: 80,
    ewPointCards: 45,
    nsMostCardsBonus: 0,
    ewMostCardsBonus: 0,
    nsNestBonus: 0,
    ewNestBonus: 0,
    nsWonLastTrick: false,
    ewWonLastTrick: false,
    nsTotal: 80,
    ewTotal: 45,
    nsDelta: 80,
    ewDelta: 45,
    shotMoon: false,
    moonShooterWentSet: false,
  },
};

describe("parseInput", () => {
  it("parses a single JSON object", () => {
    const result = parseInput(JSON.stringify(record));
    expect(result).toHaveLength(1);
    expect(result[0]!.gameId).toBe("game-0001");
  });

  it("parses a JSON array of records", () => {
    const two = [record, { ...record, gameId: "game-0002" }];
    const result = parseInput(JSON.stringify(two));
    expect(result).toHaveLength(2);
    expect(result[1]!.gameId).toBe("game-0002");
  });

  it("parses NDJSON (multiple lines)", () => {
    const ndjson = [record, { ...record, gameId: "game-0003" }]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const result = parseInput(ndjson);
    expect(result).toHaveLength(2);
    expect(result[1]!.gameId).toBe("game-0003");
  });

  it("returns empty array for empty input", () => {
    expect(parseInput("")).toHaveLength(0);
    expect(parseInput("   ")).toHaveLength(0);
  });
});

describe("computeOriginalHand", () => {
  it("returns trick-1 hand unchanged when bidder discards all nest cards back", () => {
    // Bidder took the nest but put all nest cards back — original hand == trick-1 hand
    const handAtTrick1 = ["Red-10", "Black-5", "Green-7"] as const;
    const nestCards = ["Yellow-1", "Black-14"] as const;
    const discarded = ["Yellow-1", "Black-14"] as const; // all nest cards discarded
    expect(computeOriginalHand([...handAtTrick1], [...nestCards], [...discarded])).toEqual([
      "Red-10",
      "Black-5",
      "Green-7",
    ]);
  });

  it("recovers discarded hand cards when bidder keeps all nest cards", () => {
    // trick-1 hand is only the two kept nest cards (all hand cards were discarded)
    const handAtTrick1 = ["Yellow-1", "Black-14"] as const;
    const nestCards = ["Yellow-1", "Black-14"] as const;
    const discarded = ["Red-10", "Black-5"] as const; // hand cards discarded
    expect(computeOriginalHand([...handAtTrick1], [...nestCards], [...discarded])).toEqual([
      "Red-10",
      "Black-5",
    ]);
  });

  it("handles mixed case: one nest card kept, one nest card and one hand card discarded", () => {
    // trick-1 hand: kept Yellow-1 from nest, Red-10 (hand) was discarded
    const handAtTrick1 = ["Black-5", "Green-7", "Yellow-1"] as const;
    const nestCards = ["Yellow-1", "Black-14"] as const;
    const discarded = ["Black-14", "Red-10"] as const; // Black-14 from nest, Red-10 from hand
    expect(computeOriginalHand([...handAtTrick1], [...nestCards], [...discarded])).toEqual([
      "Black-5",
      "Green-7",
      "Red-10",
    ]);
  });
});

// Fixtures for computeDisplayScores and computeRemainingPoints
const trickFixture: TrickSnapshot = {
  trickNumber: 10,
  leadSeat: "N",
  trump: "Yellow",
  handsAtTrickStart: { N: [], E: [], S: [], W: [] },
  plays: [],
  winner: "N",
  pointsInTrick: 15,
  cumulativeScore: { NS: 100, EW: 80 },
};

const outcomeFixture: HandScore = {
  hand: 0,
  bidder: "N",
  bidAmount: 100,
  nestCards: [],
  discarded: ["R10", "G5"],  // 10 + 5 = 15 pts nest bonus
  nsPointCards: 100,
  ewPointCards: 80,
  nsMostCardsBonus: 20,
  ewMostCardsBonus: 0,
  nsNestBonus: 0,
  ewNestBonus: 0,
  nsWonLastTrick: false,
  ewWonLastTrick: false,
  nsTotal: 120,  // 100 + 20 most-cards bonus
  ewTotal: 80,
  nsDelta: 20,
  ewDelta: 80,
  shotMoon: false,
  moonShooterWentSet: false,
};

describe("computeDisplayScores", () => {
  it("on last trick returns outcome.nsTotal and outcome.ewTotal (not cumulativeScore)", () => {
    // Arrange: cumulativeScore shows 100/80 but outcome totals include bonuses
    const result = computeDisplayScores(trickFixture, outcomeFixture, true);
    // Assert: should use the fully settled totals
    expect(result.nsScore).toBe(120);
    expect(result.ewScore).toBe(80);
  });

  it("on non-last trick returns trick.cumulativeScore values", () => {
    // Arrange: mid-game trick where outcome totals differ from cumulative
    const midTrick: TrickSnapshot = { ...trickFixture, trickNumber: 5, cumulativeScore: { NS: 40, EW: 30 } };
    const result = computeDisplayScores(midTrick, outcomeFixture, false);
    // Assert: should use cumulativeScore, not outcome totals
    expect(result.nsScore).toBe(40);
    expect(result.ewScore).toBe(30);
  });

  it("mid-game trick uses cumulativeScore even when nsTotal differs significantly", () => {
    // Arrange: outcome.nsTotal is 120, but mid-game score is only 20
    const earlyTrick: TrickSnapshot = { ...trickFixture, trickNumber: 2, cumulativeScore: { NS: 20, EW: 0 } };
    const result = computeDisplayScores(earlyTrick, outcomeFixture, false);
    // Assert: interim view should reflect progress, not final outcome
    expect(result.nsScore).toBe(20);
    expect(result.ewScore).toBe(0);
  });
});

describe("computeRemainingPoints", () => {
  // Build a minimal transcript: 10 tricks, each worth 15 pts
  const makeTranscript = (count: number): TrickSnapshot[] =>
    Array.from({ length: count }, (_, i) => ({
      ...trickFixture,
      trickNumber: i + 1,
      pointsInTrick: 15,
    }));

  it("on last trick (trickIndex === transcript.length - 1) returns 0", () => {
    // Arrange: 10-trick game, viewing trick 10 (index 9)
    const transcript = makeTranscript(10);
    // discarded has no point cards — nestBonus = 0
    const result = computeRemainingPoints(transcript, [], 9, 20);
    expect(result).toBe(0);
  });

  it("on non-last trick returns sum of future trick points plus nest bonus plus most-cards bonus", () => {
    // Arrange: 10-trick game, viewing trick 8 (index 7), tricks 9 and 10 are future = 30 pts
    // Discarded cards: R10 (10 pts) and G5 (5 pts) = 15 pts nest bonus; most-cards bonus = 20
    const transcript = makeTranscript(10);
    const result = computeRemainingPoints(transcript, ["R10", "G5"], 7, 20);
    // futurePoints = 15 + 15 = 30; nestBonus = 15; mostCardsBonus = 20; total = 65
    expect(result).toBe(65);
  });

  it("correctly excludes the current trick's points from remaining", () => {
    // Arrange: 3-trick game, viewing trick 1 (index 0), tricks 2 and 3 are future
    const transcript: TrickSnapshot[] = [
      { ...trickFixture, trickNumber: 1, pointsInTrick: 20 },
      { ...trickFixture, trickNumber: 2, pointsInTrick: 10 },
      { ...trickFixture, trickNumber: 3, pointsInTrick: 5 },
    ];
    // No discards; future from index 0 is tricks at index 1 and 2 = 10 + 5 = 15; mostCardsBonus = 20
    const result = computeRemainingPoints(transcript, [], 0, 20);
    // trick at index 0 (20 pts) must NOT be included in remaining
    expect(result).toBe(35);
  });
});
