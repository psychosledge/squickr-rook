import { describe, it, expect, vi } from "vitest";
import React from "react";
import PlayerSeat from "./PlayerSeat";

// Mock the useLegalCards hook — now accepts (gameState, seat) signature
vi.mock("@/hooks/useLegalCards", () => ({
  useLegalCards: (_gameState: unknown, _seat: unknown) => [],
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
    diffBadge: "diffBadge",
    bidDisplay: "bidDisplay",
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
  gameState: null as import("@rook/engine").GameState | null,
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

  describe("legalCardIds prop passed to CardHand", () => {
    it("passes legalCardIds=undefined to CardHand when faceDown=false, phase='playing', and onCardClick is undefined (not your turn — cards fully visible)", () => {
      // faceDown=false, phase=playing, no onCardClick → legalCardIds should be undefined (not your turn, show all cards)
      const element = PlayerSeat({ ...baseProps, faceDown: false, phase: "playing", onCardClick: undefined });
      const elements = flattenElements(element);

      // Find the CardHand element (its type will be the CardHand function)
      const cardHandEls = elements.filter((el) => {
        // CardHand is rendered inside a div.handWrap; detect it by the legalCardIds prop being present or as an array
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      expect(props.legalCardIds).toBeUndefined();
    });

    it("passes legalCardIds (from useLegalCards) to CardHand when faceDown=false, phase='playing', and onCardClick is provided (your turn)", () => {
      // faceDown=false, phase=playing, onCardClick present → legalCardIds should be the hook result ([] from mock)
      const element = PlayerSeat({ ...baseProps, faceDown: false, phase: "playing", onCardClick: vi.fn() });
      const elements = flattenElements(element);

      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      // useLegalCards mock returns [] — the important thing is it's passed through (not undefined)
      expect(Array.isArray(props.legalCardIds)).toBe(true);
    });

    it("passes legalCardIds=undefined to CardHand when faceDown=true (face-down, playability irrelevant)", () => {
      // faceDown=true → legalCardIds should be undefined regardless of onCardClick
      const element = PlayerSeat({ ...baseProps, faceDown: true, onCardClick: vi.fn() });
      const elements = flattenElements(element);

      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      expect(props.legalCardIds).toBeUndefined();
    });

    it("passes legalCardIds=undefined to CardHand when faceDown=false and phase='bidding' (cards visible, not dimmed)", () => {
      // Bug 2 fix: during bidding phase, cards must NOT be dimmed regardless of onCardClick
      const element = PlayerSeat({ ...baseProps, faceDown: false, phase: "bidding", onCardClick: undefined });
      const elements = flattenElements(element);

      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      expect(props.legalCardIds).toBeUndefined();
    });

    it("passes legalCardIds=undefined to CardHand when faceDown=false and phase='nest' (cards visible)", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: false, phase: "nest", onCardClick: undefined });
      const elements = flattenElements(element);

      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      expect(props.legalCardIds).toBeUndefined();
    });

    it("passes legalCardIds=undefined to CardHand when faceDown=false and phase='trump' (cards visible)", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: false, phase: "trump", onCardClick: undefined });
      const elements = flattenElements(element);

      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "legalCardIds" in p;
      });

      expect(cardHandEls).toHaveLength(1);
      const props = cardHandEls[0].props as Record<string, unknown>;
      expect(props.legalCardIds).toBeUndefined();
    });
  });

  describe("gameState prop (Bug 1: useLegalCards accepts gameState parameter)", () => {
    it("accepts gameState=null without error", () => {
      // Should render without throwing — useLegalCards(null, seat) returns []
      const element = PlayerSeat({ ...baseProps, gameState: null });
      expect(element).not.toBeNull();
    });

    it("accepts gameState as a non-null object without error", () => {
      const minimalGameState = {
        phase: "playing",
        activePlayer: "S",
        hands: { N: [], E: [], S: [], W: [] },
      } as unknown as import("@rook/engine").GameState;
      const element = PlayerSeat({ ...baseProps, gameState: minimalGameState });
      expect(element).not.toBeNull();
    });
  });

  describe("hand always rendered", () => {
    it("CardHand is present when faceDown=true and position='top'", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: true, position: "top" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
    });

    it("CardHand is present when faceDown=true and position='left'", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: true, position: "left" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
    });

    it("CardHand is present when faceDown=true and position='right'", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: true, position: "right" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
    });

    it("CardHand is present when faceDown=false and position='bottom'", () => {
      const element = PlayerSeat({ ...baseProps, faceDown: false, position: "bottom" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
    });
  });

  describe("orientation passed to CardHand", () => {
    it("passes orientation='horizontal' when position='top'", () => {
      const element = PlayerSeat({ ...baseProps, position: "top" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).orientation).toBe("horizontal");
    });

    it("passes orientation='horizontal' when position='bottom'", () => {
      const element = PlayerSeat({ ...baseProps, position: "bottom" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).orientation).toBe("horizontal");
    });

    it("passes orientation='horizontal' when position is undefined", () => {
      const element = PlayerSeat({ ...baseProps });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).orientation).toBe("horizontal");
    });

    it("passes orientation='vertical' when position='left'", () => {
      const element = PlayerSeat({ ...baseProps, position: "left" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).orientation).toBe("vertical");
    });

    it("passes orientation='vertical' when position='right'", () => {
      const element = PlayerSeat({ ...baseProps, position: "right" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).orientation).toBe("vertical");
    });
  });

  describe("no rotation class applied to handWrap for side seats", () => {
    it("handWrap div does NOT have a rotate style for position='left'", () => {
      const element = PlayerSeat({ ...baseProps, position: "left" });
      const elements = flattenElements(element);
      const handWraps = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "div" && typeof p.className === "string" && p.className.includes("handWrap");
      });
      expect(handWraps).toHaveLength(1);
      // No inline rotation style should be applied
      const style = (handWraps[0].props as Record<string, unknown>).style as React.CSSProperties | undefined;
      expect(style?.transform).toBeUndefined();
    });

    it("handWrap div does NOT have a rotate style for position='right'", () => {
      const element = PlayerSeat({ ...baseProps, position: "right" });
      const elements = flattenElements(element);
      const handWraps = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "div" && typeof p.className === "string" && p.className.includes("handWrap");
      });
      expect(handWraps).toHaveLength(1);
      const style = (handWraps[0].props as Record<string, unknown>).style as React.CSSProperties | undefined;
      expect(style?.transform).toBeUndefined();
    });
  });

  describe("size passed to CardHand", () => {
    it("passes size='sm' when position='top'", () => {
      const element = PlayerSeat({ ...baseProps, position: "top" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).size).toBe("sm");
    });

    it("passes size='sm' when position='left'", () => {
      const element = PlayerSeat({ ...baseProps, position: "left" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).size).toBe("sm");
    });

    it("passes size='sm' when position='right'", () => {
      const element = PlayerSeat({ ...baseProps, position: "right" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).size).toBe("sm");
    });

    it("passes size='normal' when position='bottom'", () => {
      const element = PlayerSeat({ ...baseProps, position: "bottom" });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).size).toBe("normal");
    });

    it("passes size='normal' when position is undefined", () => {
      const element = PlayerSeat({ ...baseProps });
      const elements = flattenElements(element);
      const cardHandEls = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return "orientation" in p;
      });
      expect(cardHandEls).toHaveLength(1);
      expect((cardHandEls[0].props as Record<string, unknown>).size).toBe("normal");
    });
  });

  describe("bidDisplay prop", () => {
    it("renders a bidDisplay chip when bidDisplay is provided", () => {
      const element = PlayerSeat({ ...baseProps, bidDisplay: "115" });
      const elements = flattenElements(element);
      const chips = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("bidDisplay");
      });
      expect(chips).toHaveLength(1);
      expect((chips[0].props as Record<string, unknown>).children).toBe("115");
    });

    it("does NOT render a bidDisplay chip when bidDisplay is undefined", () => {
      const element = PlayerSeat(baseProps);
      const elements = flattenElements(element);
      const chips = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("bidDisplay");
      });
      expect(chips).toHaveLength(0);
    });

    it("sets data-passed='true' when bidDisplay='PASS'", () => {
      const element = PlayerSeat({ ...baseProps, bidDisplay: "PASS" });
      const elements = flattenElements(element);
      const chips = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("bidDisplay");
      });
      expect(chips).toHaveLength(1);
      expect((chips[0].props as Record<string, unknown>)["data-passed"]).toBe("true");
    });

    it("sets data-thinking='true' when bidDisplay='…'", () => {
      const element = PlayerSeat({ ...baseProps, bidDisplay: "…" });
      const elements = flattenElements(element);
      const chips = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("bidDisplay");
      });
      expect(chips).toHaveLength(1);
      expect((chips[0].props as Record<string, unknown>)["data-thinking"]).toBe("true");
    });

    it("does NOT set data-passed or data-thinking for a numeric bid", () => {
      const element = PlayerSeat({ ...baseProps, bidDisplay: "115" });
      const elements = flattenElements(element);
      const chips = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return el.type === "span" && typeof p.className === "string" && p.className.includes("bidDisplay");
      });
      expect(chips).toHaveLength(1);
      const p = chips[0].props as Record<string, unknown>;
      expect(p["data-passed"]).toBeUndefined();
      expect(p["data-thinking"]).toBeUndefined();
    });
  });

  describe("difficultyLabel badge", () => {
    it("renders a diffBadge when difficultyLabel is provided and position is not 'bottom'", () => {
      const element = PlayerSeat({ ...baseProps, position: "top", difficultyLabel: "Lvl 3" });
      const elements = flattenElements(element);

      const badges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("diffBadge")
        );
      });

      expect(badges).toHaveLength(1);
      expect((badges[0].props as Record<string, unknown>).children).toBe("Lvl 3");
    });

    it("renders a diffBadge when position='left' and difficultyLabel is provided", () => {
      const element = PlayerSeat({ ...baseProps, position: "left", difficultyLabel: "Lvl 5" });
      const elements = flattenElements(element);

      const badges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("diffBadge")
        );
      });

      expect(badges).toHaveLength(1);
      expect((badges[0].props as Record<string, unknown>).children).toBe("Lvl 5");
    });

    it("does NOT render a diffBadge when position='bottom', even if difficultyLabel is provided", () => {
      const element = PlayerSeat({ ...baseProps, position: "bottom", difficultyLabel: "Lvl 3" });
      const elements = flattenElements(element);

      const badges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("diffBadge")
        );
      });

      expect(badges).toHaveLength(0);
    });

    it("does NOT render a diffBadge when difficultyLabel is not provided", () => {
      const element = PlayerSeat({ ...baseProps, position: "top" });
      const elements = flattenElements(element);

      const badges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("diffBadge")
        );
      });

      expect(badges).toHaveLength(0);
    });

    it("does NOT render a diffBadge when position is undefined (treated as non-bottom, but no label provided)", () => {
      // no difficultyLabel → no badge
      const element = PlayerSeat({ ...baseProps });
      const elements = flattenElements(element);

      const badges = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          el.type === "span" &&
          typeof p.className === "string" &&
          p.className.includes("diffBadge")
        );
      });

      expect(badges).toHaveLength(0);
    });
  });
});
