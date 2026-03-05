import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { GameState, CardId, Seat } from "@rook/engine";
import { DEFAULT_RULES } from "@rook/engine";

// Mock CSS modules
vi.mock("./GameTable.module.css", () => ({
  default: { table: "table", top: "top", left: "left", right: "right", bottom: "bottom", center: "center" },
}));

// Mock child components
vi.mock("@/components/PlayerSeat/PlayerSeat", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/CurrentTrick/CurrentTrick", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/utils/sortHand", () => ({
  sortHand: (hand: unknown[]) => hand,
}));

import PlayerSeat from "@/components/PlayerSeat/PlayerSeat";
import GameTable from "./GameTable";

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

function findByType(
  elements: React.ReactElement[],
  // eslint-disable-next-line @typescript-eslint/ban-types
  componentType: Function,
): React.ReactElement[] {
  return elements.filter((el) => el.type === componentType);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const nHand = ["N1", "N2"] as unknown as CardId[];
const eHand = ["E1", "E2"] as unknown as CardId[];
const sHand = ["S1", "S2"] as unknown as CardId[];
const wHand = ["W1", "W2"] as unknown as CardId[];

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    phase: "playing",
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
    activePlayer: "N",
    hands: { N: nHand, E: eHand, S: sHand, W: wHand },
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

function getPlayerSeats(tree: React.ReactNode) {
  const all = flattenElements(tree);
  return findByType(all, PlayerSeat);
}

function getSeatByPosition(tree: React.ReactNode, position: "bottom" | "top" | "left" | "right") {
  const all = flattenElements(tree);
  // Find the div with class matching position, then find the PlayerSeat inside it
  const positionDivs = all.filter(
    (el) =>
      el.type === "div" &&
      (el.props as Record<string, unknown>).className === position,
  );
  if (positionDivs.length === 0) return null;
  const divChildren = flattenElements(positionDivs[0]);
  const seats = findByType(divChildren, PlayerSeat);
  return seats[0] ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameTable", () => {
  const onPlayCard = vi.fn();

  it("1. humanSeat omitted (defaults to N): seat N is rendered at bottom face-up", () => {
    const gameState = makeGameState({ activePlayer: "N" });
    const tree = GameTable({ gameState, onPlayCard });
    const bottomSeat = getSeatByPosition(tree, "bottom");
    expect(bottomSeat).not.toBeNull();
    const p = bottomSeat!.props as Record<string, unknown>;
    expect(p.seat).toBe("N");
    expect(p.faceDown).toBe(false);
  });

  it("2. humanSeat='E': E is bottom face-up, W is top face-down, S is left face-down, N is right face-down", () => {
    const gameState = makeGameState({ activePlayer: "E" });
    const tree = GameTable({ gameState, onPlayCard, humanSeat: "E" as Seat });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const topSeat = getSeatByPosition(tree, "top");
    const leftSeat = getSeatByPosition(tree, "left");
    const rightSeat = getSeatByPosition(tree, "right");

    expect((bottomSeat!.props as Record<string, unknown>).seat).toBe("E");
    expect((bottomSeat!.props as Record<string, unknown>).faceDown).toBe(false);

    expect((topSeat!.props as Record<string, unknown>).seat).toBe("W");
    expect((topSeat!.props as Record<string, unknown>).faceDown).toBe(true);

    expect((leftSeat!.props as Record<string, unknown>).seat).toBe("S");
    expect((leftSeat!.props as Record<string, unknown>).faceDown).toBe(true);

    expect((rightSeat!.props as Record<string, unknown>).seat).toBe("N");
    expect((rightSeat!.props as Record<string, unknown>).faceDown).toBe(true);
  });

  it("3. humanSeat='S': S is bottom face-up, N is top face-down", () => {
    const gameState = makeGameState({ activePlayer: "S" });
    const tree = GameTable({ gameState, onPlayCard, humanSeat: "S" as Seat });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const topSeat = getSeatByPosition(tree, "top");

    expect((bottomSeat!.props as Record<string, unknown>).seat).toBe("S");
    expect((bottomSeat!.props as Record<string, unknown>).faceDown).toBe(false);
    expect((topSeat!.props as Record<string, unknown>).seat).toBe("N");
    expect((topSeat!.props as Record<string, unknown>).faceDown).toBe(true);
  });

  it("4. humanSeat='W': W is bottom face-up, E is top face-down", () => {
    const gameState = makeGameState({ activePlayer: "W" });
    const tree = GameTable({ gameState, onPlayCard, humanSeat: "W" as Seat });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const topSeat = getSeatByPosition(tree, "top");

    expect((bottomSeat!.props as Record<string, unknown>).seat).toBe("W");
    expect((bottomSeat!.props as Record<string, unknown>).faceDown).toBe(false);
    expect((topSeat!.props as Record<string, unknown>).seat).toBe("E");
    expect((topSeat!.props as Record<string, unknown>).faceDown).toBe(true);
  });

  it("5. onCardClick is provided to bottom seat when it is human's turn", () => {
    const gameState = makeGameState({ activePlayer: "N", phase: "playing" });
    const tree = GameTable({ gameState, onPlayCard });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const p = bottomSeat!.props as Record<string, unknown>;
    expect(p.onCardClick).toBe(onPlayCard);
  });

  it("5b. onCardClick is NOT provided to bottom seat when it is NOT human's turn", () => {
    const gameState = makeGameState({ activePlayer: "E", phase: "playing" });
    const tree = GameTable({ gameState, onPlayCard });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const p = bottomSeat!.props as Record<string, unknown>;
    expect(p.onCardClick).toBeUndefined();
  });

  it("5c. onCardClick is NOT provided to non-bottom seats even when humanSeat='E' and it is E's turn", () => {
    const gameState = makeGameState({ activePlayer: "E", phase: "playing" });
    const tree = GameTable({ gameState, onPlayCard, humanSeat: "E" as Seat });

    // Top, left, right should have no onCardClick
    const topSeat = getSeatByPosition(tree, "top");
    const leftSeat = getSeatByPosition(tree, "left");
    const rightSeat = getSeatByPosition(tree, "right");

    expect((topSeat!.props as Record<string, unknown>).onCardClick).toBeUndefined();
    expect((leftSeat!.props as Record<string, unknown>).onCardClick).toBeUndefined();
    expect((rightSeat!.props as Record<string, unknown>).onCardClick).toBeUndefined();
  });

  it("6. bottom seat uses the correct hand for the humanSeat", () => {
    const gameState = makeGameState({ activePlayer: "E" });
    const tree = GameTable({ gameState, onPlayCard, humanSeat: "E" as Seat });

    const bottomSeat = getSeatByPosition(tree, "bottom");
    const p = bottomSeat!.props as Record<string, unknown>;
    // sortHand is mocked to return its input
    expect(p.cards).toEqual(eHand);
  });

  it("7. exactly 4 PlayerSeat elements are rendered", () => {
    const gameState = makeGameState();
    const tree = GameTable({ gameState, onPlayCard });
    const seats = getPlayerSeats(tree);
    expect(seats).toHaveLength(4);
  });
});
