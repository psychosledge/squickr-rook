import { describe, it, expect, vi } from "vitest";
import React from "react";
import { HandResultOverlayView } from "./HandResultOverlay";
import type { HandResultOverlayViewProps } from "./HandResultOverlay";
import type { HandScore } from "@rook/engine";

// Mock CSS modules
vi.mock("./HandResultOverlay.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    title: "title",
    bidResult: "bidResult",
    won: "won",
    lost: "lost",
    moon: "moon",
    table: "table",
    pos: "pos",
    neg: "neg",
    btn: "btn",
    tabs: "tabs",
    tab: "tab",
    activeTab: "activeTab",
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
  default: ({ rows, highlightLast }: { rows: unknown[]; highlightLast?: boolean }) =>
    React.createElement("div", {
      "data-testid": "hand-history-table",
      "data-rows": rows.length,
      "data-highlight": String(highlightLast),
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
// Tree helpers (same pattern as BiddingOverlay / HandHistoryTable tests)
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

const DEFAULT_RUNNING_SCORES = { NS: 120, EW: -120 };

function makeViewProps(
  overrides: Partial<HandResultOverlayViewProps> = {},
): HandResultOverlayViewProps {
  return {
    score: makeHandScore(),
    runningScores: DEFAULT_RUNNING_SCORES,
    onContinue: vi.fn(),
    activeTab: "result",
    onTabChange: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandResultOverlay", () => {

  // ── Test 1: No tabs when handHistory is undefined ────────────────────────
  it("1. No tabs when handHistory is undefined — renders bidResult section, no tab bar", () => {
    const tree = HandResultOverlayView(makeViewProps());
    const all = flattenElements(tree);

    // bidResult section should be present
    const bidResultEls = findByClass(all, "bidResult");
    expect(bidResultEls).toHaveLength(1);

    // No tab bar
    const tabsEls = findByClass(all, "tabs");
    expect(tabsEls).toHaveLength(0);
  });

  // ── Test 2: No tabs when handHistory is empty array ──────────────────────
  it("2. No tabs when handHistory is empty array — renders bidResult section, no tab bar", () => {
    const tree = HandResultOverlayView(makeViewProps({ handHistory: [] }));
    const all = flattenElements(tree);

    // bidResult section should be present
    const bidResultEls = findByClass(all, "bidResult");
    expect(bidResultEls).toHaveLength(1);

    // No tab bar
    const tabsEls = findByClass(all, "tabs");
    expect(tabsEls).toHaveLength(0);
  });

  // ── Test 3: Tabs appear when handHistory has entries ─────────────────────
  it("3. Tabs appear when handHistory has entries — tab bar rendered with Result and History buttons", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()] }),
    );
    const all = flattenElements(tree);

    // Tab bar present
    const tabsEls = findByClass(all, "tabs");
    expect(tabsEls).toHaveLength(1);

    // Both tab buttons present
    const tabButtons = findByClass(all, "tab");
    expect(tabButtons.length).toBeGreaterThanOrEqual(2);

    const allText = flattenText(tree);
    expect(allText).toContain("Result");
    expect(allText).toContain("History");
  });

  // ── Test 4: "Result" tab is active by default ────────────────────────────
  it("4. Result tab has activeTab class when activeTab='result'", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "result" }),
    );
    const all = flattenElements(tree);

    // Find the tab buttons with activeTab class
    const activeTabEls = findByClass(all, "activeTab");
    expect(activeTabEls).toHaveLength(1);

    // The active tab should say "Result"
    const activeTabText = flattenText(activeTabEls[0]);
    expect(activeTabText).toContain("Result");
  });

  // ── Test 5: "Next Hand" button always visible ────────────────────────────
  it("5. Next Hand button is present on result tab (no history)", () => {
    const tree = HandResultOverlayView(makeViewProps());
    const all = flattenElements(tree);

    const btnEls = findByClass(all, "btn");
    expect(btnEls.length).toBeGreaterThan(0);

    const allText = flattenText(tree);
    expect(allText).toContain("Next Hand");
  });

  it("6. Next Hand button is present when tab bar is shown (result tab)", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "result" }),
    );
    const all = flattenElements(tree);

    const btnEls = findByClass(all, "btn");
    expect(btnEls.length).toBeGreaterThan(0);

    const allText = flattenText(tree);
    expect(allText).toContain("Next Hand");
  });

  it("7. Next Hand button is present when history tab is active", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "history" }),
    );
    const all = flattenElements(tree);

    const btnEls = findByClass(all, "btn");
    expect(btnEls.length).toBeGreaterThan(0);

    const allText = flattenText(tree);
    expect(allText).toContain("Next Hand");
  });

  // ── Test 8: History tab renders HandHistoryTable ──────────────────────────
  it("8. History tab renders HandHistoryTable when activeTab='history'", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "history" }),
    );
    const all = flattenElements(tree);

    // HandHistoryTable component receives a 'rows' prop — find it by prop
    const historyTableEls = findByProp(all, "rows");
    expect(historyTableEls).toHaveLength(1);

    // Verify highlightLast=true is passed
    const tableProps = historyTableEls[0].props as Record<string, unknown>;
    expect(tableProps.highlightLast).toBe(true);
  });

  // ── Test 9: History tab hides bidResult, shows table ─────────────────────
  it("9. Result tab content is hidden when history tab is active", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "history" }),
    );
    const all = flattenElements(tree);

    // bidResult section should NOT be visible on history tab
    const bidResultEls = findByClass(all, "bidResult");
    expect(bidResultEls).toHaveLength(0);
  });

  // ── Test 10: History tab — History button has activeTab class ──────────────
  it("10. History tab button has activeTab class when activeTab='history'", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ handHistory: [makeHandScore()], activeTab: "history" }),
    );
    const all = flattenElements(tree);

    const activeTabEls = findByClass(all, "activeTab");
    expect(activeTabEls).toHaveLength(1);

    const activeTabText = flattenText(activeTabEls[0]);
    expect(activeTabText).toContain("History");
  });

  // ── Test 11: seatNames — bid result headline uses display names ──────────
  it("11. bid result headline uses seatNames when provided (bidder team)", () => {
    // Bidder N is on NS team; with seatNames N="Alice", S="Carol"
    // teamDisplay("NS", seatNames) should produce "Alice & Carol"
    const tree = HandResultOverlayView(
      makeViewProps({
        score: makeHandScore({ bidder: "N" }),
        seatNames: { N: "Alice", S: "Carol" },
      }),
    );
    const allText = flattenText(tree);
    // Should NOT contain generic "Team-NS"
    expect(allText).not.toContain("Team-NS");
    // Should contain the display names
    expect(allText).toContain("Alice");
    expect(allText).toContain("Carol");
  });

  it("11b. bid result headline falls back to Team-NS when seatNames is undefined", () => {
    const tree = HandResultOverlayView(makeViewProps({ score: makeHandScore({ bidder: "N" }) }));
    const allText = flattenText(tree);
    expect(allText).toContain("Team-NS");
  });

  // ── Test 12: seatNames — score table rows use display names ─────────────
  it("12. score table rows use seatNames when provided", () => {
    const seatNames = { N: "Alice", S: "Carol", E: "Bob", W: "Dave" };
    const tree = HandResultOverlayView(
      makeViewProps({ seatNames }),
    );
    const allText = flattenText(tree);
    // NS row should say "Alice & Carol" not "Team-NS"
    expect(allText).toContain("Alice");
    expect(allText).toContain("Carol");
    // EW row should say "Bob & Dave" not "Team-EW"
    expect(allText).toContain("Bob");
    expect(allText).toContain("Dave");
    expect(allText).not.toContain("Team-NS");
    expect(allText).not.toContain("Team-EW");
  });

  it("12b. score table rows fall back to Team-NS/Team-EW when seatNames is undefined", () => {
    const tree = HandResultOverlayView(makeViewProps());
    const allText = flattenText(tree);
    expect(allText).toContain("Team-NS");
    expect(allText).toContain("Team-EW");
  });

  // ── Test 13: seatNames — passed to buildHandHistoryRows ─────────────────
  it("13. seatNames is forwarded to buildHandHistoryRows on history tab", () => {
    const seatNames = { N: "Alice" };
    HandResultOverlayView(
      makeViewProps({
        handHistory: [makeHandScore()],
        activeTab: "history",
        seatNames,
      }),
    );
    // The 3rd arg to buildHandHistoryRows should be the seatNames
    expect(lastBuildHandHistoryRowsArgs[2]).toEqual(seatNames);
  });
});

describe("HandResultOverlay — moon hand display (hide Points/Delta columns)", () => {
  // ── Test 14 ────────────────────────────────────────────────────────────────
  it("14. When shotMoon=true, Points column header IS rendered", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ score: makeHandScore({ shotMoon: true }) }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Points");
  });

  // ── Test 15 ────────────────────────────────────────────────────────────────
  it("15. Delta header NOT rendered; Outcome IS rendered (for all hands including moon)", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ score: makeHandScore({ shotMoon: true }) }),
    );
    const allText = flattenText(tree);
    expect(allText).not.toContain("Delta");
    expect(allText).toContain("Outcome");
  });

  // ── Test 16 ────────────────────────────────────────────────────────────────
  it("16. When shotMoon=true, Team and Total column headers ARE rendered", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ score: makeHandScore({ shotMoon: true }) }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Team");
    expect(allText).toContain("Total");
  });

  // ── Test 17 ────────────────────────────────────────────────────────────────
  it("17. When shotMoon=true, data rows have exactly 4 cells each (Team + Points + Outcome + Total)", () => {
    const score = makeHandScore({ shotMoon: true, nsTotal: 120, ewTotal: 0 });
    const tree = HandResultOverlayView(makeViewProps({ score }));
    const all = flattenElements(tree);

    // Find the table body rows
    const trs = all.filter((el) => el.type === "tr");
    // The data rows should have 4 cells each
    const dataTrs = trs.filter((tr) => {
      // tbody rows exist — filter by having td children
      const cells = flattenElements(tr).filter((el) => el.type === "td");
      return cells.length > 0;
    });
    // Each data row should have exactly 4 tds
    for (const tr of dataTrs) {
      const tds = flattenElements(tr).filter((el) => el.type === "td");
      expect(tds).toHaveLength(4);
    }
  });

  // ── Test 18 ────────────────────────────────────────────────────────────────
  it("17b. When shotMoon=true, Points column shows actual captured points (nsTotal/ewTotal), not —", () => {
    const score = makeHandScore({ shotMoon: true, nsTotal: 120, ewTotal: 80 });
    const tree = HandResultOverlayView(makeViewProps({ score }));
    const all = flattenElements(tree);
    // Find the Points <th> to locate the column index
    const ths = all.filter((el) => el.type === "th");
    const pointsColIndex = ths.findIndex((th) => flattenText(th) === "Points");
    expect(pointsColIndex).toBeGreaterThanOrEqual(0);
    // Find tbody data rows and check the Points cell (column index) contains actual numbers
    const trs = all.filter((el) => el.type === "tr");
    const dataTrs = trs.filter((tr) => flattenElements(tr).some((el) => el.type === "td"));
    const pointsValues = dataTrs.map((tr) => {
      const tds = flattenElements(tr).filter((el) => el.type === "td");
      return flattenText(tds[pointsColIndex]);
    });
    expect(pointsValues).toContain("120");
    expect(pointsValues).toContain("80");
  });

  it("18. When shotMoon=true and moonShooterWentSet=true, 'Instant loss' and 'Instant win' are in tree", () => {
    const score = makeHandScore({
      shotMoon: true,
      moonShooterWentSet: true,
      bidder: "N",
      nsDelta: -120,
      ewDelta: 200,
    });
    const tree = HandResultOverlayView(makeViewProps({ score }));
    const allText = flattenText(tree);
    expect(allText).not.toContain("+200");
    expect(allText).toContain("Instant loss");
    expect(allText).toContain("Instant win");
  });

  // ── Test 19 ────────────────────────────────────────────────────────────────
  it("19. When shotMoon=false, all four column headers ARE rendered (Outcome instead of Delta)", () => {
    const tree = HandResultOverlayView(
      makeViewProps({ score: makeHandScore({ shotMoon: false }) }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("Team");
    expect(allText).toContain("Points");
    expect(allText).toContain("Outcome");
    expect(allText).toContain("Total");
    expect(allText).not.toContain("Delta");
  });

  // ── Test 20 ────────────────────────────────────────────────────────────────
  it("20. When shotMoon=true, the moon badge (🌙) still renders", () => {
    const tree = HandResultOverlayView(
      makeViewProps({
        score: makeHandScore({ shotMoon: true, moonShooterWentSet: false }),
      }),
    );
    const allText = flattenText(tree);
    expect(allText).toContain("🌙");
  });

  // ── Test 21 ────────────────────────────────────────────────────────────────
  it("21. Moon-set: bidder team cell shows 'Instant loss', opponent shows 'Instant win'", () => {
    // NS is bidder (N), moon set → NS gets "Instant loss", EW gets "Instant win"
    const score = makeHandScore({
      bidder: "N",
      shotMoon: true,
      moonShooterWentSet: true,
      nsDelta: -120,
      ewDelta: 200,
    });
    const tree = HandResultOverlayView(makeViewProps({ score }));
    const allText = flattenText(tree);
    expect(allText).toContain("Instant loss");
    expect(allText).toContain("Instant win");
  });

  // ── Test 22 ────────────────────────────────────────────────────────────────
  it("22. Moon-made-positive (pre-hand bidder score >= 0): bidder shows 'Instant win', opponent shows numeric delta", () => {
    // NS bidder, pre-hand score = runningScores.NS - nsDelta = 120 - 200 = -80... 
    // Wait, we need pre-hand score >= 0. 
    // runningScores.NS = 250, nsDelta = 200 → pre-hand = 250 - 200 = 50 >= 0
    const score = makeHandScore({
      bidder: "N",
      shotMoon: true,
      moonShooterWentSet: false,
      nsDelta: 200,
      ewDelta: 0,
    });
    const runningScores = { NS: 250, EW: 100 }; // pre-hand NS = 250 - 200 = 50 >= 0
    const tree = HandResultOverlayView(makeViewProps({ score, runningScores }));
    const allText = flattenText(tree);
    expect(allText).toContain("Instant win");
    expect(allText).toContain("+0"); // EW numeric delta
  });

  // ── Test 23 ────────────────────────────────────────────────────────────────
  it("23. Moon-made-in-hole (pre-hand bidder score < 0): bidder shows 'Reset to 0', opponent shows numeric delta", () => {
    // NS bidder, nsDelta = 45, runningScores.NS = 0 → pre-hand = 0 - 45 = -45 < 0
    const score = makeHandScore({
      bidder: "N",
      shotMoon: true,
      moonShooterWentSet: false,
      nsDelta: 45,
      ewDelta: 0,
    });
    const runningScores = { NS: 0, EW: 120 }; // pre-hand NS = 0 - 45 = -45 < 0
    const tree = HandResultOverlayView(makeViewProps({ score, runningScores }));
    const allText = flattenText(tree);
    expect(allText).toContain("Reset to 0");
    expect(allText).toContain("+0"); // EW numeric delta
  });

  // ── Test 24 ────────────────────────────────────────────────────────────────
  it("24. Non-moon hand: Outcome column shows numeric delta +120 / -120 (backward-compat)", () => {
    const score = makeHandScore({
      shotMoon: false,
      nsDelta: 120,
      ewDelta: -120,
    });
    const tree = HandResultOverlayView(makeViewProps({ score }));
    const allText = flattenText(tree);
    expect(allText).toContain("+120");
    expect(allText).toContain("-120");
  });
});
