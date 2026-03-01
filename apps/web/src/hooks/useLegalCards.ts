import { useGameStore } from "@/store/gameStore";
import { legalCommands } from "@rook/engine";
import type { Seat, CardId } from "@rook/engine";

export function useLegalCards(seat: Seat): CardId[] {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState) return [];
  return legalCommands(gameState, seat)
    .filter((c) => c.type === "PlayCard")
    .map((c) => (c as { type: "PlayCard"; seat: Seat; cardId: CardId }).cardId);
}
