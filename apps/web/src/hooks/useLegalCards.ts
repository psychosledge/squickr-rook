import { useGameStore } from "@/store/gameStore";
import { legalCommands } from "@rook/engine";
import type { Seat, CardId, PlayCard } from "@rook/engine";

export function useLegalCards(seat: Seat): CardId[] {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState) return [];
  return legalCommands(gameState, seat)
    .filter((c): c is PlayCard => c.type === "PlayCard")
    .map((c) => c.cardId);
}
