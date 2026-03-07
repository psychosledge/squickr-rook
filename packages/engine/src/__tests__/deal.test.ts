import { describe, it, expect } from "vitest";
import { deriveDeal, handHasPointCards, dealIsValid, dealUntilValid } from "../deal.js";

describe("deriveDeal", () => {
  it("same seed and handNumber produce same deal (determinism)", () => {
    const deal1 = deriveDeal(12345, 0);
    const deal2 = deriveDeal(12345, 0);
    expect(deal1).toEqual(deal2);
  });

  it("different seeds produce different deals", () => {
    const deal1 = deriveDeal(12345, 0);
    const deal2 = deriveDeal(99999, 0);
    expect(deal1.hands.N).not.toEqual(deal2.hands.N);
  });

  it("different handNumbers produce different deals", () => {
    const deal1 = deriveDeal(12345, 0);
    const deal2 = deriveDeal(12345, 1);
    expect(deal1.hands.N).not.toEqual(deal2.hands.N);
  });

  it("each hand has exactly 10 cards", () => {
    const deal = deriveDeal(42, 0);
    expect(deal.hands.N).toHaveLength(10);
    expect(deal.hands.E).toHaveLength(10);
    expect(deal.hands.S).toHaveLength(10);
    expect(deal.hands.W).toHaveLength(10);
  });

  it("nest has exactly 5 cards", () => {
    const deal = deriveDeal(42, 0);
    expect(deal.nest).toHaveLength(5);
  });

  it("all 45 cards are present (no duplicates, no missing)", () => {
    const deal = deriveDeal(42, 0);
    const allCards = [
      ...deal.hands.N,
      ...deal.hands.E,
      ...deal.hands.S,
      ...deal.hands.W,
      ...deal.nest,
    ];
    expect(allCards).toHaveLength(45);
    const unique = new Set(allCards);
    expect(unique.size).toBe(45);
  });

  it("works for various hand numbers", () => {
    for (let h = 0; h < 5; h++) {
      const deal = deriveDeal(777, h);
      const allCards = [
        ...deal.hands.N,
        ...deal.hands.E,
        ...deal.hands.S,
        ...deal.hands.W,
        ...deal.nest,
      ];
      expect(allCards).toHaveLength(45);
      expect(new Set(allCards).size).toBe(45);
    }
  });

  it("seed 0 hand 0 is valid", () => {
    const deal = deriveDeal(0, 0);
    const allCards = [
      ...deal.hands.N,
      ...deal.hands.E,
      ...deal.hands.S,
      ...deal.hands.W,
      ...deal.nest,
    ];
    expect(new Set(allCards).size).toBe(45);
  });
});

describe("handHasPointCards", () => {
  it("returns true for hand with a 1 (15-pt card)", () => {
    expect(handHasPointCards(["B6", "B7", "B1"])).toBe(true);
  });

  it("returns true for hand with a 5 (5-pt card)", () => {
    expect(handHasPointCards(["R9", "G11", "B5"])).toBe(true);
  });

  it("returns true for hand with a 10 (10-pt card)", () => {
    expect(handHasPointCards(["Y7", "G8", "R10"])).toBe(true);
  });

  it("returns true for hand with a 14 (10-pt card)", () => {
    expect(handHasPointCards(["B12", "B13", "Y14"])).toBe(true);
  });

  it("returns true for hand with ROOK (20-pt card)", () => {
    expect(handHasPointCards(["G6", "G7", "ROOK"])).toBe(true);
  });

  it("returns false for hand with only non-point cards", () => {
    expect(handHasPointCards(["B2", "B3"])).toBe(false);
  });

  it("returns false for empty hand", () => {
    expect(handHasPointCards([])).toBe(false);
  });
});

describe("dealIsValid", () => {
  it("returns true when all four hands have at least one point card", () => {
    // seed=0 produces a valid deal (verified above)
    const deal = deriveDeal(0, 0);
    expect(dealIsValid(deal)).toBe(true);
  });

  it("returns false when N's hand has no point cards", () => {
    const deal = deriveDeal(0, 0);
    const rigged = {
      ...deal,
      hands: {
        ...deal.hands,
        N: ["B6", "B7", "B8", "B9", "B11", "B12", "B13", "G6", "G7", "G8"],
      },
    };
    expect(dealIsValid(rigged)).toBe(false);
  });

  it("returns false when E's hand has no point cards", () => {
    const deal = deriveDeal(0, 0);
    const rigged = {
      ...deal,
      hands: {
        ...deal.hands,
        E: ["R6", "R7", "R8", "R9", "R11", "R12", "R13", "Y6", "Y7", "Y8"],
      },
    };
    expect(dealIsValid(rigged)).toBe(false);
  });

  it("returns false when S's hand has no point cards", () => {
    const deal = deriveDeal(0, 0);
    const rigged = {
      ...deal,
      hands: {
        ...deal.hands,
        S: ["G9", "G11", "G12", "G13", "Y9", "Y11", "Y12", "Y13", "B8", "B9"],
      },
    };
    expect(dealIsValid(rigged)).toBe(false);
  });

  it("returns false when W's hand has no point cards", () => {
    const deal = deriveDeal(0, 0);
    const rigged = {
      ...deal,
      hands: {
        ...deal.hands,
        W: ["B6", "B7", "B8", "B9", "B11", "B12", "B13", "G6", "G7", "G8"],
      },
    };
    expect(dealIsValid(rigged)).toBe(false);
  });
});

describe("dealUntilValid", () => {
  it("is deterministic: same (seed, handNumber) always returns same deal", () => {
    const deal1 = dealUntilValid(42, 0);
    const deal2 = dealUntilValid(42, 0);
    expect(deal1).toEqual(deal2);
  });

  it("all four hands have exactly 10 cards", () => {
    const deal = dealUntilValid(42, 0);
    expect(deal.hands.N).toHaveLength(10);
    expect(deal.hands.E).toHaveLength(10);
    expect(deal.hands.S).toHaveLength(10);
    expect(deal.hands.W).toHaveLength(10);
  });

  it("nest has exactly 5 cards", () => {
    const deal = dealUntilValid(42, 0);
    expect(deal.nest).toHaveLength(5);
  });

  it("all 45 cards present, no duplicates", () => {
    const deal = dealUntilValid(42, 0);
    const allCards = [
      ...deal.hands.N,
      ...deal.hands.E,
      ...deal.hands.S,
      ...deal.hands.W,
      ...deal.nest,
    ];
    expect(allCards).toHaveLength(45);
    expect(new Set(allCards).size).toBe(45);
  });

  it("every hand has at least one point card — property test over 200 random seeds", () => {
    for (let seed = 0; seed < 200; seed++) {
      const deal = dealUntilValid(seed, 0);
      expect(dealIsValid(deal)).toBe(true);
    }
  });

  it("known misdeal seed redeals: seed=1 handNumber=0 is a misdeal, dealUntilValid returns valid deal", () => {
    // Verify seed=1 with deriveDeal IS a misdeal
    const misdeal = deriveDeal(1, 0);
    expect(dealIsValid(misdeal)).toBe(false);

    // dealUntilValid must return a valid deal for same inputs
    const valid = dealUntilValid(1, 0);
    expect(dealIsValid(valid)).toBe(true);
    // And it should differ from the misdeal
    expect(valid.hands).not.toEqual(misdeal.hands);
  });
});
