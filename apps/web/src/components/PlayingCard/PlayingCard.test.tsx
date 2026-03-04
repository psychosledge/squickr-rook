import { describe, it, expect, vi } from "vitest";
import React from "react";
import PlayingCard from "./PlayingCard";

// Mock CSS modules
vi.mock("./PlayingCard.module.css", () => ({
  default: {
    card: "card",
    unplayable: "unplayable",
    selected: "selected",
    faceDown: "faceDown",
    topLeft: "topLeft",
    center: "center",
    bottomRight: "bottomRight",
    displayOnly: "displayOnly",
    fromNest: "fromNest",
  },
}));

// Mock cardDisplay utility
vi.mock("@/utils/cardDisplay", () => ({
  getCardDisplay: () => ({
    label: "5",
    colorName: "Red",
    bgColor: "#ff0000",
    borderColor: "#cc0000",
    textColor: "#ffffff",
  }),
}));

// ---------------------------------------------------------------------------
// Helper: render PlayingCard as a React element (no DOM needed)
// ---------------------------------------------------------------------------
function renderCard(props: Parameters<typeof PlayingCard>[0]) {
  return PlayingCard(props) as React.ReactElement;
}

function getProps(el: React.ReactElement): Record<string, unknown> {
  return el.props as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests: isPlayable behaviour (existing)
// ---------------------------------------------------------------------------

describe("PlayingCard — isPlayable prop", () => {
  it("applies unplayable class when isPlayable=false", () => {
    const el = renderCard({ cardId: "R5", isPlayable: false });
    const className = getProps(el).className as string;
    expect(className).toContain("unplayable");
  });

  it("does NOT apply unplayable class when isPlayable=true (default)", () => {
    const el = renderCard({ cardId: "R5" });
    const className = getProps(el).className as string;
    expect(className).not.toContain("unplayable");
  });

  it("has no onClick / role when isPlayable=false and no onClick passed", () => {
    const el = renderCard({ cardId: "R5", isPlayable: false });
    expect(getProps(el).onClick).toBeUndefined();
    expect(getProps(el).role).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: isDisplay prop (new — Bug 1 fix)
// ---------------------------------------------------------------------------

describe("PlayingCard — isDisplay prop", () => {
  it("does NOT apply unplayable class when isDisplay=true", () => {
    const el = renderCard({ cardId: "R5", isPlayable: false, isDisplay: true });
    const className = getProps(el).className as string;
    expect(className).not.toContain("unplayable");
  });

  it("does NOT apply unplayable class when isDisplay=true even without explicit isPlayable", () => {
    const el = renderCard({ cardId: "R5", isDisplay: true });
    const className = getProps(el).className as string;
    expect(className).not.toContain("unplayable");
  });

  it("has no onClick handler when isDisplay=true", () => {
    const handler = vi.fn();
    const el = renderCard({ cardId: "R5", isDisplay: true, onClick: handler });
    expect(getProps(el).onClick).toBeUndefined();
  });

  it("has no role='button' when isDisplay=true", () => {
    const handler = vi.fn();
    const el = renderCard({ cardId: "R5", isDisplay: true, onClick: handler });
    expect(getProps(el).role).toBeUndefined();
  });

  it("still renders card content (not face-down) when isDisplay=true", () => {
    const el = renderCard({ cardId: "R5", isDisplay: true });
    // Should return a div with card class, not faceDown
    const className = getProps(el).className as string;
    expect(className).toContain("card");
    expect(className).not.toContain("faceDown");
  });

  it("applies displayOnly class when isDisplay=true", () => {
    const el = renderCard({ cardId: "R5", isDisplay: true });
    const className = getProps(el).className as string;
    expect(className).toContain("displayOnly");
  });

  it("does NOT apply displayOnly class when isDisplay=false (default)", () => {
    const el = renderCard({ cardId: "R5" });
    const className = getProps(el).className as string;
    expect(className).not.toContain("displayOnly");
  });
});

// ---------------------------------------------------------------------------
// Tests: isDisplay=false should behave the same as not passing isDisplay
// ---------------------------------------------------------------------------

describe("PlayingCard — isDisplay=false is same as default", () => {
  it("applies unplayable class when isPlayable=false and isDisplay=false", () => {
    const el = renderCard({ cardId: "R5", isPlayable: false, isDisplay: false });
    const className = getProps(el).className as string;
    expect(className).toContain("unplayable");
  });
});

// ---------------------------------------------------------------------------
// Tests: faceDown prop still works
// ---------------------------------------------------------------------------

describe("PlayingCard — faceDown prop", () => {
  it("renders faceDown div when faceDown=true", () => {
    const el = renderCard({ cardId: "R5", faceDown: true });
    const className = getProps(el).className as string;
    expect(className).toContain("faceDown");
  });
});

// ---------------------------------------------------------------------------
// Tests: selected prop
// ---------------------------------------------------------------------------

describe("PlayingCard — isSelected prop", () => {
  it("applies selected class when isSelected=true", () => {
    const el = renderCard({ cardId: "R5", isSelected: true });
    const className = getProps(el).className as string;
    expect(className).toContain("selected");
  });

  it("does NOT apply selected class when isSelected=false (default)", () => {
    const el = renderCard({ cardId: "R5" });
    const className = getProps(el).className as string;
    expect(className).not.toContain("selected");
  });
});

// ---------------------------------------------------------------------------
// Tests: isFromNest prop
// ---------------------------------------------------------------------------

describe("PlayingCard — isFromNest prop", () => {
  it("applies fromNest class to wrapper div when isFromNest=true", () => {
    const el = renderCard({ cardId: "R5", isFromNest: true });
    const className = getProps(el).className as string;
    expect(className).toContain("fromNest");
  });

  it("does NOT apply fromNest class when isFromNest=false", () => {
    const el = renderCard({ cardId: "R5", isFromNest: false });
    const className = getProps(el).className as string;
    expect(className).not.toContain("fromNest");
  });

  it("does NOT apply fromNest class when isFromNest is omitted", () => {
    const el = renderCard({ cardId: "R5" });
    const className = getProps(el).className as string;
    expect(className).not.toContain("fromNest");
  });

  it("does NOT render any 'NEST' text in the DOM", () => {
    const el = renderCard({ cardId: "R5", isFromNest: true });
    // Recursively collect all string children — none should be "NEST"
    function collectStrings(node: React.ReactNode): string[] {
      const strings: string[] = [];
      function visit(n: React.ReactNode) {
        if (n == null || typeof n === "boolean") return;
        if (typeof n === "string") { strings.push(n); return; }
        if (typeof n === "number") { strings.push(String(n)); return; }
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (!React.isValidElement(n)) return;
        const p = (n as React.ReactElement).props as Record<string, unknown>;
        visit(p.children as React.ReactNode);
      }
      visit(node);
      return strings;
    }
    expect(collectStrings(el)).not.toContain("NEST");
  });

  it("applies both fromNest and selected classes when isFromNest=true and isSelected=true", () => {
    const el = renderCard({ cardId: "R5", isFromNest: true, isSelected: true });
    const className = getProps(el).className as string;
    expect(className).toContain("fromNest");
    expect(className).toContain("selected");
  });
});

// ---------------------------------------------------------------------------
// Tests: aria-label with isFromNest
// ---------------------------------------------------------------------------

describe("PlayingCard — aria-label (from nest)", () => {
  it('includes " (from nest)" in aria-label when isFromNest=true', () => {
    const el = renderCard({ cardId: "R5", isFromNest: true });
    expect(getProps(el)["aria-label"]).toBe("5 Red (from nest)");
  });

  it('does NOT include " (from nest)" in aria-label when isFromNest=false', () => {
    const el = renderCard({ cardId: "R5", isFromNest: false });
    expect(getProps(el)["aria-label"]).toBe("5 Red");
  });

  it('does NOT include " (from nest)" in aria-label when isFromNest is omitted', () => {
    const el = renderCard({ cardId: "R5" });
    expect(getProps(el)["aria-label"]).toBe("5 Red");
  });
});
