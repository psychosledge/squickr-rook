import type { Card, CardId, CardValue, Color } from "./types.js";

export const COLOR_INITIAL: Record<Color, string> = {
  Black:  "B",
  Red:    "R",
  Green:  "G",
  Yellow: "Y",
};

const INITIAL_TO_COLOR: Record<string, Color> = {
  B: "Black",
  R: "Red",
  G: "Green",
  Y: "Yellow",
};

const CARD_VALUES: CardValue[] = [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Build the full 45-card deck (44 regular + ROOK).
 * Returns card IDs only.
 */
export function buildDeck(): CardId[] {
  const ids: CardId[] = [];
  for (const color of COLORS) {
    const initial = COLOR_INITIAL[color];
    for (const value of CARD_VALUES) {
      ids.push(`${initial}${value}`);
    }
  }
  ids.push("ROOK");
  return ids;
}

/**
 * Parse a CardId string into a Card object.
 */
export function cardFromId(id: CardId): Card {
  if (id === "ROOK") {
    return { kind: "rook", id: "ROOK" };
  }
  const initial = id[0];
  if (initial === undefined) {
    throw new Error(`Invalid card id: ${id}`);
  }
  const color = INITIAL_TO_COLOR[initial];
  if (color === undefined) {
    throw new Error(`Unknown color initial: ${initial}`);
  }
  const valueStr = id.slice(1);
  const value = parseInt(valueStr, 10) as CardValue;
  if (isNaN(value)) {
    throw new Error(`Invalid card value in id: ${id}`);
  }
  return { kind: "regular", id, color, value };
}

/**
 * Point values per card.
 * 1s=15, 5s=5, 10s=10, 14s=10, ROOK=20, others=0
 */
function computeCardPoints(): Record<CardId, number> {
  const result: Record<CardId, number> = {};
  const deck = buildDeck();
  for (const cardId of deck) {
    if (cardId === "ROOK") {
      result[cardId] = 20;
      continue;
    }
    const card = cardFromId(cardId);
    if (card.kind === "regular") {
      if (card.value === 1) result[cardId] = 15;
      else if (card.value === 5) result[cardId] = 5;
      else if (card.value === 10) result[cardId] = 10;
      else if (card.value === 14) result[cardId] = 10;
      else result[cardId] = 0;
    }
  }
  return result;
}

export const CARD_POINTS: Record<CardId, number> = computeCardPoints();

/**
 * Off-suit rank: higher number = stronger card.
 * 1=11, 14=10, 13=9, 12=8, 11=7, 10=6, 9=5, 8=4, 7=3, 6=2, 5=1
 * ROOK = -1 (not a regular off-suit card)
 */
export function offSuitRank(cardId: CardId): number {
  if (cardId === "ROOK") return -1;
  const card = cardFromId(cardId);
  if (card.kind !== "regular") return -1;
  switch (card.value) {
    case 1:  return 11;
    case 14: return 10;
    case 13: return 9;
    case 12: return 8;
    case 11: return 7;
    case 10: return 6;
    case 9:  return 5;
    case 8:  return 4;
    case 7:  return 3;
    case 6:  return 2;
    case 5:  return 1;
    default: return 0;
  }
}

/**
 * Trump rank: higher = stronger trump card.
 * ROOK=13, 1=12, 14=11, 13=10, 12=9, 11=8, 10=7, 9=6, 8=5, 7=4, 6=3, 5=2
 * Returns -1 if the card is NOT a trump card (not rook, not trump color).
 */
export function trumpRank(cardId: CardId, trump: Color): number {
  if (cardId === "ROOK") return 13; // Rook is always highest trump when trump is established
  const card = cardFromId(cardId);
  if (card.kind !== "regular") return -1;
  if (card.color !== trump) return -1;
  switch (card.value) {
    case 1:  return 12;
    case 14: return 11;
    case 13: return 10;
    case 12: return 9;
    case 11: return 8;
    case 10: return 7;
    case 9:  return 6;
    case 8:  return 5;
    case 7:  return 4;
    case 6:  return 3;
    case 5:  return 2;
    default: return -1;
  }
}

/**
 * Compare two played cards in the context of a trick.
 * Returns positive if `a` beats `b`, negative if `b` beats `a`, 0 if equal.
 *
 * Rules:
 * - Trump beats off-suit (trump only meaningful when trump has been established)
 * - Rook Bird beats all trump cards
 * - Must-follow: if a card is not trump AND not the lead color, it cannot win
 * - Lead color: the color of the first card played (null if ROOK was led)
 */
export function compareTrickCards(
  a: CardId,
  b: CardId,
  leadColor: Color | null,
  trump: Color | null,
): number {
  const aIsTrump = trump !== null && trumpRank(a, trump) >= 0;
  const bIsTrump = trump !== null && trumpRank(b, trump) >= 0;

  // Both trump — compare trump ranks
  if (aIsTrump && bIsTrump) {
    return trumpRank(a, trump!) - trumpRank(b, trump!);
  }

  // Only a is trump — a wins
  if (aIsTrump && !bIsTrump) return 1;

  // Only b is trump — b wins
  if (!aIsTrump && bIsTrump) return -1;

  // Neither is trump. Compare within lead color context.
  // A card can only win if it is the lead color (or ROOK, but ROOK is trump when trump is set).
  const aCard = a === "ROOK" ? null : cardFromId(a);
  const bCard = b === "ROOK" ? null : cardFromId(b);

  const aColor = aCard?.kind === "regular" ? aCard.color : null;
  const bColor = bCard?.kind === "regular" ? bCard.color : null;

  const aIsLeadColor = leadColor !== null && aColor === leadColor;
  const bIsLeadColor = leadColor !== null && bColor === leadColor;

  // If lead was ROOK (leadColor=null), any card could be played and first card wins ties
  if (leadColor === null) {
    // In a ROOK-led trick with no trump, compare off-suit ranks
    return offSuitRank(a) - offSuitRank(b);
  }

  if (aIsLeadColor && bIsLeadColor) {
    return offSuitRank(a) - offSuitRank(b);
  }

  if (aIsLeadColor && !bIsLeadColor) return 1;
  if (!aIsLeadColor && bIsLeadColor) return -1;

  // Neither follows lead — first played stays (b can't beat a, a can't beat b)
  // In practice, we return 0 here but the trick winner determination uses first card
  return 0;
}
