import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { GameState } from "@rook/engine";
import { DEFAULT_RULES } from "@rook/engine";
import { BiddingOverlayView } from "./BiddingOverlay";
import type { BiddingOverlayViewProps } from "./BiddingOverlay";

// Mock CSS modules
vi.mock("./BiddingOverlay.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    title: "title",
    currentBid: "currentBid",
    bidTable: "bidTable",
    bidTableRow: "bidTableRow",
    seatName: "seatName",
    bidVal: "bidVal",
    passed: "passed",
    activeRow: "activeRow",
    picker: "picker",
    stepBtn: "stepBtn",
    pickerAmount: "pickerAmount",
    confirmBidBtn: "confirmBidBtn",
    passBtn: "passBtn",
    moonBtn: "moonBtn",
    waiting: "waiting",
    thinking: "thinking",
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

function flattenStrings(node: React.ReactNode): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (typeof node === "boolean") return [];
  if (!React.isValidElement(node)) return [];
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return childNodes.flatMap(flattenStrings);
}

/** Find buttons by className match */
function findButtons(
  elements: React.ReactElement[],
  classMatch: string
): React.ReactElement[] {
  return elements.filter((el) => {
    if (el.type !== "button") return false;
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

/** Find elements by className match (any tag) — exact match by default */
function findByClass(
  elements: React.ReactElement[],
  classMatch: string,
  exact = false
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    if (typeof p.className !== "string") return false;
    return exact ? p.className === classMatch : p.className.includes(classMatch);
  });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const HUMAN = "N" as const;

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
    handNumber: 1,
    dealer: "W",
    seed: 42,
    activePlayer: HUMAN,
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

/** Build default view props (amount=minNextBid) */
function makeViewProps(
  gsOverrides: Partial<GameState> = {},
  viewOverrides: Partial<BiddingOverlayViewProps> = {}
): BiddingOverlayViewProps {
  const gs = makeGameState(gsOverrides);
  const minNextBid = gs.currentBid === 0 ? gs.rules.minimumBid : gs.currentBid + gs.rules.bidIncrement;
  return {
    gameState: gs,
    onPlaceBid: vi.fn(),
    onPass: vi.fn(),
    onShootMoon: vi.fn(),
    pickerAmount: minNextBid,
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    ...viewOverrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BiddingOverlay — Stepper UX", () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it("1. stepper shows the correct initial amount (minNextBid = 100) when no bids have been placed", () => {
    const props = makeViewProps(); // currentBid=0 → minNextBid=100, pickerAmount=100
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // No quick-bid button
    expect(findButtons(all, "quickBidBtn")).toHaveLength(0);

    // Stepper amount should reflect minNextBid=100
    const amountEls = findByClass(all, "pickerAmount");
    expect(amountEls).toHaveLength(1);
    const text = flattenStrings(amountEls[0]).join("");
    expect(text).toBe("100");
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it("2. stepper (+/− and confirm button) is always visible when it's the human's turn", () => {
    const props = makeViewProps(); // human's turn, minNextBid=100
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // Picker (stepper row) should always be visible — exact class match avoids "pickerAmount" false positive
    const pickerDivs = findByClass(all, "picker", true);
    expect(pickerDivs).toHaveLength(1);

    // Confirm bid button should always be visible
    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(1);

    // No quick-bid button
    expect(findButtons(all, "quickBidBtn")).toHaveLength(0);

    // No "Bid more…" toggle button
    const bidMoreLinks = findButtons(all, "bidMoreLink");
    expect(bidMoreLinks).toHaveLength(0);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it("3. stepper shows the correct initial amount (minNextBid)", () => {
    const props = makeViewProps({}, { pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const amountEls = findByClass(all, "pickerAmount");
    expect(amountEls).toHaveLength(1);
    const amountText = flattenStrings(amountEls[0]).join("");
    expect(amountText).toBe("100");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it("4. '+' stepBtn is enabled when pickerAmount < maximumBid", () => {
    const props = makeViewProps({}, { pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);
    const stepBtns = findButtons(all, "stepBtn");
    expect(stepBtns.length).toBeGreaterThanOrEqual(2);

    const plusBtn = stepBtns[1];
    const plusProps = plusBtn.props as Record<string, unknown>;
    expect(plusProps.disabled).toBeFalsy();
    // onClick wires up to onIncrement
    expect(typeof plusProps.onClick).toBe("function");
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it("5. '−' stepBtn is disabled when pickerAmount === minNextBid (100)", () => {
    const props = makeViewProps({}, { pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);
    const stepBtns = findButtons(all, "stepBtn");
    expect(stepBtns.length).toBeGreaterThanOrEqual(2);

    const minusBtn = stepBtns[0];
    const minusProps = minusBtn.props as Record<string, unknown>;
    expect(minusProps.disabled).toBe(true);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it("6. '+' stepBtn is disabled when pickerAmount === maximumBid (200)", () => {
    const props = makeViewProps({}, { pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);
    const stepBtns = findButtons(all, "stepBtn");

    const plusBtn = stepBtns[1];
    const plusProps = plusBtn.props as Record<string, unknown>;
    expect(plusProps.disabled).toBe(true);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it("7. stepper and confirm button are visible; no quick-bid button", () => {
    const props = makeViewProps({}, { pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // No "Bid more…" / "← Back" toggle at all
    const bidMoreLinks = findButtons(all, "bidMoreLink");
    expect(bidMoreLinks).toHaveLength(0);

    // No quick-bid button
    const quickBidBtns = findButtons(all, "quickBidBtn");
    expect(quickBidBtns).toHaveLength(0);

    // Stepper always visible — exact class match avoids "pickerAmount" false positive
    const pickerDivs = findByClass(all, "picker", true);
    expect(pickerDivs).toHaveLength(1);

    // Confirm bid always visible
    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(1);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  it("8. 'Confirm bid: X' shows pickerAmount and calls onPlaceBid with that amount", () => {
    const onPlaceBid = vi.fn();
    const props = makeViewProps({}, { pickerAmount: 115, onPlaceBid });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(1);

    const btnText = flattenStrings(confirmBtns[0]).join("");
    expect(btnText).toContain("115");

    const onClick = (confirmBtns[0].props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onPlaceBid).toHaveBeenCalledWith(115);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────
  it("9. confirm button at minNextBid calls onPlaceBid(100) when pickerAmount starts at 100", () => {
    const onPlaceBid = vi.fn();
    const props = makeViewProps({}, { onPlaceBid }); // pickerAmount defaults to minNextBid=100
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // No quick-bid button present
    expect(findButtons(all, "quickBidBtn")).toHaveLength(0);

    // Confirm button present and fires with 100
    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(1);

    const onClick = (confirmBtns[0].props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onPlaceBid).toHaveBeenCalledWith(100);
  });

  // ── Test 10 ──────────────────────────────────────────────────────────────
  it("10. Pass button is always visible and calls onPass", () => {
    const onPass = vi.fn();
    const props = makeViewProps({}, { onPass });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const passBtns = findButtons(all, "passBtn");
    expect(passBtns).toHaveLength(1);

    const onClick = (passBtns[0].props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onPass).toHaveBeenCalledOnce();
  });

  // ── Test 11 ──────────────────────────────────────────────────────────────
  it("11. Moon button is visible when moonEligible (no prior numeric bid, not already in moonShooters)", () => {
    const props = makeViewProps({
      bids: { N: null, E: null, S: null, W: null },
      moonShooters: [],
    });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const moonBtns = findButtons(all, "moonBtn");
    expect(moonBtns).toHaveLength(1);
  });

  // ── Test 12 ──────────────────────────────────────────────────────────────
  it("12. Moon button is NOT visible when player has already placed a numeric bid (bids[N] is a number)", () => {
    const props = makeViewProps({
      bids: { N: 105, E: null, S: null, W: null },
      currentBid: 105,
      moonShooters: [],
    });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const moonBtns = findButtons(all, "moonBtn");
    expect(moonBtns).toHaveLength(0);
  });

  // ── Test 13 ──────────────────────────────────────────────────────────────
  it("13. Moon button is NOT visible when player is already in moonShooters", () => {
    const props = makeViewProps({
      bids: { N: null, E: null, S: null, W: null },
      moonShooters: [HUMAN],
    });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const moonBtns = findButtons(all, "moonBtn");
    expect(moonBtns).toHaveLength(0);
  });
});

describe("BiddingOverlay — thinking / waiting messages", () => {
  // ── Test 14 ──────────────────────────────────────────────────────────────
  it("14. When biddingThinkingSeat is null and !isMyTurn, shows '<Label> is bidding…'", () => {
    const props = makeViewProps(
      { activePlayer: "E" as const },
      { biddingThinkingSeat: null },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const waitingEls = findByClass(all, "waiting");
    expect(waitingEls).toHaveLength(1);

    const text = flattenStrings(waitingEls[0]).join("");
    expect(text).toBe("Label-E is bidding…");
  });

  // ── Test 15 ──────────────────────────────────────────────────────────────
  it("15. When biddingThinkingSeat='E' and !isMyTurn, shows 'Label-E is thinking…' with .thinking class", () => {
    const props = makeViewProps(
      { activePlayer: "E" as const },
      { biddingThinkingSeat: "E" as const },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const waitingEls = findByClass(all, "waiting");
    expect(waitingEls).toHaveLength(1);

    // Find the span with .thinking class inside the waiting div
    const thinkingSpans = flattenElements(waitingEls[0]).filter((el) => {
      const p = el.props as Record<string, unknown>;
      return typeof p.className === "string" && p.className.includes("thinking");
    });
    expect(thinkingSpans).toHaveLength(1);

    const text = flattenStrings(waitingEls[0]).join("");
    expect(text).toContain("Label-E is thinking…");
  });

  // ── Test 16 ──────────────────────────────────────────────────────────────
  it("16. When biddingThinkingSeat='E' and isMyTurn, human controls are still shown", () => {
    // Edge case: biddingThinkingSeat set but it's actually human's turn
    const props = makeViewProps(
      { activePlayer: "N" as const },
      { biddingThinkingSeat: "E" as const },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // Human controls should be visible
    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(1);

    const passBtns = findButtons(all, "passBtn");
    expect(passBtns).toHaveLength(1);

    // Waiting div should NOT be shown when isMyTurn
    const waitingEls = findByClass(all, "waiting");
    expect(waitingEls).toHaveLength(0);
  });

  // ── Test 17 ──────────────────────────────────────────────────────────────
  it("17. When biddingThinkingSeat is null and isMyTurn, the .waiting div is NOT rendered", () => {
    const props = makeViewProps(
      { activePlayer: "N" as const },
      { biddingThinkingSeat: null },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const waitingEls = findByClass(all, "waiting");
    expect(waitingEls).toHaveLength(0);
  });
});

describe("BiddingOverlay — seatNames override", () => {
  // ── Test 18 ──────────────────────────────────────────────────────────────
  it("18. bid table uses seatNames display name when provided for a seat", () => {
    const seatNames = { N: "Alice", E: "Bob", S: "Carol", W: "Dave" };
    const props = makeViewProps({}, { seatNames });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // Find all seatName cells
    const seatCells = findByClass(all, "seatName");
    const texts = seatCells.map((el) => flattenStrings(el).join(""));
    expect(texts).toContain("Alice");
    expect(texts).toContain("Bob");
    expect(texts).toContain("Carol");
    expect(texts).toContain("Dave");
    // Should NOT use the getSeatLabel fallback for those seats
    expect(texts).not.toContain("Label-N");
    expect(texts).not.toContain("Label-E");
  });

  // ── Test 19 ──────────────────────────────────────────────────────────────
  it("19. bid table falls back to getSeatLabel when seatNames not provided", () => {
    const props = makeViewProps();
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const seatCells = findByClass(all, "seatName");
    const texts = seatCells.map((el) => flattenStrings(el).join(""));
    expect(texts).toContain("Label-N");
    expect(texts).toContain("Label-E");
    expect(texts).toContain("Label-S");
    expect(texts).toContain("Label-W");
  });

  // ── Test 20 ──────────────────────────────────────────────────────────────
  it("20. waiting message uses seatNames when biddingThinkingSeat is set", () => {
    const seatNames = { E: "Bob" };
    const props = makeViewProps(
      { activePlayer: "E" as const },
      { biddingThinkingSeat: "E" as const, seatNames },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const waitingEls = findByClass(all, "waiting");
    const text = flattenStrings(waitingEls[0]).join("");
    expect(text).toContain("Bob is thinking…");
    expect(text).not.toContain("Label-E");
  });

  // ── Test 21 ──────────────────────────────────────────────────────────────
  it("21. waiting message uses seatNames when activePlayer is bidding (no thinking seat)", () => {
    const seatNames = { S: "Carol" };
    const props = makeViewProps(
      { activePlayer: "S" as const },
      { biddingThinkingSeat: null, seatNames },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const waitingEls = findByClass(all, "waiting");
    const text = flattenStrings(waitingEls[0]).join("");
    expect(text).toContain("Carol is bidding…");
    expect(text).not.toContain("Label-S");
  });
});

describe("BiddingOverlay — moon lockout (once someone has shot the moon)", () => {
  // State where E already shot the moon: currentBid=200, moonShooters=["E"]
  function makeMoonShotState(humanBid: number | null | "pass" = null): Partial<GameState> {
    return {
      activePlayer: HUMAN,
      currentBid: 200,
      bids: { N: humanBid, E: 200, S: "pass", W: "pass" },
      moonShooters: ["E" as const],
    };
  }

  // ── Test 22 ──────────────────────────────────────────────────────────────
  it("22. numeric stepper (picker div) is NOT rendered when moonShooters.length > 0", () => {
    const props = makeViewProps(makeMoonShotState(), { pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const pickerDivs = findByClass(all, "picker", true);
    expect(pickerDivs).toHaveLength(0);
  });

  // ── Test 23 ──────────────────────────────────────────────────────────────
  it("23. 'Confirm bid' button is NOT rendered when moonShooters.length > 0", () => {
    const props = makeViewProps(makeMoonShotState(), { pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const confirmBtns = findButtons(all, "confirmBidBtn");
    expect(confirmBtns).toHaveLength(0);
  });

  // ── Test 24 ──────────────────────────────────────────────────────────────
  it("24. PASS button IS still rendered when moonShooters.length > 0", () => {
    const props = makeViewProps(makeMoonShotState(), { pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const passBtns = findButtons(all, "passBtn");
    expect(passBtns).toHaveLength(1);
  });

  // ── Test 25 ──────────────────────────────────────────────────────────────
  it("25. Moon button IS shown when moonShooters.length > 0 but human has not yet shot or passed", () => {
    // Human has null bid, E already shot moon — human is still moonEligible
    const props = makeViewProps(makeMoonShotState(null), { pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const moonBtns = findButtons(all, "moonBtn");
    expect(moonBtns).toHaveLength(1);
  });

  // ── Test 26 ──────────────────────────────────────────────────────────────
  it("26. Moon button is NOT shown when human is already in moonShooters (even if moonAlreadyShot=true)", () => {
    const props = makeViewProps(
      {
        activePlayer: HUMAN,
        currentBid: 200,
        bids: { N: 200, E: 200, S: "pass", W: "pass" },
        moonShooters: [HUMAN, "E" as const],
      },
      { pickerAmount: 200 },
    );
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const moonBtns = findButtons(all, "moonBtn");
    expect(moonBtns).toHaveLength(0);
  });
});
