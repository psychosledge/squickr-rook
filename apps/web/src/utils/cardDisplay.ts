import { cardFromId } from "@rook/engine";
import type { CardId } from "@rook/engine";

export type CardDisplayInfo = {
  label: string;
  colorName: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
};

const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
  Black:  { bg: "#2d2d2d", border: "#777",    text: "#ffffff" },
  Red:    { bg: "#c0392b", border: "#e74c3c", text: "#ffffff" },
  Green:  { bg: "#1e8449", border: "#27ae60", text: "#ffffff" },
  Yellow: { bg: "#d68910", border: "#f1c40f", text: "#1a1a2e" },
  Rook:   { bg: "#6c3483", border: "#9b59b6", text: "#ffffff" },
};

export function getCardDisplay(cardId: CardId): CardDisplayInfo {
  if (cardId === "ROOK") {
    const c = COLOR_MAP["Rook"]!;
    return { label: "RK", colorName: "Rook", bgColor: c.bg, borderColor: c.border, textColor: c.text };
  }
  const card = cardFromId(cardId);
  if (card.kind !== "regular") {
    return { label: "?", colorName: "Unknown", bgColor: "#333", borderColor: "#555", textColor: "#fff" };
  }
  const c = COLOR_MAP[card.color] ?? COLOR_MAP["Black"]!;
  return {
    label: String(card.value),
    colorName: card.color,
    bgColor: c.bg,
    borderColor: c.border,
    textColor: c.text,
  };
}
