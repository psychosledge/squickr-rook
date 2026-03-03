import { describe, it, expect, vi } from "vitest";
import React from "react";
import CurrentTrick from "./CurrentTrick";
import type { PlayedCard, Color } from "@rook/engine";

// Mock CSS modules
vi.mock("./CurrentTrick.module.css", () => ({
  default: {
    trick: "trick",
    play: "play",
    placeholder: "placeholder",
    seatLabel: "seatLabel",
  },
}));

// Mock PlayingCard so we don't need the full card display chain
vi.mock("@/components/PlayingCard/PlayingCard", () => ({
  default: ({
    cardId,
    isDisplay,
    isPlayable,
  }: {
    cardId: string;
    isDisplay?: boolean;
    isPlayable?: boolean;
  }) => (
    <div
      data-testid={`playing-card-${cardId}`}
      data-card-id={cardId}
      data-is-display={isDisplay ? "true" : undefined}
      data-is-playable={isPlayable === false ? "false" : undefined}
    />
  ),
}));

// Mock seatLabel utility
vi.mock("@/utils/seatLabel", () => ({
  getSeatLabel: (seat: string) => `Label-${seat}`,
}));

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect every React element AND every string from the node tree.
 * Handles:
 *  - null / undefined / booleans (skipped)
 *  - plain strings (added to strings list)
 *  - React elements (added to elements list, then their children are visited)
 *  - plain arrays (each item visited)
 */
function collectTree(node: React.ReactNode): {
  elements: React.ReactElement[];
  strings: string[];
} {
  const elements: React.ReactElement[] = [];
  const strings: string[] = [];

  function visit(n: React.ReactNode) {
    if (n == null || typeof n === "boolean") return;

    if (typeof n === "string") {
      strings.push(n);
      return;
    }

    if (typeof n === "number") {
      strings.push(String(n));
      return;
    }

    // Plain array (e.g. from .map())
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }

    if (!React.isValidElement(n)) return;

    const el = n as React.ReactElement;
    elements.push(el);

    const p = el.props as Record<string, unknown>;
    const childrenProp = p.children as React.ReactNode | undefined;
    visit(childrenProp);
  }

  visit(node);
  return { elements, strings };
}

/** Find a slot by its data-seat prop */
function findSlotBySeat(
  elements: React.ReactElement[],
  seat: string
): React.ReactElement | undefined {
  return elements.find((el) => {
    const p = el.props as Record<string, unknown>;
    return p["data-seat"] === seat;
  });
}

/** Find the info/center cell by data-testid="trick-info" */
function findInfoCell(
  elements: React.ReactElement[]
): React.ReactElement | undefined {
  return elements.find((el) => {
    const p = el.props as Record<string, unknown>;
    return p["data-testid"] === "trick-info";
  });
}

/** Check whether any child of a slot contains a PlayingCard (has a 'cardId' prop) */
function slotHasCard(slot: React.ReactElement): boolean {
  const { elements } = collectTree(slot);
  return elements.some((el) => {
    const p = el.props as Record<string, unknown>;
    // PlayingCard elements will have a `cardId` prop
    return "cardId" in p;
  });
}

/** Collect all text inside a node (including fragmented JSX children) */
function collectText(node: React.ReactNode): string {
  const { strings } = collectTree(node);
  return strings.join("");
}

const ALL_SEATS = ["S", "E", "W", "N"] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CurrentTrick — spatial 3×3 grid layout", () => {
  describe("grid-area slot mapping", () => {
    it("renders a slot for the S seat with grid-area 'top' when S has played", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);
      const slot = findSlotBySeat(elements, "S");

      expect(slot).toBeDefined();
      const p = slot!.props as Record<string, unknown>;
      const style = p.style as Record<string, unknown> | undefined;
      expect(style?.gridArea).toBe("top");
    });

    it("renders a slot for the E seat with grid-area 'left' when E has played", () => {
      const trick: PlayedCard[] = [{ seat: "E", cardId: "G7" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);
      const slot = findSlotBySeat(elements, "E");

      expect(slot).toBeDefined();
      const p = slot!.props as Record<string, unknown>;
      const style = p.style as Record<string, unknown> | undefined;
      expect(style?.gridArea).toBe("left");
    });

    it("renders a slot for the W seat with grid-area 'right' when W has played", () => {
      const trick: PlayedCard[] = [{ seat: "W", cardId: "B10" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);
      const slot = findSlotBySeat(elements, "W");

      expect(slot).toBeDefined();
      const p = slot!.props as Record<string, unknown>;
      const style = p.style as Record<string, unknown> | undefined;
      expect(style?.gridArea).toBe("right");
    });

    it("renders a slot for the N seat with grid-area 'bottom' when N has played", () => {
      const trick: PlayedCard[] = [{ seat: "N", cardId: "Y1" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);
      const slot = findSlotBySeat(elements, "N");

      expect(slot).toBeDefined();
      const p = slot!.props as Record<string, unknown>;
      const style = p.style as Record<string, unknown> | undefined;
      expect(style?.gridArea).toBe("bottom");
    });
  });

  describe("empty seat placeholders", () => {
    it("always renders all 4 seat slots, even when trick is empty", () => {
      const element = CurrentTrick({ trick: [], trump: null });
      const { elements } = collectTree(element);

      for (const seat of ALL_SEATS) {
        const slot = findSlotBySeat(elements, seat);
        expect(slot).toBeDefined();
      }
    });

    it("renders all 4 seat slots when only one seat has played", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      for (const seat of ALL_SEATS) {
        const slot = findSlotBySeat(elements, seat);
        expect(slot).toBeDefined();
      }
    });

    it("seat slots without a played card do not contain a PlayingCard", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      // E, W, N should have NO card
      for (const seat of ["E", "W", "N"] as const) {
        const slot = findSlotBySeat(elements, seat);
        expect(slot).toBeDefined();
        expect(slotHasCard(slot!)).toBe(false);
      }
    });

    it("seat slots with a played card do contain a PlayingCard", () => {
      const trick: PlayedCard[] = [
        { seat: "S", cardId: "R5" },
        { seat: "N", cardId: "G7" },
      ];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      for (const seat of ["S", "N"] as const) {
        const slot = findSlotBySeat(elements, seat);
        expect(slot).toBeDefined();
        expect(slotHasCard(slot!)).toBe(true);
      }
    });

    it("played cards in the trick are rendered with isDisplay=true (Bug 1 fix)", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      // Find the PlayingCard element for R5 — in the React element tree,
      // it has a `cardId` prop (not yet rendered by mock)
      const card = elements.find((el) => {
        const p = el.props as Record<string, unknown>;
        return p["cardId"] === "R5";
      });

      expect(card).toBeDefined();
      const p = card!.props as Record<string, unknown>;
      expect(p["isDisplay"]).toBe(true);
    });
  });

  describe("center info cell — removed (Bug 2 fix)", () => {
    it("does NOT render the trick-info cell (center info removed)", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const trump: Color = "Red";
      const element = CurrentTrick({ trick, trump });
      const { elements } = collectTree(element);
      const info = findInfoCell(elements);

      expect(info).toBeUndefined();
    });

    it("does NOT show trump text in the center area", () => {
      const trump: Color = "Black";
      const element = CurrentTrick({ trick: [], trump });
      const { strings } = collectTree(element);
      // No string should contain "Trump:" prefix
      const hasTrumpLabel = strings.some((s) => s.includes("Trump:"));
      expect(hasTrumpLabel).toBe(false);
    });

    it("does NOT show 'Waiting...' text when trick is empty and no trump", () => {
      const element = CurrentTrick({ trick: [], trump: null });
      const { strings } = collectTree(element);
      const hasWaiting = strings.some((s) => s.includes("Waiting"));
      expect(hasWaiting).toBe(false);
    });
  });

  describe("center info cell — empty state", () => {
    it("does NOT render an info cell when trick is empty", () => {
      const element = CurrentTrick({ trick: [], trump: null });
      const { elements } = collectTree(element);
      const info = findInfoCell(elements);

      expect(info).toBeUndefined();
    });
  });

  describe("accessibility — seat labels", () => {
    it("renders a seat label for played cards", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      // There should be at least one element with the seatLabel class for seat S
      const labels = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        if (typeof p.className !== "string") return false;
        if (!p.className.includes("seatLabel")) return false;
        // The text content should mention "S"
        const text = collectText(el);
        return text.includes("S");
      });
      expect(labels.length).toBeGreaterThan(0);
    });

    it("seat label span does NOT have an aria-label attribute", () => {
      const trick: PlayedCard[] = [{ seat: "S", cardId: "R5" }];
      const element = CurrentTrick({ trick, trump: null });
      const { elements } = collectTree(element);

      // Find all seatLabel spans
      const labelSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          typeof p.className === "string" && p.className.includes("seatLabel")
        );
      });

      expect(labelSpans.length).toBeGreaterThan(0);
      for (const span of labelSpans) {
        const p = span.props as Record<string, unknown>;
        expect(p["aria-label"]).toBeUndefined();
      }
    });
  });

  describe("accessibility — root region landmark", () => {
    it("root div has role='region'", () => {
      const element = CurrentTrick({ trick: [], trump: null });
      // The root element itself is the first valid element returned
      expect(element).toBeDefined();
      const p = (element as React.ReactElement).props as Record<string, unknown>;
      expect(p.role).toBe("region");
    });

    it("root div has aria-label='Current trick'", () => {
      const element = CurrentTrick({ trick: [], trump: null });
      expect(element).toBeDefined();
      const p = (element as React.ReactElement).props as Record<string, unknown>;
      expect(p["aria-label"]).toBe("Current trick");
    });
  });
});
