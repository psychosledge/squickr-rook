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
  getSeatLabel: (seat: string) => {
    const labels: Record<string, string> = { N: "You", E: "P2", S: "P3", W: "P4" };
    return labels[seat] ?? seat;
  },
  teamDisplay: (team: string, seatNames?: Partial<Record<string, string>>) => {
    if (!seatNames) return `Team-${team}`;
    const [s1, s2] = team === "NS" ? ["N", "S"] : ["E", "W"];
    const labels: Record<string, string> = { N: "You", E: "P2", S: "P3", W: "P4" };
    const n1 = seatNames[s1] ?? labels[s1] ?? s1;
    const n2 = seatNames[s2] ?? labels[s2] ?? s2;
    return `${n1} & ${n2}`;
  },
}));

// Mock HandHistoryTable
vi.mock("@/components/HandHistoryTable/HandHistoryTable", () => ({
  default: ({ rows }: { rows: unknown[] }) =>
    React.createElement("div", {
      "data-testid": "hand-history-table",
      "data-rows": rows.length,
    }),
}));

// Mock buildHandHistoryRows — capture last call args for assertions
let lastBuildHandHistoryRowsArgs: unknown[] = [];
vi.mock("@/utils/handHistory", () => ({
  buildHandHistoryRows: (...args: unknown[]) => {
    lastBuildHandHistoryRowsArgs = args;
    const history = args[0] as unknown[];
    return history.map((_, i) => ({ handNumber: i + 1 }));
  },
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

  // ── Test 8: seatNames — reason line and score box labels use display names ─
  it("8. reason line uses seatNames when provided — winning team shows display names", () => {
    // NS wins, reason threshold-reached → "${teamDisplay('NS', seatNames)} reached 500 points"
    const tree = GameOverScreenView(
      makeProps({
        winner: "NS",
        reason: "threshold-reached",
        seatNames: { N: "Alice", S: "Carol" },
      }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Alice");
    expect(allText).toContain("Carol");
    expect(allText).not.toContain("Team-NS");
  });

  it("8b. reason line falls back to getTeamLabel when seatNames is undefined", () => {
    const tree = GameOverScreenView(
      makeProps({ winner: "NS", reason: "threshold-reached" }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Team-NS");
  });

  it("8c. score box team labels use seatNames when provided", () => {
    const seatNames = { N: "Alice", S: "Carol", E: "Bob", W: "Dave" };
    const tree = GameOverScreenView(makeProps({ seatNames }));
    const allText = flattenText(tree);
    // NS score box: "Alice & Carol", EW score box: "Bob & Dave"
    expect(allText).toContain("Alice");
    expect(allText).toContain("Carol");
    expect(allText).toContain("Bob");
    expect(allText).toContain("Dave");
    expect(allText).not.toContain("Team-NS");
    expect(allText).not.toContain("Team-EW");
  });

  it("8d. score box falls back to Team labels when seatNames undefined", () => {
    const tree = GameOverScreenView(makeProps());
    const allText = flattenText(tree);
    expect(allText).toContain("Team-NS");
    expect(allText).toContain("Team-EW");
  });

  // ── Test 9: seatNames passed to buildHandHistoryRows ────────────────────
  it("9. seatNames forwarded to buildHandHistoryRows when hand log is shown", () => {
    const seatNames = { N: "Alice" };
    GameOverScreenView(
      makeProps({ handHistory: [makeHandScore()], showHandLog: true, seatNames }),
    );
    expect(lastBuildHandHistoryRowsArgs[2]).toEqual(seatNames);
  });

  // ── Test 10 & 11: humanTeam prop controls win/lose message ───────────────
  it("10. humanTeam='EW', winner='EW' → shows 'You Win!'", () => {
    const tree = GameOverScreenView(
      makeProps({ winner: "EW", humanTeam: "EW" }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("You Win!");
    expect(allText).not.toContain("You Lose");
  });

  it("11. humanTeam='NS', winner='EW' → shows 'You Lose'", () => {
    const tree = GameOverScreenView(
      makeProps({ winner: "EW", humanTeam: "NS" }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("You Lose");
    expect(allText).not.toContain("You Win!");
  });
});
