import { describe, it, expect, vi, afterEach } from "vitest";
import { botRngFor, simulateGame, simulateGames, toNdjsonLine } from "../simulation.js";

const BASE_SEED = 12345;
const GAMES = 3;

function serialize(records: unknown[]): string {
  return JSON.stringify(records);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simulateGames", () => {
  it("leaves Math.random as the same function", () => {
    const before = Math.random;

    simulateGames(GAMES, BASE_SEED);

    expect(Math.random).toBe(before);
  });

  it("produces identical records for the same base seed", () => {
    expect(serialize(simulateGames(GAMES, BASE_SEED))).toBe(serialize(simulateGames(GAMES, BASE_SEED)));
  });

  it("produces different records for different base seeds", () => {
    expect(serialize(simulateGames(GAMES, BASE_SEED))).not.toBe(serialize(simulateGames(GAMES, BASE_SEED + 1000)));
  });

  it("is unaffected by Math.random draws during simulation", () => {
    const expected = serialize(simulateGames(GAMES, BASE_SEED));
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    expect(serialize(simulateGames(GAMES, BASE_SEED))).toBe(expected);
  });

  it("gives each game its own bot random source derived from its deal seed, unaffected by Math.random draws between games", () => {
    const expected = serialize(simulateGames(GAMES, BASE_SEED));

    const records = [];
    for (let k = 0; k < GAMES; k++) {
      for (let i = 0; i < 50; i++) Math.random();
      const dealSeed = BASE_SEED + k;
      records.push(simulateGame(k, dealSeed, botRngFor(dealSeed)));
    }

    expect(serialize(records)).toBe(expected);
  });

  it.each([0, 0xdeadbeef, -42])("completes games for base seed %i", (baseSeed) => {
    const records = simulateGames(GAMES, baseSeed);

    expect(records.map((r) => r.dealSeed)).toEqual([baseSeed, baseSeed + 1, baseSeed + 2]);
  });
});

describe("simulateGame", () => {
  it("records one transcript entry of four plays per trick in the hand", () => {
    const record = simulateGame(0, BASE_SEED, botRngFor(BASE_SEED));
    const firstTrick = record.transcript[0]!;
    const tricksInHand = firstTrick.handsAtTrickStart[firstTrick.leadSeat].length;

    expect(record.transcript).toHaveLength(tricksInHand);
    for (const trick of record.transcript) {
      expect(trick.plays).toHaveLength(4);
    }
  });
});

describe("botRngFor", () => {
  it.each([
    ["a per-game seed of 0", 0],
    ["a per-game seed whose mixed bot seed is 0", 0xdeadbeef],
    ["a negative per-game seed", -42],
  ])("gives %s a varied bot random stream", (_label, dealSeed) => {
    const rng = botRngFor(dealSeed);
    const values = Array.from({ length: 20 }, () => rng());

    expect(new Set(values).size).toBe(20);
  });
});

describe("toNdjsonLine", () => {
  it("emits one JSON line per record that parses back to the record", () => {
    for (const record of simulateGames(GAMES, BASE_SEED)) {
      const line = toNdjsonLine(record);

      expect(line.endsWith("\n")).toBe(true);
      expect(line.slice(0, -1)).not.toContain("\n");
      const parsed = JSON.parse(line);
      expect(Object.keys(parsed).sort()).toEqual(
        ["bidHistory", "dealSeed", "gameId", "handNumber", "outcome", "transcript"],
      );
      expect(parsed).toEqual(record);
    }
  });
});
