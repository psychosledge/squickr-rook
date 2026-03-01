import { describe, it, expect } from "vitest";
import { deriveDeal } from "../deal.js";

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
