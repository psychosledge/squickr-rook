import { describe, it, expect } from "vitest";
import {
  buildDeck,
  cardFromId,
  CARD_POINTS,
  compareTrickCards,
  offSuitRank,
  trumpRank,
} from "../deck.js";

describe("buildDeck", () => {
  it("returns exactly 45 cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(45);
  });

  it("has no duplicate card IDs", () => {
    const deck = buildDeck();
    const unique = new Set(deck);
    expect(unique.size).toBe(45);
  });

  it("each color has exactly 11 cards", () => {
    const deck = buildDeck();
    const colors = ["B", "R", "G", "Y"];
    for (const color of colors) {
      const count = deck.filter((id) => id.startsWith(color) && id !== "ROOK").length;
      expect(count).toBe(11);
    }
  });

  it("ROOK is in the deck", () => {
    const deck = buildDeck();
    expect(deck).toContain("ROOK");
  });

  it("CARD_POINTS sums to 180 (card point values only, not most-cards bonus)", () => {
    const total = Object.values(CARD_POINTS).reduce((sum, v) => sum + v, 0);
    // 4×15 (1s) + 4×5 (5s) + 4×10 (10s) + 4×10 (14s) + 20 (ROOK) = 60+20+40+40+20 = 180
    expect(total).toBe(180);
  });
});

describe("cardFromId", () => {
  it("parses B1 correctly", () => {
    const card = cardFromId("B1");
    expect(card).toEqual({ kind: "regular", id: "B1", color: "Black", value: 1 });
  });

  it("parses R14 correctly", () => {
    const card = cardFromId("R14");
    expect(card).toEqual({ kind: "regular", id: "R14", color: "Red", value: 14 });
  });

  it("parses G5 correctly", () => {
    const card = cardFromId("G5");
    expect(card).toEqual({ kind: "regular", id: "G5", color: "Green", value: 5 });
  });

  it("parses Y10 correctly", () => {
    const card = cardFromId("Y10");
    expect(card).toEqual({ kind: "regular", id: "Y10", color: "Yellow", value: 10 });
  });

  it("parses ROOK correctly", () => {
    const card = cardFromId("ROOK");
    expect(card).toEqual({ kind: "rook", id: "ROOK" });
  });
});

describe("offSuitRank", () => {
  it("ranks 1 highest (11)", () => {
    expect(offSuitRank("B1")).toBe(11);
  });

  it("ranks 5 lowest (1)", () => {
    expect(offSuitRank("B5")).toBe(1);
  });

  it("ranks 14 second (10)", () => {
    expect(offSuitRank("B14")).toBe(10);
  });

  it("ROOK returns -1", () => {
    expect(offSuitRank("ROOK")).toBe(-1);
  });
});

describe("trumpRank", () => {
  it("ROOK is highest trump (13)", () => {
    expect(trumpRank("ROOK", "Black")).toBe(13);
  });

  it("1 of trump color is second highest (12)", () => {
    expect(trumpRank("B1", "Black")).toBe(12);
  });

  it("non-trump color returns -1", () => {
    expect(trumpRank("R5", "Black")).toBe(-1);
  });

  it("5 of trump color ranks 2", () => {
    expect(trumpRank("B5", "Black")).toBe(2);
  });
});

describe("compareTrickCards", () => {
  it("trump beats off-suit", () => {
    // B1 (Black trump) vs R1 (Red, off-suit), trump=Black
    const result = compareTrickCards("B1", "R1", "Red", "Black");
    expect(result).toBeGreaterThan(0); // B1 wins
  });

  it("Rook beats all trump", () => {
    // ROOK vs B1 (trump), trump=Black, lead=Black
    const result = compareTrickCards("ROOK", "B1", "Black", "Black");
    expect(result).toBeGreaterThan(0); // ROOK wins
  });

  it("1 beats 14 in same suit (off-suit)", () => {
    // B1 vs B14, no trump, lead=Black
    const result = compareTrickCards("B1", "B14", "Black", null);
    expect(result).toBeGreaterThan(0); // B1 wins
  });

  it("1 beats 14 in trump suit", () => {
    // B1 vs B14, trump=Black, lead=Black
    const result = compareTrickCards("B1", "B14", "Black", "Black");
    expect(result).toBeGreaterThan(0); // B1 wins (as trump)
  });

  it("off-suit card loses to lead color (must-follow context)", () => {
    // Lead=Black, no trump. B5 (lead color) vs R5 (off-suit)
    const result = compareTrickCards("B5", "R5", "Black", null);
    expect(result).toBeGreaterThan(0); // B5 wins because it follows lead
  });

  it("14 beats 13 in same suit", () => {
    const result = compareTrickCards("B14", "B13", "Black", null);
    expect(result).toBeGreaterThan(0);
  });

  it("higher trump beats lower trump", () => {
    // B1 (rank 12) vs B14 (rank 11), trump=Black
    const result = compareTrickCards("B1", "B14", "Black", "Black");
    expect(result).toBeGreaterThan(0);
  });

  it("off-suit card cannot beat lead color card", () => {
    // R5 cannot beat B5 when lead is Black
    const result = compareTrickCards("R5", "B5", "Black", null);
    expect(result).toBeLessThan(0); // B5 wins
  });

  it("Rook beats trump when trump established (Rook-led trick)", () => {
    // ROOK vs B1 when lead was ROOK (leadColor=null), trump=Black
    const result = compareTrickCards("ROOK", "B1", null, "Black");
    expect(result).toBeGreaterThan(0);
  });
});
