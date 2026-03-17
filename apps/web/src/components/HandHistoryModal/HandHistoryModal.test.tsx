import { describe, it, expect, vi } from "vitest";
import React from "react";
import HandHistoryModal from "./HandHistoryModal";
import type { HandHistoryRow } from "@/utils/handHistory";

// Mock CSS modules
vi.mock("./HandHistoryModal.module.css", () => ({
  default: {
    backdrop: "backdrop",
    panel: "panel",
    header: "header",
    closeBtn: "closeBtn",
    body: "body",
  },
}));

// Mock HandHistoryTable so we can test integration without its internals
vi.mock("../HandHistoryTable/HandHistoryTable", () => ({
  default: ({ rows }: { rows: HandHistoryRow[] }) => {
    if (rows.length === 0) {
      return React.createElement("p", { "data-testid": "empty-table" }, "No hands played yet");
    }
    return React.createElement(
      "table",
      { "aria-label": "Hand history", "data-testid": "hand-table" },
      React.createElement(
        "tbody",
        null,
        rows.map((r) =>
          React.createElement("tr", { key: r.handNumber },
            React.createElement("td", null, `H${r.handNumber}`)
          )
        )
      )
    );
  },
}));

// ---------------------------------------------------------------------------
// Tree helpers
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
    // If the element type is a function component, call it to get its render output
    if (typeof el.type === "function") {
      try {
        const rendered = (el.type as (props: unknown) => React.ReactNode)(el.props);
        visit(rendered);
      } catch {
        // fallback: traverse children prop
        const p = el.props as Record<string, unknown>;
        visit(p.children as React.ReactNode | undefined);
      }
      return;
    }
    elements.push(el);
    const p = el.props as Record<string, unknown>;
    visit(p.children as React.ReactNode | undefined);
  }

  visit(node);
  return { elements, strings };
}

function findByType(elements: React.ReactElement[], type: string): React.ReactElement[] {
  return elements.filter((el) => el.type === type);
}

function findByClass(elements: React.ReactElement[], classMatch: string): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

function flattenText(node: React.ReactNode): string {
  const { strings } = collectTree(node);
  return strings.join("");
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
    moonOutcome: null,
    nsDelta: 120,
    ewDelta: -120,
    nsCumulative: 120,
    ewCumulative: -120,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandHistoryModal", () => {
  // Test 1: Renders heading
  it('1. renders "Hand History" h2 heading', () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements, strings } = collectTree(tree);
    const h2s = findByType(elements, "h2");
    expect(h2s).toHaveLength(1);
    const h2Text = flattenText(h2s[0]);
    expect(h2Text).toBe("Hand History");
    expect(strings.join("")).toContain("Hand History");
  });

  // Test 2: Close button calls onClose
  it("2. clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements } = collectTree(tree);
    const closeBtns = findByClass(elements, "closeBtn");
    expect(closeBtns).toHaveLength(1);
    const onClick = (closeBtns[0].props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Test 3: Backdrop click calls onClose
  it("3. clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements } = collectTree(tree);
    const backdrops = findByClass(elements, "backdrop");
    expect(backdrops).toHaveLength(1);
    const onClick = (backdrops[0].props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Test 4: Panel click does NOT call onClose (stops propagation)
  it("4. clicking the panel does NOT call onClose (stopPropagation)", () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements } = collectTree(tree);
    const panels = findByClass(elements, "panel");
    expect(panels).toHaveLength(1);
    const onClick = (panels[0].props as Record<string, unknown>).onClick as (
      e: { stopPropagation: () => void }
    ) => void;
    // Simulate a click event with stopPropagation
    const fakeEvent = { stopPropagation: vi.fn() };
    onClick(fakeEvent);
    expect(onClose).not.toHaveBeenCalled();
    expect(fakeEvent.stopPropagation).toHaveBeenCalledOnce();
  });

  // Test 5: Empty rows — renders HandHistoryTable's empty state
  it('5. empty rows renders HandHistoryTable showing "No hands played yet"', () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { strings } = collectTree(tree);
    expect(strings.join("")).toContain("No hands played yet");
  });

  // Test 6: Non-empty rows — HandHistoryTable receives row data
  it("6. non-empty rows renders HandHistoryTable with row data visible", () => {
    const onClose = vi.fn();
    const rows = [makeRow({ handNumber: 1 }), makeRow({ handNumber: 2 })];
    const tree = HandHistoryModal({ rows, onClose });
    const { strings } = collectTree(tree);
    const joined = strings.join("");
    expect(joined).toContain("H1");
    expect(joined).toContain("H2");
  });

  // Test 7: ARIA dialog attributes on the panel and title id on h2
  it("7. panel has role=dialog, aria-modal, aria-labelledby and h2 has matching id", () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements } = collectTree(tree);
    const panels = findByClass(elements, "panel");
    expect(panels).toHaveLength(1);
    const panelProps = panels[0].props as Record<string, unknown>;
    expect(panelProps.role).toBe("dialog");
    expect(panelProps["aria-modal"]).toBe("true");
    expect(panelProps["aria-labelledby"]).toBe("hand-history-modal-title");

    const h2s = findByType(elements, "h2");
    expect(h2s).toHaveLength(1);
    const h2Props = h2s[0].props as Record<string, unknown>;
    expect(h2Props.id).toBe("hand-history-modal-title");
  });

  // Test 8: Escape key dismisses the modal
  it("8. pressing Escape on the panel calls onClose", () => {
    const onClose = vi.fn();
    const tree = HandHistoryModal({ rows: [], onClose });
    const { elements } = collectTree(tree);
    const panels = findByClass(elements, "panel");
    expect(panels).toHaveLength(1);
    const onKeyDown = (panels[0].props as Record<string, unknown>).onKeyDown as (
      e: { key: string }
    ) => void;
    onKeyDown({ key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
