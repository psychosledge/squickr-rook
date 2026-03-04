import { describe, it, expect, vi } from "vitest";
import React from "react";
import HandHistoryTable from "./HandHistoryTable";
import type { HandHistoryRow } from "@/utils/handHistory";

// Mock CSS modules
vi.mock("./HandHistoryTable.module.css", () => ({
  default: {
    table: "table",
    pos: "pos",
    neg: "neg",
    moon: "moon",
    highlighted: "highlighted",
    empty: "empty",
    resultCell: "resultCell",
  },
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as ScoreBar / CurrentTrick tests)
// ---------------------------------------------------------------------------

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

function flattenText(node: React.ReactNode): string {
  const { strings } = collectTree(node);
  return strings.join("");
}

function findByType(
  elements: React.ReactElement[],
  type: string
): React.ReactElement[] {
  return elements.filter((el) => el.type === type);
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
// Fixture helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<HandHistoryRow> = {}): HandHistoryRow {
  return {
    handNumber: 1,
    bidderTeam: "NS",
    bidderSeat: "N",
    bidderLabel: "You",
    bidAmount: 120,
    bidMade: true,
    shotMoon: false,
    moonShooterWentSet: false,
    nsDelta: 120,
    ewDelta: -120,
    nsCumulative: 120,
    ewCumulative: -120,
    outcomeBadge: "Made it",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandHistoryTable", () => {
  // 1. Empty state
  describe("empty state", () => {
    it('renders "No hands played yet" when rows=[]', () => {
      const tree = HandHistoryTable({ rows: [] });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("No hands played yet");
    });

    it("does NOT render a <table> when rows=[]", () => {
      const tree = HandHistoryTable({ rows: [] });
      const { elements } = collectTree(tree);
      const tables = findByType(elements, "table");
      expect(tables).toHaveLength(0);
    });
  });

  // 2. Single row — all 8 columns render with correct values
  describe("single row — all columns", () => {
    it("renders a <table> when rows is non-empty", () => {
      const tree = HandHistoryTable({ rows: [makeRow()] });
      const { elements } = collectTree(tree);
      const tables = findByType(elements, "table");
      expect(tables).toHaveLength(1);
    });

    it("renders hand number as H1 in the Hand column", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ handNumber: 1 })] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("H1");
    });

    it("renders bidderLabel in the Bidder column", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ bidderLabel: "You" })] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("You");
    });

    it("renders bidAmount in the Bid column (separate from outcome)", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidAmount: 120, outcomeBadge: "Made it" })],
      });
      const { strings } = collectTree(tree);
      expect(strings).toContain("120");
    });

    it("renders outcomeBadge in the Result column (separate from bid amount)", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidAmount: 120, outcomeBadge: "Made it" })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("Made it");
    });

    it("does NOT render the combined '120 — Made it' format", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidAmount: 120, outcomeBadge: "Made it" })],
      });
      const { strings } = collectTree(tree);
      const joined = strings.join("");
      // The em-dash separator should not appear between bid and outcome
      expect(joined).not.toContain("120 — Made it");
    });

    it("renders nsCumulative in the NS column", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsCumulative: 120 })] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("120");
    });

    it("renders ewCumulative in the EW column", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ ewCumulative: -120 })] });
      const { strings } = collectTree(tree);
      const joined = strings.join("");
      expect(joined).toContain("-120");
    });

    it("renders 8 header columns: Hand, Bidder, Bid, Result, NS Δ, EW Δ, NS, EW", () => {
      const tree = HandHistoryTable({ rows: [makeRow()] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("Hand");
      expect(strings).toContain("Bidder");
      expect(strings).toContain("Bid");
      expect(strings).toContain("Result");
      expect(strings).toContain("NS Δ");
      expect(strings).toContain("EW Δ");
      expect(strings).toContain("NS");
      expect(strings).toContain("EW");
    });
  });

  // 3. nsDelta positive — renders +120 with .pos class
  describe("nsDelta positive", () => {
    it("renders +120 for a positive nsDelta", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: 120 })] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("+120");
    });

    it("applies .pos class to nsDelta cell when nsDelta >= 0", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: 120 })] });
      const { elements } = collectTree(tree);
      const posEls = findByClass(elements, "pos");
      expect(posEls.length).toBeGreaterThan(0);
      // At least one pos element should contain "+120"
      const hasPosNsDelta = posEls.some((el) =>
        flattenText(el).includes("+120")
      );
      expect(hasPosNsDelta).toBe(true);
    });
  });

  // 4. nsDelta negative — renders -130 with .neg class
  describe("nsDelta negative", () => {
    it("renders -130 for a negative nsDelta (no + prefix)", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: -130 })] });
      const { strings } = collectTree(tree);
      expect(strings).toContain("-130");
      // should NOT contain "+−130"
      expect(strings.join("")).not.toContain("+-130");
    });

    it("applies .neg class to nsDelta cell when nsDelta < 0", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: -130 })] });
      const { elements } = collectTree(tree);
      const negEls = findByClass(elements, "neg");
      expect(negEls.length).toBeGreaterThan(0);
      const hasNegNsDelta = negEls.some((el) =>
        flattenText(el).includes("-130")
      );
      expect(hasNegNsDelta).toBe(true);
    });
  });

  // 5. ewDelta positive — renders +50 with .pos class
  describe("ewDelta positive", () => {
    it("renders +50 for a positive ewDelta", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: 50, nsDelta: -50 })],
      });
      const { strings } = collectTree(tree);
      expect(strings).toContain("+50");
    });

    it("applies .pos class to ewDelta cell when ewDelta >= 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: 50, nsDelta: -50 })],
      });
      const { elements } = collectTree(tree);
      const posEls = findByClass(elements, "pos");
      expect(posEls.length).toBeGreaterThan(0);
      const hasPosEwDelta = posEls.some((el) =>
        flattenText(el).includes("+50")
      );
      expect(hasPosEwDelta).toBe(true);
    });
  });

  // 5b. ewDelta negative — renders -80 with .neg class
  describe("ewDelta negative", () => {
    it("renders -80 for a negative ewDelta (no + prefix)", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: -80, nsDelta: 80 })],
      });
      const { strings } = collectTree(tree);
      expect(strings).toContain("-80");
      expect(strings.join("")).not.toContain("+-80");
    });

    it("applies .neg class to ewDelta cell when ewDelta < 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: -80, nsDelta: 80 })],
      });
      const { elements } = collectTree(tree);
      const negEls = findByClass(elements, "neg");
      expect(negEls.length).toBeGreaterThan(0);
      const hasNegEwDelta = negEls.some((el) =>
        flattenText(el).includes("-80")
      );
      expect(hasNegEwDelta).toBe(true);
    });
  });

  // 5c. Zero delta boundary — +0 with .pos class for both NS and EW
  describe("zero delta boundary", () => {
    it("renders +0 and .pos class for nsDelta === 0", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: 0 })] });
      const { strings, elements } = collectTree(tree);
      expect(strings).toContain("+0");
      const posEls = findByClass(elements, "pos");
      const hasPosNsDelta = posEls.some((el) =>
        flattenText(el).includes("+0")
      );
      expect(hasPosNsDelta).toBe(true);
    });

    it("renders +0 and .pos class for ewDelta === 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: 0, nsDelta: 0 })],
      });
      const { strings, elements } = collectTree(tree);
      expect(strings).toContain("+0");
      const posEls = findByClass(elements, "pos");
      const hasPosEwDelta = posEls.some((el) =>
        flattenText(el).includes("+0")
      );
      expect(hasPosEwDelta).toBe(true);
    });
  });

  // 6. highlightLast=true — last row has the highlighted class
  describe("highlightLast=true", () => {
    it("applies .highlighted to the last <tr> when highlightLast=true", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows, highlightLast: true });
      const { elements } = collectTree(tree);
      // The last data row should have the highlighted class
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs.length).toBeGreaterThan(0);
    });

    it("only the last row gets .highlighted when highlightLast=true", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows, highlightLast: true });
      const { elements } = collectTree(tree);
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs).toHaveLength(1);
    });

    it("highlighted row is the last row (H3), not the first (H1)", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows, highlightLast: true });
      const { elements } = collectTree(tree);
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs).toHaveLength(1);
      // The highlighted row should contain "H3", not "H1"
      const highlightedText = flattenText(highlightedTrs[0]);
      expect(highlightedText).toContain("H3");
      expect(highlightedText).not.toContain("H1");
    });
  });

  // 7. highlightLast=false (or omitted) — no row has the highlighted class
  describe("highlightLast=false / omitted", () => {
    it("no row has .highlighted when highlightLast is omitted", () => {
      const rows = [makeRow({ handNumber: 1 }), makeRow({ handNumber: 2 })];
      const tree = HandHistoryTable({ rows });
      const { elements } = collectTree(tree);
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs).toHaveLength(0);
    });

    it("no row has .highlighted when highlightLast=false", () => {
      const rows = [makeRow({ handNumber: 1 }), makeRow({ handNumber: 2 })];
      const tree = HandHistoryTable({ rows, highlightLast: false });
      const { elements } = collectTree(tree);
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs).toHaveLength(0);
    });
  });

  // 8. Moon indicator — shotMoon=true shows moon emoji in outcomeBadge
  describe("moon indicator", () => {
    it('shows "🌙 Moon!" in the Result column when outcomeBadge is "🌙 Moon!"', () => {
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            shotMoon: true,
            moonShooterWentSet: false,
            outcomeBadge: "🌙 Moon!",
          }),
        ],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("🌙 Moon!");
    });

    it('shows "🌙 Set!" in the Result column when outcomeBadge is "🌙 Set!"', () => {
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            shotMoon: true,
            moonShooterWentSet: true,
            outcomeBadge: "🌙 Set!",
          }),
        ],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("🌙 Set!");
    });

    it("applies .moon class to result cell when shotMoon=true and moonShooterWentSet=false", () => {
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            shotMoon: true,
            moonShooterWentSet: false,
            outcomeBadge: "🌙 Moon!",
          }),
        ],
      });
      const { elements } = collectTree(tree);
      const moonEls = findByClass(elements, "moon");
      expect(moonEls.length).toBeGreaterThan(0);
      const hasMoonBadge = moonEls.some((el) =>
        flattenText(el).includes("🌙 Moon!")
      );
      expect(hasMoonBadge).toBe(true);
    });
  });

  // 9. Result column coloring — bidMade drives .pos / .neg class on result cell
  describe("Result column coloring", () => {
    it("applies .pos class to result cell when bidMade=true", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidMade: true, outcomeBadge: "Made it" })],
      });
      const { elements } = collectTree(tree);
      const posEls = findByClass(elements, "pos");
      // At least one .pos element should contain "Made it"
      const hasMadeIt = posEls.some((el) => flattenText(el).includes("Made it"));
      expect(hasMadeIt).toBe(true);
    });

    it("applies .neg class to result cell when bidMade=false", () => {
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            bidMade: false,
            nsDelta: -110,
            ewDelta: 110,
            outcomeBadge: "Set!",
          }),
        ],
      });
      const { elements } = collectTree(tree);
      const negEls = findByClass(elements, "neg");
      // At least one .neg element should contain "Set!"
      const hasSet = negEls.some((el) => flattenText(el).includes("Set!"));
      expect(hasSet).toBe(true);
    });

    it("applies .resultCell class to the result cell", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidMade: true, outcomeBadge: "Made it" })],
      });
      const { elements } = collectTree(tree);
      const resultEls = findByClass(elements, "resultCell");
      expect(resultEls.length).toBeGreaterThan(0);
    });
  });

  // 10. Multiple rows — handNumber increments correctly
  describe("multiple rows", () => {
    it("renders H1, H2, H3 for three rows in order", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows });
      const { strings } = collectTree(tree);
      expect(strings).toContain("H1");
      expect(strings).toContain("H2");
      expect(strings).toContain("H3");
    });

    it("renders the correct number of <tr> rows in the tbody", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows });
      const { elements } = collectTree(tree);
      // thead has 1 tr, tbody has 3 trs → total 4
      const trs = findByType(elements, "tr");
      expect(trs).toHaveLength(4); // 1 header + 3 data rows
    });
  });
});
