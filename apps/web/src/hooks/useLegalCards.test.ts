import { describe, it, expect } from "vitest";
import { useLegalCards } from "./useLegalCards";
import type { GameState, CardId } from "@rook/engine";
import { DEFAULT_RULES } from "@rook/engine";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlayingGameState(overrides: Partial<GameState> = {}): GameState {
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
    hands: {
      N: ["R5", "G7", "B10"] as CardId[],
      E: [],
      S: [],
      W: [],
    },
    nest: [],
    originalNest: [],
    discarded: [],
    trump: "Red",
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
    bidder: "N",
    bidAmount: 120,
    shotMoon: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useLegalCards", () => {
  it("returns [] when gameState is null", () => {
    const result = useLegalCards(null, "N");
    expect(result).toEqual([]);
  });

  it("returns [] when gameState is null for any seat", () => {
    const result = useLegalCards(null, "E");
    expect(result).toEqual([]);
  });

  it("returns legal card IDs when it is the seat's turn during playing phase", () => {
    // N is active, leading the trick — all cards in hand are legal
    const gameState = makePlayingGameState({ activePlayer: "N" });
    const result = useLegalCards(gameState, "N");
    // N's hand is ["R5", "G7", "B10"] and N is leading — all are legal
    expect(result).toEqual(["R5", "G7", "B10"]);
  });

  it("returns [] when it is NOT the seat's turn (non-active player during playing phase)", () => {
    // N is active but we ask for E's legal cards
    const gameState = makePlayingGameState({ activePlayer: "N" });
    const result = useLegalCards(gameState, "E");
    expect(result).toEqual([]);
  });

  it("returns [] during bidding phase (no PlayCard commands)", () => {
    const gameState = makePlayingGameState({
      phase: "bidding",
      activePlayer: "N",
      trump: null,
    });
    const result = useLegalCards(gameState, "N");
    expect(result).toEqual([]);
  });

  it("online scenario: non-null gameState with playing phase returns correct legal cards", () => {
    // Simulates the online multiplayer scenario where gameState comes from
    // server (not from local Zustand store) — the key UAT bug this fixes
    const gameState = makePlayingGameState({
      activePlayer: "N",
      hands: { N: ["B5", "B10"] as CardId[], E: [], S: [], W: [] },
      currentTrick: [], // leading — both cards are legal
    });
    const result = useLegalCards(gameState, "N");
    expect(result).toEqual(["B5", "B10"]);
  });

  it("does NOT throw and returns [] when called for a non-active seat with masked hand ('??')", () => {
    // Regression test: in online multiplayer, opponents' hands arrive as masked
    // cardIds ("??"). Before the fix, calling useLegalCards for an opponent seat
    // (even when that seat is the activePlayer) would crash with
    // "Unknown color initial: ?" because legalCommands tried to parse "??".
    //
    // Two guard lines protect against this:
    //  1. activePlayer !== seat  → returns [] for any seat that is not active
    //  2. hand contains "??"    → returns [] when the active seat has a masked hand
    //     (prevents the throw inside getLegalCards when a trick is already in progress)
    const gameState = makePlayingGameState({
      activePlayer: "S",
      hands: {
        N: ["R5", "G7", "B10"] as CardId[],
        E: ["??", "??", "??"] as CardId[],
        S: ["??", "??", "??"] as CardId[], // S is active but hand is masked (opponent)
        W: ["??", "??", "??"] as CardId[],
      },
      // Non-empty trick forces getLegalCards to call cardFromId on hand cards —
      // the actual crash path that produced "Unknown color initial: ?"
      currentTrick: [{ seat: "N", cardId: "R5" as CardId }],
    });

    // Calling for seat "N" (not active) — must return [] without throwing
    expect(() => useLegalCards(gameState, "N")).not.toThrow();
    expect(useLegalCards(gameState, "N")).toEqual([]);

    // Calling for seat "S" (active, but masked hand with a trick in progress) —
    // must return [] without throwing. This is the real crash scenario.
    expect(() => useLegalCards(gameState, "S")).not.toThrow();
    expect(useLegalCards(gameState, "S")).toEqual([]);
  });
});
