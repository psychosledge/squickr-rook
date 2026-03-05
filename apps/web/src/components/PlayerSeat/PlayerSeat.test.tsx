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
    dealerBadge: "dealerBadge",
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
  describe("dealer badge", () => {
    it("renders a dealer badge when isDealer is true", () => {
      const element = PlayerSeat({ ...baseProps, isDealer: true });
      const elements = flattenElements(element);

      const dealerBadges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("dealerBadge")
        );
      });

      expect(dealerBadges).toHaveLength(1);
      expect((dealerBadges[0].props as Record<string, unknown>).children).toBe("D");
    });

    it("does not render a dealer badge when isDealer is false", () => {
      const element = PlayerSeat({ ...baseProps, isDealer: false });
      const elements = flattenElements(element);

      const dealerBadges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("dealerBadge")
        );
      });

      expect(dealerBadges).toHaveLength(0);
    });

    it("does not render a dealer badge when isDealer is omitted", () => {
      const element = PlayerSeat(baseProps);
      const elements = flattenElements(element);

      const dealerBadges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("dealerBadge")
        );
      });

      expect(dealerBadges).toHaveLength(0);
    });
  });

  describe("displayName prop", () => {
    it("uses displayName as the label when provided", () => {
      const element = PlayerSeat({ ...baseProps, displayName: "Alice" });
      const elements = flattenElements(element);

      const nameSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("name")
        );
      });

      expect(nameSpans).toHaveLength(1);
      expect((nameSpans[0].props as Record<string, unknown>).children).toBe("Alice");
    });

    it("falls back to getSeatLabel when displayName is not provided", () => {
      const element = PlayerSeat({ ...baseProps }); // seat = "S"
      const elements = flattenElements(element);

      const nameSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("name")
        );
      });

      expect(nameSpans).toHaveLength(1);
      // getSeatLabel("S") returns "P3"
      expect((nameSpans[0].props as Record<string, unknown>).children).toBe("P3");
    });
  });

  describe("data-face-down attribute", () => {
    it("sets data-face-down='true' on the seat div when faceDown is true", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: true });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-face-down"]).toBe("true");
    });

    it("does not set data-face-down when faceDown is false", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: false });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-face-down"]).toBeUndefined();
    });
  });

  describe("data-position attribute", () => {
    it("sets data-position on the seat div when position prop is provided", () => {
      const element = PlayerSeat({ ...baseProps, position: "bottom" });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-position"]).toBe("bottom");
    });

    it("sets data-position='top' when position='top'", () => {
      const element = PlayerSeat({ ...baseProps, position: "top" });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-position"]).toBe("top");
    });

    it("sets data-position='left' when position='left'", () => {
      const element = PlayerSeat({ ...baseProps, position: "left" });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-position"]).toBe("left");
    });

    it("sets data-position='right' when position='right'", () => {
      const element = PlayerSeat({ ...baseProps, position: "right" });
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-position"]).toBe("right");
    });

    it("does not set data-position when position is omitted", () => {
      const element = PlayerSeat(baseProps);
      const seatDiv = element as React.ReactElement;
      const p = seatDiv.props as Record<string, unknown>;
      expect(p["data-position"]).toBeUndefined();
    });
  });

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
