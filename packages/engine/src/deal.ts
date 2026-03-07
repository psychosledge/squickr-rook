import * as prand from "pure-rand";
import { buildDeck, CARD_POINTS } from "./deck.js";
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

/**
 * Returns true if the hand contains at least one point-scoring card
 * (1s=15pts, 5s=5pts, 10s=10pts, 14s=10pts, ROOK=20pts).
 */
export function handHasPointCards(hand: CardId[]): boolean {
  return hand.some((cardId) => (CARD_POINTS[cardId] ?? 0) !== 0);
}

/**
 * Returns true if every seat's hand contains at least one point card.
 * A deal where any hand has zero point cards is a misdeal.
 */
export function dealIsValid(deal: { hands: Record<Seat, CardId[]> }): boolean {
  const SEATS: Seat[] = ["N", "E", "S", "W"];
  return SEATS.every((seat) => handHasPointCards(deal.hands[seat]!));
}

/**
 * Repeatedly derive deals until a valid one is found (no misdeal).
 * Each retry uses a deterministically derived seed to stay reproducible.
 * Same (seed, handNumber) always returns the same deal.
 */
export function dealUntilValid(
  seed: number,
  handNumber: number,
): { hands: Record<Seat, CardId[]>; nest: CardId[] } {
  const MISDEAL_MAX_ATTEMPTS = 1000;
  for (let attempt = 0; attempt < MISDEAL_MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed ^ (handNumber * 1_000_003) ^ (attempt * 7_919)) >>> 0;
    const deal = deriveDeal(attemptSeed, 0); // pass 0 — seed already encodes hand/attempt
    if (dealIsValid(deal)) return deal;
  }
  throw new Error(
    `dealUntilValid: no valid deal found after ${MISDEAL_MAX_ATTEMPTS} attempts ` +
      `(seed=${seed}, handNumber=${handNumber})`,
  );
}
