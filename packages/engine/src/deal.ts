import * as prand from "pure-rand";
import { buildDeck } from "./deck.js";
import type { CardId, Seat } from "./types.js";

/**
 * Derive a deterministic deal from a seed and hand number.
 * effectiveSeed = seed XOR (handNumber * 1_000_003)
 * Uses Fisher-Yates shuffle with xorshift128plus.
 * Deal order: N=[0..9], E=[10..19], S=[20..29], W=[30..39], nest=[40..44]
 */
export function deriveDeal(
  seed: number,
  handNumber: number,
): { hands: Record<Seat, CardId[]>; nest: CardId[] } {
  const effectiveSeed = (seed ^ (handNumber * 1_000_003)) >>> 0;

  let rng = prand.xorshift128plus(effectiveSeed);

  const deck = buildDeck(); // 45 cards

  // Fisher-Yates in-place shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const [j, nextRng] = prand.uniformIntDistribution(0, i, rng);
    rng = nextRng;
    // swap
    const temp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = temp;
  }

  return {
    hands: {
      N: deck.slice(0, 10) as CardId[],
      E: deck.slice(10, 20) as CardId[],
      S: deck.slice(20, 30) as CardId[],
      W: deck.slice(30, 40) as CardId[],
    },
    nest: deck.slice(40, 45) as CardId[],
  };
}
