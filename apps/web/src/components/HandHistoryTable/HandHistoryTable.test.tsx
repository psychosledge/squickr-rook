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
    highlighted: "highlighted",
    empty: "empty",
    iconCell: "iconCell",
    scoreCell: "scoreCell",
    scoreCumulative: "scoreCumulative",
    scoreDelta: "scoreDelta",
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

  // 2. Single row — all 5 columns render with correct values
  describe("single row — all columns", () => {
    it("renders a <table> when rows is non-empty", () => {
      const tree = HandHistoryTable({ rows: [makeRow()] });
      const { elements } = collectTree(tree);
      const tables = findByType(elements, "table");
      expect(tables).toHaveLength(1);
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

    it("renders 5 header columns: empty, Bidder, Bid, NS, EW", () => {
      const tree = HandHistoryTable({ rows: [makeRow()] });
      const { elements, strings } = collectTree(tree);
      // Check presence of expected headers
      expect(strings).toContain("Bidder");
      expect(strings).toContain("Bid");
      expect(strings).toContain("NS");
      expect(strings).toContain("EW");
      // Check absence of removed headers
      expect(strings).not.toContain("Hand");
      expect(strings).not.toContain("Result");
      expect(strings).not.toContain("NS Δ");
      expect(strings).not.toContain("EW Δ");
      // Check there are exactly 5 <th> elements
      const ths = findByType(elements, "th");
      expect(ths).toHaveLength(5);
    });
  });

  // 3. Icon column — ✓ / ✗ based on bidMade
  describe("icon column", () => {
    it("renders ✓ in icon column when bidMade=true", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ bidMade: true })] });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("✓");
    });

    it("renders ✗ in icon column when bidMade=false", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidMade: false, nsDelta: -120, ewDelta: 120 })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("✗");
    });

    it("applies .pos class to icon cell when bidMade=true", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ bidMade: true })] });
      const { elements } = collectTree(tree);
      const posEls = findByClass(elements, "pos");
      expect(posEls.length).toBeGreaterThan(0);
      const hasCheckmark = posEls.some((el) => flattenText(el).includes("✓"));
      expect(hasCheckmark).toBe(true);
    });

    it("applies .neg class to icon cell when bidMade=false", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidMade: false, nsDelta: -120, ewDelta: 120 })],
      });
      const { elements } = collectTree(tree);
      const negEls = findByClass(elements, "neg");
      expect(negEls.length).toBeGreaterThan(0);
      const hasCross = negEls.some((el) => flattenText(el).includes("✗"));
      expect(hasCross).toBe(true);
    });

    it("applies .iconCell class to the icon cell", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ bidMade: true })] });
      const { elements } = collectTree(tree);
      const iconEls = findByClass(elements, "iconCell");
      expect(iconEls.length).toBeGreaterThan(0);
    });
  });

  // 4. Bid column — moon indicator
  describe("Bid column moon indicator", () => {
    it("renders bid amount with 🌙 when shotMoon=true", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidAmount: 120, shotMoon: true })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("120 🌙");
    });

    it("does NOT render 🌙 in bid column when shotMoon=false", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ bidAmount: 120, shotMoon: false })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).not.toContain("🌙");
    });

    it("renders 🌙 in bid column AND ✗ in icon when shotMoon=true and moonShooterWentSet=true", () => {
      // When the moon-shooter went set, they bid moon (🌙 in bid col) but still lost (✗ in icon col)
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            bidAmount: 120,
            shotMoon: true,
            moonShooterWentSet: true,
            bidMade: false,
            nsDelta: -120,
            ewDelta: 120,
          }),
        ],
      });
      const { strings } = collectTree(tree);
      const joined = strings.join("");
      expect(joined).toContain("120 🌙"); // moon shown in bid col
      expect(joined).toContain("✗");       // icon shows set
      expect(joined).not.toContain("✓");   // NOT a checkmark
    });
  });

  // 5. NS score cell — stacked cumulative + delta
  describe("NS score cell (stacked)", () => {
    it("scoreCell contains a scoreCumulative span with the NS cumulative value", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ nsCumulative: 240, nsDelta: 120 })],
      });
      const { elements } = collectTree(tree);
      const cumulativeSpans = findByClass(elements, "scoreCumulative");
      expect(cumulativeSpans.length).toBeGreaterThan(0);
      const hasNsCumulative = cumulativeSpans.some((el) =>
        flattenText(el).includes("240")
      );
      expect(hasNsCumulative).toBe(true);
    });

    it("scoreCell contains a scoreDelta span with the formatted NS delta", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ nsCumulative: 240, nsDelta: 120 })],
      });
      const { elements } = collectTree(tree);
      const deltaSpans = findByClass(elements, "scoreDelta");
      expect(deltaSpans.length).toBeGreaterThan(0);
      const hasNsDelta = deltaSpans.some((el) =>
        flattenText(el).includes("+120")
      );
      expect(hasNsDelta).toBe(true);
    });

    it("scoreDelta span has .pos class when nsDelta >= 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ nsDelta: 120 })],
      });
      const { elements } = collectTree(tree);
      // Find spans that have BOTH scoreDelta and pos classes
      const posScoreDeltaSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          typeof p.className === "string" &&
          p.className.includes("scoreDelta") &&
          p.className.includes("pos")
        );
      });
      expect(posScoreDeltaSpans.length).toBeGreaterThan(0);
    });

    it("scoreDelta span has .neg class when nsDelta < 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ nsDelta: -130, bidMade: false, ewDelta: 130 })],
      });
      const { elements } = collectTree(tree);
      // Find spans that have BOTH scoreDelta and neg classes
      const negScoreDeltaSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          typeof p.className === "string" &&
          p.className.includes("scoreDelta") &&
          p.className.includes("neg")
        );
      });
      expect(negScoreDeltaSpans.length).toBeGreaterThan(0);
    });
  });

  // 6. EW score cell — stacked cumulative + delta
  describe("EW score cell (stacked)", () => {
    it("EW scoreCell contains ewCumulative and ewDelta", () => {
      const tree = HandHistoryTable({
        rows: [
          makeRow({
            ewCumulative: -240,
            ewDelta: -120,
            nsCumulative: 240,
            nsDelta: 120,
          }),
        ],
      });
      const { elements } = collectTree(tree);
      const cumulativeSpans = findByClass(elements, "scoreCumulative");
      // Should have at least 2 (one for NS, one for EW)
      expect(cumulativeSpans.length).toBeGreaterThanOrEqual(2);
      const hasEwCumulative = cumulativeSpans.some((el) =>
        flattenText(el).includes("-240")
      );
      expect(hasEwCumulative).toBe(true);

      const deltaSpans = findByClass(elements, "scoreDelta");
      expect(deltaSpans.length).toBeGreaterThanOrEqual(2);
      const hasEwDelta = deltaSpans.some((el) =>
        flattenText(el).includes("-120")
      );
      expect(hasEwDelta).toBe(true);
    });
  });

  // 7. nsDelta positive — +120 in .scoreDelta span with .pos
  describe("nsDelta positive", () => {
    it("renders +120 in a scoreDelta span for a positive nsDelta", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: 120 })] });
      const { elements } = collectTree(tree);
      const deltaSpans = findByClass(elements, "scoreDelta");
      const hasPosNsDelta = deltaSpans.some((el) =>
        flattenText(el).includes("+120")
      );
      expect(hasPosNsDelta).toBe(true);
    });
  });

  // 8. nsDelta negative — -130 in .scoreDelta span with .neg
  describe("nsDelta negative", () => {
    it("renders -130 in a scoreDelta span for a negative nsDelta (no + prefix)", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ nsDelta: -130, bidMade: false, ewDelta: 130 })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("-130");
      expect(strings.join("")).not.toContain("+-130");
    });
  });

  // 9. ewDelta positive — +50 in .scoreDelta span with .pos
  describe("ewDelta positive", () => {
    it("renders +50 in a scoreDelta span for a positive ewDelta", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: 50, nsDelta: -50, bidMade: false })],
      });
      const { elements } = collectTree(tree);
      const deltaSpans = findByClass(elements, "scoreDelta");
      const hasPosEwDelta = deltaSpans.some((el) =>
        flattenText(el).includes("+50")
      );
      expect(hasPosEwDelta).toBe(true);
    });
  });

  // 10. ewDelta negative — -80 in .scoreDelta span with .neg
  describe("ewDelta negative", () => {
    it("renders -80 in a scoreDelta span for a negative ewDelta (no + prefix)", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: -80, nsDelta: 80 })],
      });
      const { strings } = collectTree(tree);
      expect(strings.join("")).toContain("-80");
      expect(strings.join("")).not.toContain("+-80");
    });
  });

  // 11. Zero delta boundary — +0 with .pos class
  describe("zero delta boundary", () => {
    it("renders +0 in scoreDelta span and .pos class for nsDelta === 0", () => {
      const tree = HandHistoryTable({ rows: [makeRow({ nsDelta: 0 })] });
      const { elements } = collectTree(tree);
      const posScoreDeltaSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          typeof p.className === "string" &&
          p.className.includes("scoreDelta") &&
          p.className.includes("pos")
        );
      });
      expect(posScoreDeltaSpans.length).toBeGreaterThan(0);
      const hasPlusZero = posScoreDeltaSpans.some((el) =>
        flattenText(el).includes("+0")
      );
      expect(hasPlusZero).toBe(true);
    });

    it("renders +0 in scoreDelta span and .pos class for ewDelta === 0", () => {
      const tree = HandHistoryTable({
        rows: [makeRow({ ewDelta: 0, nsDelta: 0 })],
      });
      const { elements } = collectTree(tree);
      const posScoreDeltaSpans = elements.filter((el) => {
        const p = el.props as Record<string, unknown>;
        return (
          typeof p.className === "string" &&
          p.className.includes("scoreDelta") &&
          p.className.includes("pos")
        );
      });
      expect(posScoreDeltaSpans.length).toBeGreaterThan(0);
    });
  });

  // 12. highlightLast=true — last row has the highlighted class
  describe("highlightLast=true", () => {
    it("applies .highlighted to the last <tr> when highlightLast=true", () => {
      const rows = [
        makeRow({ handNumber: 1 }),
        makeRow({ handNumber: 2 }),
        makeRow({ handNumber: 3 }),
      ];
      const tree = HandHistoryTable({ rows, highlightLast: true });
      const { elements } = collectTree(tree);
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

    it("highlighted row is the last row (nsCumulative=300), not the first (nsCumulative=150)", () => {
      const rows = [
        makeRow({ handNumber: 1, nsCumulative: 150, nsDelta: 150 }),
        makeRow({ handNumber: 2, nsCumulative: 225, nsDelta: 75 }),
        makeRow({ handNumber: 3, nsCumulative: 300, nsDelta: 75 }),
      ];
      const tree = HandHistoryTable({ rows, highlightLast: true });
      const { elements } = collectTree(tree);
      const highlightedTrs = findByClass(elements, "highlighted");
      expect(highlightedTrs).toHaveLength(1);
      const highlightedText = flattenText(highlightedTrs[0]);
      expect(highlightedText).toContain("300");
      expect(highlightedText).not.toContain("150");
    });
  });

  // 13. highlightLast=false (or omitted) — no row has the highlighted class
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

  // 14. Multiple rows — correct number of <tr> elements
  describe("multiple rows", () => {
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
