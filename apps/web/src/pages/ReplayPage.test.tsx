import { describe, it, expect } from "vitest";
import { parseInput } from "./ReplayPage";
import type { GameRecord } from "@rook/engine";

// Minimal GameRecord fixture
const record: GameRecord = {
  gameId: "game-0001",
  dealSeed: 42,
  handNumber: 0,
  transcript: [],
  outcome: {
    bidder: "N", bidAmount: 100,
    nsRaw: 80, ewRaw: 45,
    nsTotal: 80, ewTotal: 45,
    nestPoints: 15, nestWinner: "NS",
    biddingTeamMade: false,
    nsScore: -100, ewScore: 45,
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
