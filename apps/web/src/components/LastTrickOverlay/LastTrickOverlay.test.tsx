import { describe, it, expect, vi } from "vitest";
import React from "react";
import LastTrickOverlay from "./LastTrickOverlay";
import type { CompletedTrick, Seat } from "@rook/engine";

// Mock CSS modules
vi.mock("./LastTrickOverlay.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    title: "title",
    winner: "winner",
    btn: "btn",
  },
}));

// Mock seatLabel utility
vi.mock("@/utils/seatLabel", () => ({
  getSeatLabel: (seat: string) => {
    const labels: Record<string, string> = { N: "You", E: "P2", S: "P3", W: "P4" };
    return labels[seat] ?? seat;
  },
}));

// Mock CurrentTrick to avoid rendering PlayingCard/CSS module complexity
vi.mock("@/components/CurrentTrick/CurrentTrick", () => ({
  default: (props: { trick: unknown; trump: unknown; humanSeat?: Seat }) =>
    React.createElement("div", { "data-testid": "current-trick" }, String(props.humanSeat ?? "")),
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as NestOverlay / HandResultOverlay tests)
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

function findByClass(
  elements: React.ReactElement[],
  classMatch: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    if (typeof p.className !== "string") return false;
    return p.className.includes(classMatch);
  });
}

function findByType(
  elements: React.ReactElement[],
  type: string,
): React.ReactElement[] {
  return elements.filter((el) => el.type === type);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_TRICK: CompletedTrick = {
  plays: [
    { seat: "N", cardId: "G10" },
    { seat: "E", cardId: "R5" },
    { seat: "S", cardId: "B7" },
    { seat: "W", cardId: "Y12" },
  ],
  winner: "E",
  leadColor: "Green",
};

function makeProps(overrides: Partial<Parameters<typeof LastTrickOverlay>[0]> = {}) {
  return {
    lastTrick: MINIMAL_TRICK,
    trump: null as Parameters<typeof LastTrickOverlay>[0]["trump"],
    onClose: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LastTrickOverlay", () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it('1. renders title "Last Trick"', () => {
    const tree = LastTrickOverlay(makeProps());
    const text = flattenText(tree);
    expect(text).toContain("Last Trick");
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it('2. renders winner label using getSeatLabel when seatNames not provided (winner="E" → "P2 won")', () => {
    const tree = LastTrickOverlay(makeProps({ lastTrick: { ...MINIMAL_TRICK, winner: "E" } }));
    const text = flattenText(tree);
    expect(text).toContain("P2");
    expect(text).toContain("won");
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it('3. renders winner label using seatNames when provided for winner seat (winner="E", seatNames={E:"Bob"} → "Bob won")', () => {
    const tree = LastTrickOverlay(
      makeProps({
        lastTrick: { ...MINIMAL_TRICK, winner: "E" },
        seatNames: { E: "Bob" },
      }),
    );
    const text = flattenText(tree);
    expect(text).toContain("Bob");
    expect(text).toContain("won");
    expect(text).not.toContain("P2");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("4. renders CurrentTrick component in the tree", () => {
    const tree = LastTrickOverlay(makeProps());
    const { elements } = collectTree(tree);
    // CurrentTrick is mocked — in the JSX tree it's a React element whose
    // type is the mock function. We identify it by the presence of a "trick" prop.
    const trickEls = elements.filter((el) => {
      const p = el.props as Record<string, unknown>;
      return "trick" in p;
    });
    expect(trickEls).toHaveLength(1);
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("5. renders a Close button", () => {
    const tree = LastTrickOverlay(makeProps());
    const text = flattenText(tree);
    expect(text).toContain("Close");
    const { elements } = collectTree(tree);
    const buttons = findByType(elements, "button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("6. calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    const tree = LastTrickOverlay(makeProps({ onClose }));
    const { elements } = collectTree(tree);
    const buttons = findByType(elements, "button");
    const closeBtn = buttons.find((btn) => flattenText(btn).includes("Close"));
    expect(closeBtn).toBeDefined();
    const p = closeBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  it("7. calls onClose when backdrop (overlay div) is clicked", () => {
    const onClose = vi.fn();
    const tree = LastTrickOverlay(makeProps({ onClose }));
    const { elements } = collectTree(tree);
    const overlayDivs = findByClass(elements, "overlay");
    expect(overlayDivs).toHaveLength(1);
    const p = overlayDivs[0].props as Record<string, unknown>;
    expect(typeof p.onClick).toBe("function");
    (p.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────
  it("8. does NOT call onClose when panel interior is clicked (stopPropagation)", () => {
    const onClose = vi.fn();
    const tree = LastTrickOverlay(makeProps({ onClose }));
    const { elements } = collectTree(tree);
    const panelDivs = findByClass(elements, "panel");
    expect(panelDivs).toHaveLength(1);
    const p = panelDivs[0].props as Record<string, unknown>;
    expect(typeof p.onClick).toBe("function");
    // Simulate click on panel — it should stopPropagation, not call onClose
    const mockEvent = { stopPropagation: vi.fn() };
    (p.onClick as (e: unknown) => void)(mockEvent);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────
  it("9. passes humanSeat prop through to CurrentTrick", () => {
    const tree = LastTrickOverlay(makeProps({ humanSeat: "S" }));
    const { elements } = collectTree(tree);
    // CurrentTrick is in the JSX tree as a component element with a "trick" prop.
    // Check that humanSeat="S" is passed through via its props.
    const trickEls = elements.filter((el) => {
      const p = el.props as Record<string, unknown>;
      return "trick" in p;
    });
    expect(trickEls).toHaveLength(1);
    const trickProps = trickEls[0].props as Record<string, unknown>;
    expect(trickProps["humanSeat"]).toBe("S");
  });
});
