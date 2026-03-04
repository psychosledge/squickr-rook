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
    quickBidBtn: "quickBidBtn",
    bidMoreLink: "bidMoreLink",
    picker: "picker",
    stepBtn: "stepBtn",
    pickerAmount: "pickerAmount",
    confirmBidBtn: "confirmBidBtn",
    passBtn: "passBtn",
    moonBtn: "moonBtn",
    waiting: "waiting",
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

/** Find elements by className match (any tag) */
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

/** Build default view props (picker closed, amount=minNextBid) */
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
    pickerOpen: false,
    pickerAmount: minNextBid,
    onOpenPicker: vi.fn(),
    onClosePicker: vi.fn(),
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    ...viewOverrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BiddingOverlay — Quick-Bid + Stepper UX", () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it("1. renders 'Bid 100' quick-bid button when no bids have been placed yet (minNextBid = 100)", () => {
    const props = makeViewProps(); // currentBid=0 → minNextBid=100
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);
    const quickBidBtns = findButtons(all, "quickBidBtn");

    expect(quickBidBtns).toHaveLength(1);
    const text = flattenStrings(quickBidBtns[0]).join("");
    expect(text).toContain("100");
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it("2. 'Bid more…' toggle is visible; picker is hidden initially (picker div absent)", () => {
    const props = makeViewProps(); // pickerOpen=false
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    // "Bid more…" link should be present
    const bidMoreLinks = findButtons(all, "bidMoreLink");
    expect(bidMoreLinks).toHaveLength(1);
    const linkText = flattenStrings(bidMoreLinks[0]).join("");
    expect(linkText).toContain("Bid more");

    // Picker div should be absent when closed
    const pickerDivs = findByClass(all, "picker");
    expect(pickerDivs).toHaveLength(0);

    // Quick-bid button is visible when closed
    expect(findButtons(all, "quickBidBtn")).toHaveLength(1);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it("3. stepper shows the correct initial amount (minNextBid) when picker is open", () => {
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const amountEls = findByClass(all, "pickerAmount");
    expect(amountEls).toHaveLength(1);
    const amountText = flattenStrings(amountEls[0]).join("");
    expect(amountText).toBe("100");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it("4. '+' stepBtn is enabled when pickerAmount < maximumBid", () => {
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 100 });
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
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 100 });
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
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 200 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);
    const stepBtns = findButtons(all, "stepBtn");

    const plusBtn = stepBtns[1];
    const plusProps = plusBtn.props as Record<string, unknown>;
    expect(plusProps.disabled).toBe(true);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it("7. '← Back' text is shown and quickBidBtn is hidden when picker is open", () => {
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 100 });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const bidMoreLinks = findButtons(all, "bidMoreLink");
    expect(bidMoreLinks).toHaveLength(1);
    const linkText = flattenStrings(bidMoreLinks[0]).join("");
    expect(linkText).toContain("Back");

    // Quick-bid button should be hidden when picker is open
    const quickBidBtns = findButtons(all, "quickBidBtn");
    expect(quickBidBtns).toHaveLength(0);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  it("8. 'Confirm bid: X' shows pickerAmount and calls onPlaceBid with that amount", () => {
    const onPlaceBid = vi.fn();
    const props = makeViewProps({}, { pickerOpen: true, pickerAmount: 115, onPlaceBid });
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
  it("9. quick-bid button calls onPlaceBid(minNextBid=100)", () => {
    const onPlaceBid = vi.fn();
    const props = makeViewProps({}, { onPlaceBid });
    const element = BiddingOverlayView(props);
    const all = flattenElements(element);

    const quickBidBtns = findButtons(all, "quickBidBtn");
    expect(quickBidBtns).toHaveLength(1);

    const onClick = (quickBidBtns[0].props as Record<string, unknown>).onClick as () => void;
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
