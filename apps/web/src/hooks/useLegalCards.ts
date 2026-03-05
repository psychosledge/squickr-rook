import { legalCommands } from "@rook/engine";
import type { GameState, Seat, CardId, PlayCard } from "@rook/engine";

export function useLegalCards(gameState: GameState | null, seat: Seat): CardId[] {
  if (!gameState) return [];
  return legalCommands(gameState, seat)
    .filter((c): c is PlayCard => c.type === "PlayCard")
    .map((c) => c.cardId);
}
