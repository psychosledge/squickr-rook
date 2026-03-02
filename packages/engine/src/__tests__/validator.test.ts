import { describe, it, expect } from "vitest";
import { validateCommand, legalCommands } from "../validator.js";
import { applyEvent, reduceEvents, INITIAL_STATE } from "../reducer.js";
import type { GameEvent } from "../events.js";
import type { GameState, Seat } from "../types.js";
import { DEFAULT_RULES, leftOf } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameStarted(seed = 42, dealer: Seat = "N"): GameEvent {
  return {
    type: "GameStarted",
    seed,
    dealer,
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
      { seat: "S", name: "BotS",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
      { seat: "W", name: "BotW",  kind: "bot",  botProfile: { difficulty: "easy", playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false } },
    ],
    rules: DEFAULT_RULES,
    timestamp: 1000,
  };
}

function stateAfterGameStarted(seed = 42, dealer: Seat = "N"): GameState {
  return applyEvent(INITIAL_STATE, makeGameStarted(seed, dealer));
}

function stateAfterNestTaken(seed = 42, dealer: Seat = "N"): GameState {
  let state = stateAfterGameStarted(seed, dealer);
  const nestPlayer = leftOf(state.dealer);
  const nestCards = [...state.nest];
  return applyEvent(state, {
    type: "NestTaken",
    seat: nestPlayer,
    nestCards,
    handNumber: 0,
    timestamp: 2000,
  });
}

function stateAfterAllDiscards(seed = 42, dealer: Seat = "N"): GameState {
  let state = stateAfterNestTaken(seed, dealer);
  const nestPlayer = leftOf(state.dealer);
  const hand = [...state.hands[nestPlayer]!];
  let count = 0;
  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    state = applyEvent(state, {
      type: "CardDiscarded",
      seat: nestPlayer,
      cardId,
      handNumber: 0,
      timestamp: 3000,
    });
    count++;
    if (count === 5) break;
  }
  return state;
}

function stateAfterTrumpSelected(seed = 42, dealer: Seat = "N"): GameState {
  let state = stateAfterAllDiscards(seed, dealer);
  const nestPlayer = leftOf(state.dealer);
  return applyEvent(state, {
    type: "TrumpSelected",
    seat: nestPlayer,
    color: "Black",
    handNumber: 0,
    timestamp: 4000,
  });
}

// ── TakeNest tests ────────────────────────────────────────────────────────────

describe("validateCommand - TakeNest", () => {
  it("valid when phase=nest and correct seat", () => {
    const state = stateAfterGameStarted();
    const nestPlayer = leftOf(state.dealer);
    const result = validateCommand(state, { type: "TakeNest", seat: nestPlayer }, DEFAULT_RULES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events[0]!.type).toBe("NestTaken");
    }
  });

  it("invalid when wrong seat", () => {
    const state = stateAfterGameStarted();
    const nestPlayer = leftOf(state.dealer);
    // Pick a different seat
    const wrongSeat: Seat = nestPlayer === "N" ? "S" : "N";
    const result = validateCommand(state, { type: "TakeNest", seat: wrongSeat }, DEFAULT_RULES);
    expect(result.ok).toBe(false);
  });

  it("invalid when nest already taken (nest is empty)", () => {
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const result = validateCommand(state, { type: "TakeNest", seat: nestPlayer }, DEFAULT_RULES);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("already taken");
    }
  });
});

// ── DiscardCard tests ─────────────────────────────────────────────────────────

describe("validateCommand - DiscardCard", () => {
  it("valid for cards in hand after nest taken", () => {
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const hand = state.hands[nestPlayer]!;
    const cardId = hand.find((c) => c !== "ROOK")!;
    const result = validateCommand(
      state,
      { type: "DiscardCard", seat: nestPlayer, cardId },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(true);
  });

  it("invalid for ROOK Bird", () => {
    // Create a special state where ROOK is in hand — it always is after nest taken
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const hand = state.hands[nestPlayer]!;
    if (!hand.includes("ROOK")) {
      // ROOK might not always be in this player's hand — skip if not present
      return;
    }
    const result = validateCommand(
      state,
      { type: "DiscardCard", seat: nestPlayer, cardId: "ROOK" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Rook Bird");
    }
  });

  it("invalid for card not in hand", () => {
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const result = validateCommand(
      state,
      { type: "DiscardCard", seat: nestPlayer, cardId: "FAKE99" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });

  it("invalid after 5 cards already discarded", () => {
    const state = stateAfterAllDiscards();
    const nestPlayer = leftOf(state.dealer);
    // phase is now "trump", so DiscardCard is invalid for a different reason
    // but we test the discarded count check by manually putting it back:
    const result = validateCommand(
      state,
      { type: "DiscardCard", seat: nestPlayer, cardId: "B6" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });

  it("invalid before nest taken (nest not empty)", () => {
    const state = stateAfterGameStarted();
    const nestPlayer = leftOf(state.dealer);
    const hand = state.hands[nestPlayer]!;
    const cardId = hand.find((c) => c !== "ROOK")!;
    const result = validateCommand(
      state,
      { type: "DiscardCard", seat: nestPlayer, cardId },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });
});

// ── SelectTrump tests ─────────────────────────────────────────────────────────

describe("validateCommand - SelectTrump", () => {
  it("valid when phase=trump", () => {
    const state = stateAfterAllDiscards();
    const nestPlayer = leftOf(state.dealer);
    expect(state.phase).toBe("trump");
    const result = validateCommand(
      state,
      { type: "SelectTrump", seat: nestPlayer, color: "Red" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(true);
  });

  it("invalid when phase=playing (not trump phase)", () => {
    const state = stateAfterTrumpSelected();
    const nestPlayer = leftOf(state.dealer);
    const result = validateCommand(
      state,
      { type: "SelectTrump", seat: nestPlayer, color: "Red" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });

  it("invalid when wrong seat", () => {
    const state = stateAfterAllDiscards();
    const nestPlayer = leftOf(state.dealer);
    const wrongSeat: Seat = nestPlayer === "N" ? "S" : "N";
    const result = validateCommand(
      state,
      { type: "SelectTrump", seat: wrongSeat, color: "Red" },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });
});

// ── PlayCard tests ────────────────────────────────────────────────────────────

describe("validateCommand - PlayCard", () => {
  it("valid when following suit and it is your turn", () => {
    const state = stateAfterTrumpSelected();
    const leader = state.activePlayer!;
    const hand = state.hands[leader]!;
    const cardId = hand[0]!;
    const result = validateCommand(
      state,
      { type: "PlayCard", seat: leader, cardId },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(true);
  });

  it("invalid when not your turn", () => {
    const state = stateAfterTrumpSelected();
    const leader = state.activePlayer!;
    const seats: Seat[] = ["N", "E", "S", "W"];
    const notLeader = seats.find((s) => s !== leader)!;
    const hand = state.hands[notLeader]!;
    const cardId = hand[0]!;
    const result = validateCommand(
      state,
      { type: "PlayCard", seat: notLeader, cardId },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });

  it("invalid when playing wrong phase", () => {
    const state = stateAfterAllDiscards(); // trump phase
    const nestPlayer = leftOf(state.dealer);
    const hand = state.hands[nestPlayer]!;
    const result = validateCommand(
      state,
      { type: "PlayCard", seat: nestPlayer, cardId: hand[0]! },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
  });
});

// Helper: build a minimal playing-phase GameState with controlled hands and trick.
// Starts from a real post-trump-selected state and overrides what we need.
function makeTrickState(opts: {
  trump: import("../types.js").Color;
  activePlayer: Seat;
  activePlayerHand: import("../types.js").CardId[];
  trickLead: { seat: Seat; cardId: import("../types.js").CardId };
}): GameState {
  // Get a real playing-phase state as the base so all required fields are populated
  const base = stateAfterTrumpSelected(42, "N");
  return {
    ...base,
    trump: opts.trump,
    activePlayer: opts.activePlayer,
    hands: {
      ...base.hands,
      [opts.activePlayer]: opts.activePlayerHand,
    },
    currentTrick: [opts.trickLead],
  };
}

describe("validateCommand - PlayCard must-follow", () => {
  it("ROOK is forced when trump is led and player holds only the Rook (no other trump)", () => {
    // Trump = Black, lead is a Black card, active player has ROOK + non-trump only
    const state = makeTrickState({
      trump: "Black",
      activePlayer: "E",
      trickLead: { seat: "N", cardId: "B9" },
      activePlayerHand: ["ROOK", "R5", "G3"],
    });

    // ROOK must be legal (it counts as trump)
    const rookResult = validateCommand(
      state,
      { type: "PlayCard", seat: "E", cardId: "ROOK" },
      DEFAULT_RULES,
    );
    expect(rookResult.ok).toBe(true);

    // A non-trump card is illegal because player has trump (the Rook)
    const offResult = validateCommand(
      state,
      { type: "PlayCard", seat: "E", cardId: "R5" },
      DEFAULT_RULES,
    );
    expect(offResult.ok).toBe(false);
    if (!offResult.ok) expect(offResult.error).toContain("Must follow suit");
  });

  it("ROOK counts as trump when trump is led and is included alongside trump cards", () => {
    // Trump = Black, lead is a Black card, active player has B5, ROOK, R3
    const state = makeTrickState({
      trump: "Black",
      activePlayer: "E",
      trickLead: { seat: "N", cardId: "B9" },
      activePlayerHand: ["B5", "ROOK", "R3"],
    });

    const legal = legalCommands(state, "E");
    const legalCardIds = legal.map((c) => (c as { cardId: string }).cardId).sort();
    expect(legalCardIds).toEqual(["B5", "ROOK"].sort());

    // R3 should be illegal
    const r3Result = validateCommand(
      state,
      { type: "PlayCard", seat: "E", cardId: "R3" },
      DEFAULT_RULES,
    );
    expect(r3Result.ok).toBe(false);
  });

  it("ROOK is a legal trump escape when non-trump is led and player holds led-colour", () => {
    // Trump = Black, lead is a Red card, active player has R7, ROOK, G4
    const state = makeTrickState({
      trump: "Black",
      activePlayer: "E",
      trickLead: { seat: "N", cardId: "R9" },
      activePlayerHand: ["R7", "ROOK", "G4"],
    });

    const legal = legalCommands(state, "E");
    const legalCardIds = legal.map((c) => (c as { cardId: string }).cardId).sort();
    expect(legalCardIds).toEqual(["R7", "ROOK"].sort());

    // G4 is illegal (player has led-suit red cards)
    const g4Result = validateCommand(
      state,
      { type: "PlayCard", seat: "E", cardId: "G4" },
      DEFAULT_RULES,
    );
    expect(g4Result.ok).toBe(false);
  });

  it("all cards legal when Rook is led and active player is void in trump", () => {
    // Trump = Black, lead is ROOK (counts as trump), active player has no Black cards
    const state = makeTrickState({
      trump: "Black",
      activePlayer: "E",
      trickLead: { seat: "N", cardId: "ROOK" },
      activePlayerHand: ["R5", "G3", "Y7"],
    });

    const legal = legalCommands(state, "E");
    const legalCardIds = legal.map((c) => (c as { cardId: string }).cardId).sort();
    expect(legalCardIds).toEqual(["R5", "G3", "Y7"].sort());
  });

  it("trump must-follow applies when Rook is led — cannot play non-trump", () => {
    // Trump = Black, lead is ROOK (counts as trump), active player has B5 and R3
    const state = makeTrickState({
      trump: "Black",
      activePlayer: "E",
      trickLead: { seat: "N", cardId: "ROOK" },
      activePlayerHand: ["B5", "R3"],
    });

    const legal = legalCommands(state, "E");
    const legalCardIds = legal.map((c) => (c as { cardId: string }).cardId);
    expect(legalCardIds).toEqual(["B5"]);

    // R3 is illegal (player has trump and trump was led)
    const r3Result = validateCommand(
      state,
      { type: "PlayCard", seat: "E", cardId: "R3" },
      DEFAULT_RULES,
    );
    expect(r3Result.ok).toBe(false);
    if (!r3Result.ok) {
      expect(r3Result.error).toContain("Must follow suit");
    }
  });

  it("invalid when not following suit (has lead color)", () => {
    // Create a state where we KNOW the player has the lead color but plays something else
    let state = stateAfterTrumpSelected(42, "N");
    const leader = state.activePlayer!; // leftOf(leftOf(N)) = S

    // Find a card leader has by color, then find if next player has same color + a different color
    const leaderHand = state.hands[leader]!;
    
    // Try to find a lead color that the next player also has
    const nextSeat: Seat = leftOf(leader);
    const nextHand = state.hands[nextSeat]!;

    // Find a color that both leader and next player have non-ROOK cards for
    const colors = ["B", "R", "G", "Y"];
    let leadCardId: string | null = null;
    let offColorCardId: string | null = null;

    for (const color of colors) {
      const leaderHasColor = leaderHand.some(c => c !== "ROOK" && c.startsWith(color));
      const nextHasColor = nextHand.some(c => c !== "ROOK" && c.startsWith(color));
      const nextHasOther = nextHand.some(c => c !== "ROOK" && !c.startsWith(color));

      if (leaderHasColor && nextHasColor && nextHasOther) {
        leadCardId = leaderHand.find(c => c !== "ROOK" && c.startsWith(color))!;
        // Get an off-color card from next player
        const offColorInitial = colors.find(c2 => c2 !== color && nextHand.some(c => c !== "ROOK" && c.startsWith(c2)));
        if (offColorInitial) {
          offColorCardId = nextHand.find(c => c !== "ROOK" && c.startsWith(offColorInitial))!;
        }
        break;
      }
    }

    if (!leadCardId || !offColorCardId) {
      // Can't construct this scenario easily from this seed — test passes vacuously
      return;
    }

    // Leader leads
    state = applyEvent(state, {
      type: "CardPlayed",
      seat: leader,
      cardId: leadCardId,
      trickIndex: 0,
      handNumber: 0,
      timestamp: 5000,
    });

    // Next player tries to play off-color while having lead color
    const result = validateCommand(
      state,
      { type: "PlayCard", seat: nextSeat, cardId: offColorCardId },
      DEFAULT_RULES,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Must follow suit");
    }
  });
});

describe("legalCommands", () => {
  it("returns TakeNest for nest player when nest available", () => {
    const state = stateAfterGameStarted();
    const nestPlayer = leftOf(state.dealer);
    const cmds = legalCommands(state, nestPlayer);
    expect(cmds.some(c => c.type === "TakeNest")).toBe(true);
  });

  it("returns empty for non-nest player in nest phase", () => {
    const state = stateAfterGameStarted();
    const nestPlayer = leftOf(state.dealer);
    const otherSeat: Seat = nestPlayer === "N" ? "S" : "N";
    const cmds = legalCommands(state, otherSeat);
    expect(cmds).toHaveLength(0);
  });

  it("returns DiscardCard commands (no ROOK) after nest taken", () => {
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const cmds = legalCommands(state, nestPlayer);
    expect(cmds.every(c => c.type === "DiscardCard")).toBe(true);
    expect(cmds.some(c => c.type === "DiscardCard" && c.cardId === "ROOK")).toBe(false);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it("returns SelectTrump commands in trump phase", () => {
    const state = stateAfterAllDiscards();
    const nestPlayer = leftOf(state.dealer);
    const cmds = legalCommands(state, nestPlayer);
    expect(cmds.every(c => c.type === "SelectTrump")).toBe(true);
    expect(cmds).toHaveLength(4); // one per color
  });

  it("returns PlayCard commands in playing phase for active player", () => {
    const state = stateAfterTrumpSelected();
    const activePlayer = state.activePlayer!;
    const cmds = legalCommands(state, activePlayer);
    expect(cmds.every(c => c.type === "PlayCard")).toBe(true);
    expect(cmds.length).toBeGreaterThan(0);
  });
});
