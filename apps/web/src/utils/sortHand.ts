import { cardFromId, offSuitRank } from "@rook/engine";
import type { CardId, Color } from "@rook/engine";

/** Color display order when no trump (or for non-trump groups with trump). */
const COLOR_ORDER: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Sort a hand of cards for display.
 *
 * Sort order:
 * - Trump group first (if trump is known), then remaining colors: Black → Red → Green → Yellow
 * - Within each group: strongest first by offSuitRank descending (1, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5)
 * - Rook: at end of trump group (if trump known), or at very end of hand (if trump unknown)
 */
export function sortHand(cards: CardId[], trump: Color | null): CardId[] {
  if (cards.length === 0) return [];

  // Separate Rook from regular cards
  const rook = cards.filter((id) => id === "ROOK");
  const regular = cards.filter((id) => id !== "ROOK");

  // Group regular cards by color
  const groups: Map<Color, CardId[]> = new Map();
  for (const color of COLOR_ORDER) {
    groups.set(color, []);
  }
  for (const cardId of regular) {
    const card = cardFromId(cardId);
    if (card.kind === "regular") {
      groups.get(card.color)!.push(cardId);
    }
  }

  // Sort within each color group: descending offSuitRank (strongest first)
  for (const [, group] of groups) {
    group.sort((a, b) => offSuitRank(b) - offSuitRank(a));
  }

  // Build the final sorted array
  const result: CardId[] = [];

  if (trump !== null) {
    // Trump group first (regular trump cards, strongest first)
    const trumpGroup = groups.get(trump) ?? [];
    result.push(...trumpGroup);
    // Rook goes at end of trump group
    result.push(...rook);

    // Remaining colors in order: Black → Red → Green → Yellow, skipping trump
    for (const color of COLOR_ORDER) {
      if (color === trump) continue;
      result.push(...(groups.get(color) ?? []));
    }
  } else {
    // No trump: Black → Red → Green → Yellow, Rook at very end
    for (const color of COLOR_ORDER) {
      result.push(...(groups.get(color) ?? []));
    }
    result.push(...rook);
  }

  return result;
}
