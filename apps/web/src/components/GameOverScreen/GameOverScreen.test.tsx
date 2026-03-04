import { describe, it, expect, vi } from "vitest";
import React from "react";
import { GameOverScreenView } from "./GameOverScreen";
import type { GameOverScreenViewProps } from "./GameOverScreen";
import type { HandScore } from "@rook/engine";

// Mock CSS modules
vi.mock("./GameOverScreen.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    emoji: "emoji",
    result: "result",
    win: "win",
    lose: "lose",
    reason: "reason",
    scores: "scores",
    scoreBox: "scoreBox",
    winner: "winner",
    teamLabel: "teamLabel",
    scoreVal: "scoreVal",
    btn: "btn",
    handLogBtn: "handLogBtn",
    handLogSection: "handLogSection",
  },
}));

// Mock seatLabel utility
vi.mock("@/utils/seatLabel", () => ({
  getTeamLabel: (team: string) => `Team-${team}`,
}));

// Mock HandHistoryTable
vi.mock("@/components/HandHistoryTable/HandHistoryTable", () => ({
  default: ({ rows }: { rows: unknown[] }) =>
    React.createElement("div", {
      "data-testid": "hand-history-table",
      "data-rows": rows.length,
    }),
}));

// Mock buildHandHistoryRows
vi.mock("@/utils/handHistory", () => ({
  buildHandHistoryRows: (history: unknown[]) =>
    history.map((_, i) => ({ handNumber: i + 1 })),
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as HandResultOverlay tests)
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
  classMatch: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

/** Find component elements by a prop name that they receive */
function findByProp(
  elements: React.ReactElement[],
  propName: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    return propName in p;
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHandScore(overrides: Partial<HandScore> = {}): HandScore {
  return {
    hand: 1,
    bidder: "N",
    bidAmount: 120,
    nestCards: [],
    discarded: [],
    nsPointCards: 120,
    ewPointCards: 0,
    nsMostCardsBonus: 0,
    ewMostCardsBonus: 0,
    nsNestBonus: 0,
    ewNestBonus: 0,
    nsWonLastTrick: false,
    ewWonLastTrick: false,
    nsTotal: 120,
    ewTotal: 0,
    nsDelta: 120,
    ewDelta: -120,
    shotMoon: false,
    moonShooterWentSet: false,
    ...overrides,
  };
}

function makeProps(
  overrides: Partial<GameOverScreenViewProps> = {},
): GameOverScreenViewProps {
  return {
    winner: "NS",
    finalScores: { NS: 520, EW: 200 },
    reason: "threshold-reached",
    onPlayAgain: vi.fn(),
    showHandLog: false,
    onToggleHandLog: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameOverScreen", () => {

  // ── Test 1: No hand log button when handHistory is undefined ──────────────
  it("1. No hand log button when handHistory is undefined", () => {
    const tree = GameOverScreenView(makeProps());
    const all = flattenElements(tree);

    const handLogBtns = findByClass(all, "handLogBtn");
    expect(handLogBtns).toHaveLength(0);
  });

  // ── Test 2: No hand log button when handHistory is empty ──────────────────
  it("2. No hand log button when handHistory is empty", () => {
    const tree = GameOverScreenView(makeProps({ handHistory: [] }));
    const all = flattenElements(tree);

    const handLogBtns = findByClass(all, "handLogBtn");
    expect(handLogBtns).toHaveLength(0);
  });

  // ── Test 3: Hand log button rendered when handHistory has entries ──────────
  it("3. Hand log button rendered when handHistory has entries", () => {
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()] }),
    );
    const all = flattenElements(tree);

    const handLogBtns = findByClass(all, "handLogBtn");
    expect(handLogBtns).toHaveLength(1);

    const allText = flattenText(tree);
    expect(allText).toContain("📋 Hand Log");
  });

  // ── Test 4: Table NOT visible when showHandLog=false ──────────────────────
  it("4. Table NOT visible when showHandLog=false (collapsed by default)", () => {
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], showHandLog: false }),
    );
    const all = flattenElements(tree);

    // HandHistoryTable has a 'rows' prop — should not be present
    const historyTableEls = findByProp(all, "rows");
    expect(historyTableEls).toHaveLength(0);
  });

  // ── Test 5: Table visible when showHandLog=true ────────────────────────────
  it("5. Table visible when showHandLog=true", () => {
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], showHandLog: true }),
    );
    const all = flattenElements(tree);

    // HandHistoryTable should be rendered — find by 'rows' prop
    const historyTableEls = findByProp(all, "rows");
    expect(historyTableEls).toHaveLength(1);
  });

  // ── Test 6: Toggle button onClick fires onToggleHandLog ───────────────────
  it("6. Toggle button onClick fires onToggleHandLog", () => {
    const onToggleHandLog = vi.fn();
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], onToggleHandLog }),
    );
    const all = flattenElements(tree);

    const handLogBtns = findByClass(all, "handLogBtn");
    expect(handLogBtns).toHaveLength(1);

    // Simulate click by calling the onClick prop directly
    const p = handLogBtns[0].props as Record<string, unknown>;
    expect(typeof p.onClick).toBe("function");
    (p.onClick as () => void)();
    expect(onToggleHandLog).toHaveBeenCalledTimes(1);
  });

  // ── Test 7: "Play Again" button always present ────────────────────────────
  it("7a. Play Again button present — no history", () => {
    const tree = GameOverScreenView(makeProps());
    const allText = flattenText(tree);
    expect(allText).toContain("Play Again");
  });

  it("7b. Play Again button present — history collapsed", () => {
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], showHandLog: false }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Play Again");
  });

  it("7c. Play Again button present — history expanded", () => {
    const tree = GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], showHandLog: true }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Play Again");
  });
});
