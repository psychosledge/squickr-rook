import { legalCommands } from "@rook/engine";
import type { GameState, Seat, CardId, PlayCard } from "@rook/engine";

export function useLegalCards(gameState: GameState | null, seat: Seat): CardId[] {
  if (!gameState) return [];
  if (gameState.activePlayer !== seat) return [];   // skip non-active seats (most opponent cases)
  if (gameState.hands[seat]?.some((c) => c === "??")) return [];  // skip masked opponent hands
  return legalCommands(gameState, seat)
    .filter((c): c is PlayCard => c.type === "PlayCard")
    .map((c) => c.cardId);
}
