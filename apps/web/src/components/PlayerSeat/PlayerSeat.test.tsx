import { describe, it, expect, vi } from "vitest";
import React from "react";
import PlayerSeat from "./PlayerSeat";

// Mock the useLegalCards hook — it depends on Zustand store
vi.mock("@/hooks/useLegalCards", () => ({
  useLegalCards: () => [],
}));

// Mock CSS modules — Vitest doesn't process them by default
vi.mock("./PlayerSeat.module.css", () => ({
  default: {
    seat: "seat",
    active: "active",
    nameRow: "nameRow",
    name: "name",
    indicator: "indicator",
    bidBadge: "bidBadge",
    handWrap: "handWrap",
  },
}));

// Helper: flatten a React element tree into an array of all elements (depth-first)
function flattenElements(node: React.ReactNode): React.ReactElement[] {
  if (node == null || typeof node !== "object") return [];
  if (!React.isValidElement(node)) return [];

  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];

  return [el, ...childNodes.flatMap(flattenElements)];
}

const baseProps = {
  seat: "S" as const,
  cards: ["R5", "G7", "B10"] as import("@rook/engine").CardId[],
  faceDown: true,
  isActive: false,
  phase: "bidding" as import("@rook/engine").GamePhase,
};

describe("PlayerSeat", () => {
  describe("card count display", () => {
    it("does not render a count span for a face-down player", () => {
      const element = PlayerSeat(baseProps);
      const elements = flattenElements(element);

      const countSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("count");
      });

      expect(countSpans).toHaveLength(0);
    });

    // Separate case: the old code conditionally rendered the count only when
    // cards.length > 0 was truthy — verify removal holds for a non-empty hand too.
    it("does not render a count span when the face-down hand is non-empty", () => {
      const element = PlayerSeat({ ...baseProps, cards: ["R5", "G7", "B10", "Y1"] as import("@rook/engine").CardId[] });
      const elements = flattenElements(element);

      const countSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("count");
      });

      expect(countSpans).toHaveLength(0);
    });
  });
});
