import { describe, it, expect } from "vitest";
import { parseInput, computeOriginalHand } from "./ReplayPage";
import type { GameRecord } from "@rook/engine";

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
