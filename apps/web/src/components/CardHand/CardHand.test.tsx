import { describe, it, expect, vi } from "vitest";
import React from "react";
import CardHand from "./CardHand";
import type { CardId } from "@rook/engine";

// Mock CSS modules
vi.mock("./CardHand.module.css", () => ({
  default: {
    hand: "hand",
  },
}));

// Mock PlayingCard so we don't need the full card display chain
vi.mock("@/components/PlayingCard/PlayingCard", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("div", { "data-card-id": props.cardId }),
}));

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/**
 * Collect the React element children directly from a container's children prop.
 * This is needed to access `.key` on the mapped PlayingCard elements,
 * since React stores `key` on the element object (not in `props`).
 */
function getDirectChildren(
  node: React.ReactNode
): React.ReactElement[] {
  if (!React.isValidElement(node)) return [];
  const p = (node as React.ReactElement).props as Record<string, unknown>;
  const children = p.children;
  if (children == null) return [];
  if (Array.isArray(children)) {
    return children.filter(React.isValidElement) as React.ReactElement[];
  }
  if (React.isValidElement(children)) return [children as React.ReactElement];
  return [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CardHand — key uniqueness", () => {
  it("all PlayingCard elements have unique keys for a masked hand (['??','??','??','??'])", () => {
    // Arrange: masked opponent hand — 4 identical card IDs
    const maskedHand: CardId[] = ["??", "??", "??", "??"] as CardId[];
    const element = CardHand({ cards: maskedHand, faceDown: true });

    // Act: collect the direct children of the wrapper div (the mapped PlayingCards)
    const children = getDirectChildren(element);

    // Assert: all keys must be unique
    const keys = children.map((el) => el.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(children.length);
  });

  it("renders the correct number of cards for a masked hand (['??','??','??','??'])", () => {
    // Arrange
    const maskedHand: CardId[] = ["??", "??", "??", "??"] as CardId[];
    const element = CardHand({ cards: maskedHand, faceDown: true });

    // Act
    const children = getDirectChildren(element);

    // Assert
    expect(children).toHaveLength(4);
  });

  it("renders the correct number of cards for a face-up hand with unique IDs (regression guard)", () => {
    // Arrange: normal face-up hand
    const hand: CardId[] = ["R5", "G7", "B10", "Y3"] as CardId[];
    const element = CardHand({ cards: hand, faceDown: false });

    // Act
    const children = getDirectChildren(element);

    // Assert
    expect(children).toHaveLength(4);
  });

  it("all PlayingCard elements have unique keys for a face-up hand", () => {
    // Arrange
    const hand: CardId[] = ["R5", "G7", "B10", "Y3"] as CardId[];
    const element = CardHand({ cards: hand, faceDown: false });

    // Act
    const children = getDirectChildren(element);
    const keys = children.map((el) => el.key);
    const uniqueKeys = new Set(keys);

    // Assert
    expect(uniqueKeys.size).toBe(children.length);
  });
});
