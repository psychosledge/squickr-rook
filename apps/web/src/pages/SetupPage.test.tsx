import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { BotDifficulty } from "@rook/engine";
import { SetupView, DifficultyPicker } from "./SetupPage";
import type { SetupViewProps, DifficultyPickerProps } from "./SetupPage";

// Mock CSS modules
vi.mock("./SetupPage.module.css", () => ({
  default: {
    page: "page",
    header: "header",
    backBtn: "backBtn",
    title: "title",
    card: "card",
    sectionHeading: "sectionHeading",
    pickerRow: "pickerRow",
    setAllRow: "setAllRow",
    seatLabel: "seatLabel",
    pickerButtons: "pickerButtons",
    diffBtn: "diffBtn",
    active: "active",
    diffLabel: "diffLabel",
    divider: "divider",
    startBtn: "startBtn",
  },
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as OnlineLobbyPage tests)
// ---------------------------------------------------------------------------

/**
 * Expand a React node tree into a flat list of React elements.
 * When a node is a function component (not a plain DOM tag string), call it
 * to expand its output so we can inspect the DOM it would produce.
 */
function flattenElements(node: React.ReactNode): React.ReactElement[] {
  if (node == null || typeof node !== "object") return [];
  if (!React.isValidElement(node)) return [];
  let el = node as React.ReactElement;

  // If the element type is a function component, call it to expand its output
  if (typeof el.type === "function") {
    try {
      const rendered = (el.type as (props: unknown) => React.ReactNode)(el.props);
      return flattenElements(rendered);
    } catch {
      // Ignore (e.g. hooks-based components that can't be called directly)
      return [];
    }
  }

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

  // Expand function components
  if (typeof el.type === "function") {
    try {
      const rendered = (el.type as (props: unknown) => React.ReactNode)(el.props);
      return flattenText(rendered);
    } catch {
      return "";
    }
  }

  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return childNodes.map(flattenText).join("");
}

function findButtons(
  elements: React.ReactElement[],
  classMatch: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    if (el.type !== "button") return false;
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSetupViewProps(overrides: Partial<SetupViewProps> = {}): SetupViewProps {
  return {
    botDifficulties: { E: 3, S: 3, W: 3 },
    onSetAll: vi.fn(),
    onSetSeat: vi.fn(),
    onStart: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

function makeDifficultyPickerProps(
  overrides: Partial<DifficultyPickerProps> = {},
): DifficultyPickerProps {
  return {
    value: 3,
    onChange: vi.fn(),
    label: "East",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SetupView tests (1–13)
// ---------------------------------------------------------------------------

describe("SetupView", () => {
  it("1. renders 'Start Game' button", () => {
    const tree = SetupView(makeSetupViewProps());
    const text = flattenText(tree);
    expect(text).toContain("Start Game");
  });

  it("2. renders '← Back' button", () => {
    const tree = SetupView(makeSetupViewProps());
    const text = flattenText(tree);
    expect(text).toContain("← Back");
  });

  it("3. renders 'Set All' label", () => {
    const tree = SetupView(makeSetupViewProps());
    const text = flattenText(tree);
    expect(text).toContain("Set All");
  });

  it("4. renders 'East', 'Partner', 'West' seat labels", () => {
    const tree = SetupView(makeSetupViewProps());
    const text = flattenText(tree);
    expect(text).toContain("East");
    expect(text).toContain("Partner");
    expect(text).toContain("West");
  });

  it("5. onStart called when 'Start Game' clicked", () => {
    const onStart = vi.fn();
    const tree = SetupView(makeSetupViewProps({ onStart }));
    const all = flattenElements(tree);
    const startBtns = findButtons(all, "startBtn").filter((el) =>
      flattenText(el).includes("Start Game"),
    );
    expect(startBtns).toHaveLength(1);
    const p = startBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("6. onBack called when '← Back' clicked", () => {
    const onBack = vi.fn();
    const tree = SetupView(makeSetupViewProps({ onBack }));
    const all = flattenElements(tree);
    const backBtns = findButtons(all, "backBtn").filter((el) =>
      flattenText(el).includes("Back"),
    );
    expect(backBtns).toHaveLength(1);
    const p = backBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("7. onSetAll called with correct difficulty when 'Set All' button clicked", () => {
    const onSetAll = vi.fn();
    const tree = SetupView(makeSetupViewProps({ onSetAll }));
    const all = flattenElements(tree);
    // Find the Set All row's difficulty buttons (aria-pressed buttons in the setAllRow area)
    // All diffBtn buttons — the Set All row's buttons come first
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    // 5 "Set All" buttons + 5*3 seat picker buttons = 20 total
    // The first 5 are the Set All buttons
    expect(diffBtns.length).toBeGreaterThanOrEqual(5);
    // Click first "Set All" button (difficulty=1)
    const p = diffBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onSetAll).toHaveBeenCalledWith(1);
  });

  it("8. setAllLabel shows 'Normal' when all seats are difficulty 3", () => {
    const tree = SetupView(makeSetupViewProps({ botDifficulties: { E: 3, S: 3, W: 3 } }));
    const text = flattenText(tree);
    expect(text).toContain("Normal");
  });

  it("9. setAllLabel shows 'Mixed' when seats differ", () => {
    const tree = SetupView(makeSetupViewProps({ botDifficulties: { E: 1, S: 3, W: 5 } }));
    const text = flattenText(tree);
    expect(text).toContain("Mixed");
  });

  it("10. setAllLabel shows 'Beginner' when all seats are difficulty 1", () => {
    const tree = SetupView(makeSetupViewProps({ botDifficulties: { E: 1, S: 1, W: 1 } }));
    const text = flattenText(tree);
    expect(text).toContain("Beginner");
  });

  it("11. setAllLabel shows 'Expert' when all seats are difficulty 5", () => {
    const tree = SetupView(makeSetupViewProps({ botDifficulties: { E: 5, S: 5, W: 5 } }));
    const text = flattenText(tree);
    expect(text).toContain("Expert");
  });

  it("12. onSetSeat called with 'E' and correct difficulty when East picker button clicked", () => {
    const onSetSeat = vi.fn();
    const tree = SetupView(makeSetupViewProps({ onSetSeat }));
    const all = flattenElements(tree);
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    // Buttons 0–4 are Set All, 5–9 are East, 10–14 are Partner, 15–19 are West
    expect(diffBtns.length).toBeGreaterThanOrEqual(10);
    // Click East's first button (difficulty=1)
    const p = diffBtns[5].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onSetSeat).toHaveBeenCalledWith("E", 1);
  });

  it("13. renders 5 difficulty buttons per seat row (1–5)", () => {
    const tree = SetupView(makeSetupViewProps());
    const all = flattenElements(tree);
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    // 5 (Set All) + 5 (East) + 5 (Partner) + 5 (West) = 20
    expect(diffBtns).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// DifficultyPicker tests (14–19)
// ---------------------------------------------------------------------------

describe("DifficultyPicker", () => {
  it("14. renders the seat label", () => {
    const tree = DifficultyPicker(makeDifficultyPickerProps({ label: "East" }));
    const text = flattenText(tree);
    expect(text).toContain("East");
  });

  it("15. renders 5 difficulty buttons", () => {
    const tree = DifficultyPicker(makeDifficultyPickerProps());
    const all = flattenElements(tree);
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    expect(diffBtns).toHaveLength(5);
  });

  it("16. active button corresponds to current value", () => {
    const tree = DifficultyPicker(makeDifficultyPickerProps({ value: 3 }));
    const all = flattenElements(tree);
    const activeBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("active");
    });
    expect(activeBtns).toHaveLength(1);
    const p = activeBtns[0].props as Record<string, unknown>;
    expect(p["aria-pressed"]).toBe(true);
    expect(flattenText(activeBtns[0])).toBe("3");
  });

  it("17. onChange called with correct difficulty when button clicked", () => {
    const onChange = vi.fn();
    const tree = DifficultyPicker(makeDifficultyPickerProps({ onChange }));
    const all = flattenElements(tree);
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    // Click button for difficulty=5 (last button)
    const p = diffBtns[4].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith(5 as BotDifficulty);
  });

  it("18. renders difficulty label text (e.g. 'Normal' for value=3)", () => {
    const tree = DifficultyPicker(makeDifficultyPickerProps({ value: 3 }));
    const all = flattenElements(tree);
    const diffLabelSpans = all.filter((el) => {
      if (el.type !== "span") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffLabel");
    });
    expect(diffLabelSpans).toHaveLength(1);
    expect(flattenText(diffLabelSpans[0])).toBe("Normal");
  });

  it("19. non-active buttons have aria-pressed=false", () => {
    const tree = DifficultyPicker(makeDifficultyPickerProps({ value: 2 }));
    const all = flattenElements(tree);
    const diffBtns = all.filter((el) => {
      if (el.type !== "button") return false;
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("diffBtn");
    });
    const nonActiveBtns = diffBtns.filter((el) => {
      const p = el.props as Record<string, unknown>;
      return p["aria-pressed"] === false;
    });
    expect(nonActiveBtns).toHaveLength(4);
  });
});
