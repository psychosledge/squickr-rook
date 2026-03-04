import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { GameState } from "@rook/engine";
import { DEFAULT_RULES } from "@rook/engine";
import ScoreBar from "./ScoreBar";

// Mock CSS modules
vi.mock("./ScoreBar.module.css", () => ({
  default: {
    bar: "bar",
    scores: "scores",
    team: "team",
    divider: "divider",
    center: "center",
    trump: "trump",
    hand: "hand",
    status: "status",
    active: "active",
    bidBadge: "bidBadge",
    historyBtn: "historyBtn",
  },
}));

// Mock seatLabel utility
vi.mock("@/utils/seatLabel", () => ({
  getSeatLabel: (seat: string) => `Label-${seat}`,
}));

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

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

function flattenText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "boolean") return "";
  if (!React.isValidElement(node)) return "";
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return childNodes.map(flattenText).join("");
}

function findByClass(
  elements: React.ReactElement[],
  classMatch: string
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    phase: "bidding",
    rules: DEFAULT_RULES,
    players: [
      { seat: "N", name: "You", kind: "human" },
      { seat: "E", name: "P2", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "S", name: "P3", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
      { seat: "W", name: "P4", kind: "bot", botProfile: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true, sluffStrategy: false } },
    ],
    handNumber: 0,
    dealer: "W",
    seed: 42,
    activePlayer: "N",
    hands: { N: [], E: [], S: [], W: [] },
    nest: [],
    originalNest: [],
    discarded: [],
    trump: null,
    currentTrick: [],
    tricksPlayed: 0,
    completedTricks: [],
    capturedCards: { NS: [], EW: [] },
    scores: { NS: 0, EW: 0 },
    handHistory: [],
    winner: null,
    playedCards: [],
    bids: { N: null, E: null, S: null, W: null },
    moonShooters: [],
    currentBid: 0,
    bidder: null,
    bidAmount: 0,
    shotMoon: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bid badge tests
// ---------------------------------------------------------------------------

describe("ScoreBar — bid badge", () => {
  it('renders bid badge "Label-S bid 120" during "playing" phase when bidder="S", bidAmount=120, shotMoon=false', () => {
    const gs = makeGameState({
      phase: "playing",
      bidder: "S",
      bidAmount: 120,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(1);
    const badgeText = flattenText(badges[0]);
    expect(badgeText).toBe("Label-S bid 120");
  });

  it("renders bid badge with 🌙 emoji when shotMoon=true", () => {
    const gs = makeGameState({
      phase: "playing",
      bidder: "W",
      bidAmount: 200,
      shotMoon: true,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(1);
    const badgeText = flattenText(badges[0]);
    expect(badgeText).toBe("Label-W bid 200 🌙");
  });

  it('does NOT render bid badge during "bidding" phase even if bidder/bidAmount are set', () => {
    const gs = makeGameState({
      phase: "bidding",
      bidder: "S",
      bidAmount: 120,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(0);
  });

  it("does NOT render bid badge when bidAmount === 0", () => {
    const gs = makeGameState({
      phase: "playing",
      bidder: "S",
      bidAmount: 0,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(0);
  });

  it("does NOT render bid badge when bidder === null", () => {
    const gs = makeGameState({
      phase: "playing",
      bidder: null,
      bidAmount: 120,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(0);
  });

  it('renders bid badge during "nest" phase', () => {
    const gs = makeGameState({
      phase: "nest",
      bidder: "E",
      bidAmount: 105,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(1);
    expect(flattenText(badges[0])).toBe("Label-E bid 105");
  });

  it('renders bid badge during "trump" phase', () => {
    const gs = makeGameState({
      phase: "trump",
      bidder: "N",
      bidAmount: 100,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(1);
    expect(flattenText(badges[0])).toBe("Label-N bid 100");
  });

  it('renders bid badge during "scoring" phase', () => {
    const gs = makeGameState({
      phase: "scoring",
      bidder: "S",
      bidAmount: 150,
      shotMoon: false,
    });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const badges = findByClass(elements, "bidBadge");

    expect(badges).toHaveLength(1);
    expect(flattenText(badges[0])).toBe("Label-S bid 150");
  });
});

// ---------------------------------------------------------------------------
// History button tests
// ---------------------------------------------------------------------------

const minimalHandScore = {
  hand: 1,
  bidder: "N" as const,
  bidAmount: 120,
  nestCards: [],
  discarded: [],
  nsPointCards: 140,
  ewPointCards: 60,
  nsMostCardsBonus: 0,
  ewMostCardsBonus: 0,
  nsNestBonus: 0,
  ewNestBonus: 0,
  nsWonLastTrick: false,
  ewWonLastTrick: false,
  nsTotal: 140,
  ewTotal: 60,
  nsDelta: 120,
  ewDelta: -60,
  shotMoon: false,
  moonShooterWentSet: false,
};

describe("ScoreBar — history button", () => {
  it("is not rendered when handHistory is empty, even if onOpenHistory is provided", () => {
    const gs = makeGameState({ handHistory: [] });
    const tree = ScoreBar({ gameState: gs, onOpenHistory: vi.fn() });
    const elements = flattenElements(tree);
    const btns = findByClass(elements, "historyBtn");
    expect(btns).toHaveLength(0);
  });

  it("is not rendered when onOpenHistory is not provided, even if handHistory has entries", () => {
    const gs = makeGameState({ handHistory: [minimalHandScore] });
    const tree = ScoreBar({ gameState: gs });
    const elements = flattenElements(tree);
    const btns = findByClass(elements, "historyBtn");
    expect(btns).toHaveLength(0);
  });

  it("is rendered when handHistory has entries AND onOpenHistory is provided", () => {
    const gs = makeGameState({ handHistory: [minimalHandScore] });
    const tree = ScoreBar({ gameState: gs, onOpenHistory: vi.fn() });
    const elements = flattenElements(tree);
    const btns = findByClass(elements, "historyBtn");
    expect(btns).toHaveLength(1);
    const btn = btns[0];
    const p = btn.props as Record<string, unknown>;
    expect(p["aria-label"]).toBe("View hand history");
    expect(p["type"]).toBe("button");
    expect(flattenText(btn)).toBe("📋");
  });

  it("calls onOpenHistory when the history button is clicked", () => {
    const onOpenHistory = vi.fn();
    const gs = makeGameState({ handHistory: [minimalHandScore] });
    const tree = ScoreBar({ gameState: gs, onOpenHistory });
    const elements = flattenElements(tree);
    const btns = findByClass(elements, "historyBtn");
    expect(btns).toHaveLength(1);
    const btn = btns[0];
    const p = btn.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
