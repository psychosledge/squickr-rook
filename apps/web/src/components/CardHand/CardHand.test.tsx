import { describe, it, expect, vi } from "vitest";
import React from "react";
import CardHand from "./CardHand";
import type { CardId } from "@rook/engine";

// Mock CSS modules
vi.mock("./CardHand.module.css", () => ({
  default: {
    hand: "hand",
    vertical: "vertical",
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

// ---------------------------------------------------------------------------
// Helpers for new tests
// ---------------------------------------------------------------------------

const testHand: CardId[] = ["R5", "G7", "B10"] as CardId[];

function getHandElement(node: React.ReactNode): React.ReactElement {
  if (!React.isValidElement(node)) throw new Error("Not a valid element");
  return node as React.ReactElement;
}

// ---------------------------------------------------------------------------
// Tests: orientation prop
// ---------------------------------------------------------------------------

describe("CardHand — orientation prop", () => {
  it("does NOT apply 'vertical' class when orientation='horizontal'", () => {
    const element = CardHand({ cards: testHand, faceDown: false, orientation: "horizontal" });
    const handEl = getHandElement(element);
    const className = (handEl.props as Record<string, unknown>).className as string;
    expect(className).not.toContain("vertical");
  });

  it("does NOT apply 'vertical' class when orientation is omitted", () => {
    const element = CardHand({ cards: testHand, faceDown: false });
    const handEl = getHandElement(element);
    const className = (handEl.props as Record<string, unknown>).className as string;
    expect(className).not.toContain("vertical");
  });

  it("applies 'vertical' class when orientation='vertical'", () => {
    const element = CardHand({ cards: testHand, faceDown: false, orientation: "vertical" });
    const handEl = getHandElement(element);
    const className = (handEl.props as Record<string, unknown>).className as string;
    expect(className).toContain("vertical");
  });
});

// ---------------------------------------------------------------------------
// Tests: size prop passthrough
// ---------------------------------------------------------------------------

describe("CardHand — size prop passthrough", () => {
  it("passes size='sm' to all PlayingCard children when size='sm'", () => {
    const element = CardHand({ cards: testHand, faceDown: false, size: "sm" });
    const children = getDirectChildren(element);
    const sizes = children.map((el) => (el.props as Record<string, unknown>)["size"]);
    expect(sizes).toHaveLength(3);
    sizes.forEach((s) => expect(s).toBe("sm"));
  });

  it("passes size='normal' to all PlayingCard children when size='normal'", () => {
    const element = CardHand({ cards: testHand, faceDown: false, size: "normal" });
    const children = getDirectChildren(element);
    const sizes = children.map((el) => (el.props as Record<string, unknown>)["size"]);
    expect(sizes).toHaveLength(3);
    sizes.forEach((s) => expect(s).toBe("normal"));
  });

  it("passes undefined to all PlayingCard children when size is omitted", () => {
    const element = CardHand({ cards: testHand, faceDown: false });
    const children = getDirectChildren(element);
    const sizes = children.map((el) => (el.props as Record<string, unknown>)["size"]);
    expect(sizes).toHaveLength(3);
    sizes.forEach((s) => expect(s).toBeUndefined());
  });
});
