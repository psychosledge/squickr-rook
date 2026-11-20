import { describe, it, expect } from "vitest";
import { makeXorshift32 } from "../index.js";

function draw(rng: () => number, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe("makeXorshift32", () => {
  it("produces the same sequence for the same seed", () => {
    expect(draw(makeXorshift32(12345), 20)).toEqual(draw(makeXorshift32(12345), 20));
  });

  it("produces different sequences for different seeds", () => {
    expect(draw(makeXorshift32(12345), 20)).not.toEqual(draw(makeXorshift32(12346), 20));
  });

  it("returns values in [0, 1)", () => {
    for (const value of draw(makeXorshift32(987654321), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("does not collapse to a constant stream for seed 0", () => {
    const values = draw(makeXorshift32(0), 20);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});
