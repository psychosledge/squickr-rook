import { describe, it, expect } from "vitest";
import { MASKED_CARD } from "@rook/engine";
import { sortHand } from "./sortHand";

describe("sortHand", () => {
  it("no trump: colors in Black→Red→Green→Yellow order, Rook at end", () => {
    // Arrange: one card from each color + Rook, in scrambled order
    const cards = ["G7", "R1", "B14", "Y5", "ROOK", "R5", "B1"];

    // Act
    const result = sortHand(cards, null);

    // Assert: Black first, then Red, then Green, then Yellow, then Rook
    const colorOrder = result.map((id) => {
      if (id === "ROOK") return "ROOK";
      const initial = id[0];
      if (initial === "B") return "Black";
      if (initial === "R") return "Red";
      if (initial === "G") return "Green";
      if (initial === "Y") return "Yellow";
      return "?";
    });

    // All Blacks before Reds, all Reds before Greens, all Greens before Yellows, Rook last
    const firstRed = colorOrder.indexOf("Red");
    const lastBlack = colorOrder.lastIndexOf("Black");
    const firstGreen = colorOrder.indexOf("Green");
    const lastRed = colorOrder.lastIndexOf("Red");
    const firstYellow = colorOrder.indexOf("Yellow");
    const lastGreen = colorOrder.lastIndexOf("Green");
    const rookIdx = colorOrder.indexOf("ROOK");

    expect(lastBlack).toBeLessThan(firstRed);
    expect(lastRed).toBeLessThan(firstGreen);
    expect(lastGreen).toBeLessThan(firstYellow);
    expect(rookIdx).toBe(result.length - 1);
  });

  it("with trump: trump group first, Rook at end of trump group", () => {
    // Arrange: Red trump, some Red cards, some non-Red, plus Rook
    const cards = ["B1", "R5", "G14", "ROOK", "R10", "Y7", "R1"];

    // Act
    const result = sortHand(cards, "Red");

    // Assert: Red cards first (including Rook at end of that group), then others
    const redCards = ["R5", "R10", "R1", "ROOK"];
    const nonRedCards = ["B1", "G14", "Y7"];

    // All Red (trump) cards should come before all non-Red cards
    const lastTrumpIdx = Math.max(...redCards.map((c) => result.indexOf(c)));
    const firstNonTrumpIdx = Math.min(...nonRedCards.map((c) => result.indexOf(c)));

    expect(lastTrumpIdx).toBeLessThan(firstNonTrumpIdx);

    // ROOK should be at end of trump group (last among trump cards)
    const rookIdx = result.indexOf("ROOK");
    const regularTrumpIdxs = ["R5", "R10", "R1"].map((c) => result.indexOf(c));
    expect(rookIdx).toBeGreaterThan(Math.max(...regularTrumpIdxs));
  });

  it("within a color group: descending rank (1, 14, 13...5)", () => {
    // Arrange: all Black cards shuffled
    const cards = ["B5", "B1", "B14", "B13", "B12", "B11", "B10", "B9", "B8", "B7", "B6"];

    // Act
    const result = sortHand(cards, null);

    // Assert: B1, B14, B13, B12, B11, B10, B9, B8, B7, B6, B5
    expect(result).toEqual(["B1", "B14", "B13", "B12", "B11", "B10", "B9", "B8", "B7", "B6", "B5"]);
  });

  it("empty hand returns empty array", () => {
    expect(sortHand([], null)).toEqual([]);
    expect(sortHand([], "Black")).toEqual([]);
  });

  it("single card returns that card", () => {
    expect(sortHand(["R7"], null)).toEqual(["R7"]);
    expect(sortHand(["B1"], "Green")).toEqual(["B1"]);
  });

  it("hand with only Rook returns [Rook]", () => {
    expect(sortHand(["ROOK"], null)).toEqual(["ROOK"]);
    expect(sortHand(["ROOK"], "Black")).toEqual(["ROOK"]);
  });

  it("within trump group: cards sorted descending rank", () => {
    // Arrange: Black trump, four Black cards in scrambled order
    const hand = ["B5", "B1", "B14", "B6"];

    // Act
    const result = sortHand(hand, "Black");

    // Assert: descending rank — 1 (highest), 14, 6, 5
    expect(result[0]).toBe("B1");
    expect(result[1]).toBe("B14");
    // Full expected order: B1, B14, B6, B5
    expect(result).toEqual(["B1", "B14", "B6", "B5"]);
  });

  // ── Fix: masked placeholder cards ("??") ─────────────────────────────────

  it('all masked cards returns empty array', () => {
    // Arrange: hand of only masked placeholders (e.g. opponent's hand)
    // Act / Assert
    expect(sortHand([MASKED_CARD, MASKED_CARD, MASKED_CARD], null)).toEqual([]);
  });

  it('masked cards are filtered out, real cards remain', () => {
    // Arrange: mix of masked placeholders and one real card
    // Act
    const result = sortHand([MASKED_CARD, "R14", MASKED_CARD], null);
    // Assert: only the real card survives
    expect(result).toEqual(["R14"]);
  });

  it('masked cards are filtered out regardless of trump', () => {
    // Arrange: mix of masked placeholders and one real card, with trump set
    // Act
    const result = sortHand([MASKED_CARD, "R14", MASKED_CARD], "Red");
    // Assert: only the real card survives
    expect(result).toEqual(["R14"]);
  });
});
