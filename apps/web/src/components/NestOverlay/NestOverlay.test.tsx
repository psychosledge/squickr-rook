import { describe, it, expect, vi } from "vitest";
import React from "react";
import NestOverlay from "./NestOverlay";
import type { CardId } from "@rook/engine";

// Mock CSS modules
vi.mock("./NestOverlay.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    title: "title",
    infoRow: "infoRow",
    subtitle: "subtitle",
    hand: "hand",
    confirmBtn: "confirmBtn",
    ready: "ready",
  },
}));

// Mock PlayingCard so we can inspect props passed to it
vi.mock("@/components/PlayingCard/PlayingCard", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-card-id": props.cardId,
      "data-is-from-nest": String(props.isFromNest ?? false),
      "data-is-selected": String(props.isSelected ?? false),
    }),
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as HandHistoryTable tests)
// ---------------------------------------------------------------------------

function collectTree(node: React.ReactNode): {
  elements: React.ReactElement[];
  strings: string[];
} {
  const elements: React.ReactElement[] = [];
  const strings: string[] = [];

  function visit(n: React.ReactNode) {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string") { strings.push(n); return; }
    if (typeof n === "number") { strings.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (!React.isValidElement(n)) return;
    const el = n as React.ReactElement;
    elements.push(el);
    const p = el.props as Record<string, unknown>;
    visit(p.children as React.ReactNode);
  }

  visit(node);
  return { elements, strings };
}

function flattenText(node: React.ReactNode): string {
  return collectTree(node).strings.join("");
}

function findByType(
  elements: React.ReactElement[],
  type: string
): React.ReactElement[] {
  return elements.filter((el) => el.type === type);
}

function findByClass(
  elements: React.ReactElement[],
  classMatch: string,
  exact = false
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    if (typeof p.className !== "string") return false;
    return exact ? p.className === classMatch : p.className.includes(classMatch);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HAND: CardId[] = ["R5", "G7", "B10", "Y3", "R12"];
const NEST_CARD: CardId = "G7"; // one card from the nest that's also in hand

function makeProps(overrides: Partial<Parameters<typeof NestOverlay>[0]> = {}) {
  return {
    hand: HAND,
    pendingDiscards: [] as CardId[],
    nestCardIds: [] as CardId[],
    bidAmount: 120,
    shotMoon: false,
    onToggleDiscard: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — nestCardIds prop (parallel feature)
// ---------------------------------------------------------------------------

describe("NestOverlay — nestCardIds prop", () => {
  it("passes isFromNest=true to a card that is in nestCardIds", () => {
    const tree = NestOverlay(makeProps({ nestCardIds: [NEST_CARD] }));
    const { elements } = collectTree(tree);
    // NestOverlay uses JSX: <PlayingCard cardId={...} isFromNest={...} />
    // These are React elements with the real prop names (not data-* attrs)
    const nestCardEl = elements.find(
      (el) =>
        (el.props as Record<string, unknown>).cardId === NEST_CARD
    );
    expect(nestCardEl).toBeDefined();
    expect((nestCardEl!.props as Record<string, unknown>).isFromNest).toBe(true);
  });

  it("passes isFromNest=false to a card that is NOT in nestCardIds", () => {
    const nonNestCard: CardId = "R5";
    const tree = NestOverlay(makeProps({ nestCardIds: [NEST_CARD] }));
    const { elements } = collectTree(tree);
    const nonNestCardEl = elements.find(
      (el) =>
        (el.props as Record<string, unknown>).cardId === nonNestCard
    );
    expect(nonNestCardEl).toBeDefined();
    expect((nonNestCardEl!.props as Record<string, unknown>).isFromNest).toBe(false);
  });

  it("passes isFromNest=false to all cards when nestCardIds is empty", () => {
    const tree = NestOverlay(makeProps({ nestCardIds: [] }));
    const { elements } = collectTree(tree);
    const cardEls = elements.filter(
      (el) => (el.props as Record<string, unknown>).cardId !== undefined
    );
    const anyNest = cardEls.some(
      (el) => (el.props as Record<string, unknown>).isFromNest === true
    );
    expect(anyNest).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — confirm button state
// ---------------------------------------------------------------------------

describe("NestOverlay — confirm button state", () => {
  it("confirm button is disabled when pendingDiscards.length < 5", () => {
    const tree = NestOverlay(
      makeProps({ pendingDiscards: ["R5", "G7", "B10"] })
    );
    const { elements } = collectTree(tree);
    const buttons = findByType(elements, "button");
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as Record<string, unknown>).disabled).toBe(true);
  });

  it("confirm button is disabled when pendingDiscards.length > 5", () => {
    const tree = NestOverlay(
      makeProps({
        pendingDiscards: ["R5", "G7", "B10", "Y3", "R12", "R9"] as CardId[],
      })
    );
    const { elements } = collectTree(tree);
    const buttons = findByType(elements, "button");
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as Record<string, unknown>).disabled).toBe(true);
  });

  it("confirm button is enabled when pendingDiscards.length === 5", () => {
    const tree = NestOverlay(
      makeProps({
        pendingDiscards: ["R5", "G7", "B10", "Y3", "R12"] as CardId[],
      })
    );
    const { elements } = collectTree(tree);
    const buttons = findByType(elements, "button");
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as Record<string, unknown>).disabled).toBe(false);
  });

  it('renders "Confirm Discards" button text', () => {
    const tree = NestOverlay(makeProps());
    const text = flattenText(tree);
    expect(text).toContain("Confirm Discards");
  });
});

// ---------------------------------------------------------------------------
// Tests — bid amount display
// ---------------------------------------------------------------------------

describe("NestOverlay — bid amount display", () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('1. renders "Your bid: 120" when bidAmount=120, shotMoon=false', () => {
    const tree = NestOverlay(makeProps({ bidAmount: 120, shotMoon: false }));
    const text = flattenText(tree);
    expect(text).toContain("Your bid: ");
    expect(text).toContain("120");
    expect(text).not.toContain("🌙");
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('2. renders "Your bid: 120 🌙" when bidAmount=120, shotMoon=true', () => {
    const tree = NestOverlay(makeProps({ bidAmount: 120, shotMoon: true }));
    const text = flattenText(tree);
    expect(text).toContain("Your bid: ");
    expect(text).toContain("120");
    expect(text).toContain("🌙");
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it("3. does NOT render 🌙 when shotMoon=false", () => {
    const tree = NestOverlay(makeProps({ bidAmount: 100, shotMoon: false }));
    const text = flattenText(tree);
    expect(text).not.toContain("🌙");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it("4. the info row uses the infoRow CSS class", () => {
    const tree = NestOverlay(makeProps({ bidAmount: 120, shotMoon: false }));
    const { elements } = collectTree(tree);
    const infoRows = findByClass(elements, "infoRow");
    expect(infoRows).toHaveLength(1);

    // Confirm the infoRow contains the bid text
    const infoRowText = flattenText(infoRows[0]);
    expect(infoRowText).toContain("120");
  });
});
