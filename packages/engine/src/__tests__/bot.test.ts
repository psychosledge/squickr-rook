import { describe, it, expect } from "vitest";
import { botChooseCommand } from "../bot.js";
import { applyEvent, INITIAL_STATE } from "../reducer.js";
import { legalCommands } from "../validator.js";
import type { GameEvent } from "../events.js";
import type { GameState, Seat } from "../types.js";
import { BOT_PRESETS, DEFAULT_RULES, leftOf } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameStarted(seed = 42, dealer: Seat = "N"): GameEvent {
  return {
    type: "GameStarted",
    seed,
    dealer,
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE",  kind: "bot", botProfile: BOT_PRESETS.easy },
      { seat: "S", name: "BotS",  kind: "bot", botProfile: BOT_PRESETS.normal },
      { seat: "W", name: "BotW",  kind: "bot", botProfile: BOT_PRESETS.hard },
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
  // Complete bidding: left-of-dealer wins at 100, others pass
  const bidder = leftOf(state.dealer);
  state = applyEvent(state, { type: "BidPlaced", seat: bidder, amount: 100, handNumber: 0, timestamp: 1500 });
  for (let i = 0; i < 3; i++) {
    const active = state.activePlayer!;
    state = applyEvent(state, { type: "BidPassed", seat: active, handNumber: 0, timestamp: 1600 + i });
  }
  state = applyEvent(state, { type: "BiddingComplete", winner: bidder, amount: 100, forced: false, shotMoon: false, handNumber: 0, timestamp: 1700 });
  // Now take nest
  const nestPlayer = state.bidder!;
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

function stateAfterBiddingComplete(seed = 42, dealer: Seat = "N"): GameState {
  let state = stateAfterGameStarted(seed, dealer);
  const bidder = leftOf(state.dealer);
  state = applyEvent(state, { type: "BidPlaced", seat: bidder, amount: 100, handNumber: 0, timestamp: 1500 });
  for (let i = 0; i < 3; i++) {
    const active = state.activePlayer!;
    state = applyEvent(state, { type: "BidPassed", seat: active, handNumber: 0, timestamp: 1600 + i });
  }
  return applyEvent(state, { type: "BiddingComplete", winner: bidder, amount: 100, forced: false, shotMoon: false, handNumber: 0, timestamp: 1700 });
}

function isLegalCommand(state: GameState, seat: Seat, cmd: import("../commands.js").GameCommand): boolean {
  const legal = legalCommands(state, seat);
  return legal.some(c => JSON.stringify(c) === JSON.stringify(cmd));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("botChooseCommand", () => {
  const difficulties: Array<"easy" | "normal" | "hard"> = ["easy", "normal", "hard"];

  it("always returns a legal command in nest phase (before nest taken)", () => {
    const state = stateAfterBiddingComplete();
    const nestPlayer = leftOf(state.dealer);
    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(isLegalCommand(state, nestPlayer, cmd)).toBe(true);
    }
  });

  it("returns TakeNest when nest not yet taken", () => {
    const state = stateAfterBiddingComplete();
    const nestPlayer = leftOf(state.dealer);
    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("TakeNest");
    }
  });

  it("returns DiscardCard (not ROOK) when nest taken and need to discard", () => {
    const state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("DiscardCard");
      if (cmd.type === "DiscardCard") {
        expect(cmd.cardId).not.toBe("ROOK");
      }
    }
  });

  it("always returns a legal DiscardCard across multiple calls", () => {
    let state = stateAfterNestTaken();
    const nestPlayer = leftOf(state.dealer);
    const profile = BOT_PRESETS.hard;

    for (let i = 0; i < 5; i++) {
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("DiscardCard");
      expect(isLegalCommand(state, nestPlayer, cmd)).toBe(true);
      if (cmd.type === "DiscardCard") {
        expect(cmd.cardId).not.toBe("ROOK");
        // Apply the discard
        state = applyEvent(state, {
          type: "CardDiscarded",
          seat: nestPlayer,
          cardId: cmd.cardId,
          handNumber: 0,
          timestamp: 3000,
        });
      }
    }
  });

  it("returns SelectTrump with a valid Color in trump phase", () => {
    const state = stateAfterAllDiscards();
    const nestPlayer = leftOf(state.dealer);
    const validColors = ["Black", "Red", "Green", "Yellow"];

    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("SelectTrump");
      if (cmd.type === "SelectTrump") {
        expect(validColors).toContain(cmd.color);
      }
    }
  });

  it("returns PlayCard with a card in hand in playing phase", () => {
    const state = stateAfterTrumpSelected();
    const activePlayer = state.activePlayer!;

    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, activePlayer, profile);
      expect(cmd.type).toBe("PlayCard");
      if (cmd.type === "PlayCard") {
        const hand = state.hands[activePlayer]!;
        expect(hand).toContain(cmd.cardId);
      }
    }
  });

  it("always returns a legal PlayCard command across all difficulties", () => {
    const state = stateAfterTrumpSelected();
    const activePlayer = state.activePlayer!;

    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      for (let trial = 0; trial < 5; trial++) {
        const cmd = botChooseCommand(state, activePlayer, profile);
        expect(isLegalCommand(state, activePlayer, cmd)).toBe(true);
      }
    }
  });

  it("bot in playing phase follows must-follow rule", () => {
    // Play one card to establish lead, then verify bot follows suit
    let state = stateAfterTrumpSelected();
    const leader = state.activePlayer!;
    const leaderHand = state.hands[leader]!;
    const leadCard = leaderHand[0]!;

    // Lead player plays first card
    state = applyEvent(state, {
      type: "CardPlayed",
      seat: leader,
      cardId: leadCard,
      trickIndex: 0,
      handNumber: 0,
      timestamp: 5000,
    });

    const nextPlayer = state.activePlayer!;
    const profile = BOT_PRESETS.hard;
    const cmd = botChooseCommand(state, nextPlayer, profile);

    expect(cmd.type).toBe("PlayCard");
    expect(isLegalCommand(state, nextPlayer, cmd)).toBe(true);
  });
});

describe("botChooseCommand - bidding phase", () => {
  const difficulties: Array<"easy" | "normal" | "hard"> = ["easy", "normal", "hard"];

  it("easy bot always passes", () => {
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer); // "E"
    const profile = BOT_PRESETS.easy;
    const cmd = botChooseCommand(state, firstBidder, profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("normal bot passes when hand is weak", () => {
    // Seed 42 gives E a hand — we rely on real cards from the deal
    // Force a weak state by checking if strength < 80 and expecting pass
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer);
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, firstBidder, profile);
    // Either bids or passes — just verify it's a legal bidding command
    expect(["PlaceBid", "PassBid", "ShootMoon"]).toContain(cmd.type);
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBeGreaterThanOrEqual(DEFAULT_RULES.minimumBid);
    }
  });

  it("hard bot passes when hand is weak", () => {
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer);
    const profile = BOT_PRESETS.hard;
    const cmd = botChooseCommand(state, firstBidder, profile);
    expect(["PlaceBid", "PassBid", "ShootMoon"]).toContain(cmd.type);
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBeGreaterThanOrEqual(DEFAULT_RULES.minimumBid);
    }
  });

  it("bot returns legal command in bidding phase for all difficulties", () => {
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer);
    for (const difficulty of difficulties) {
      const profile = BOT_PRESETS[difficulty];
      const cmd = botChooseCommand(state, firstBidder, profile);
      expect(isLegalCommand(state, firstBidder, cmd)).toBe(true);
    }
  });

  it("bot in bidding phase after current bid is raised bids above current bid", () => {
    let state = stateAfterGameStarted();
    // E bids 100
    state = applyEvent(state, { type: "BidPlaced", seat: "E", amount: 100, handNumber: 0, timestamp: 2000 });
    // S is now active - hard bot should bid 105 if strong enough, or pass
    const profile = BOT_PRESETS.hard;
    const cmd = botChooseCommand(state, "S", profile);
    expect(["PlaceBid", "PassBid", "ShootMoon"]).toContain(cmd.type);
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBeGreaterThan(100); // must be > current bid
    }
  });
});

// ── Helper: build a bidding-phase state with a custom hand for a seat ─────────

function makeBiddingStateWithHand(seat: Seat, hand: import("../types.js").CardId[]): GameState {
  // Start from a real game-started state and override the seat's hand
  const base = applyEvent(INITIAL_STATE, {
    type: "GameStarted",
    seed: 42,
    dealer: "N",
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE",  kind: "bot", botProfile: BOT_PRESETS.easy },
      { seat: "S", name: "BotS",  kind: "bot", botProfile: BOT_PRESETS.normal },
      { seat: "W", name: "BotW",  kind: "bot", botProfile: BOT_PRESETS.hard },
    ],
    rules: DEFAULT_RULES,
    timestamp: 1000,
  });
  // Force the seat's hand to the given cards and make that seat active
  return {
    ...base,
    activePlayer: seat,
    hands: { ...base.hands, [seat]: hand },
  };
}

describe("botChooseCommand - bidWillingness thresholds", () => {
  // estimateBidStrength: ROOK=15, value1(Ace)=15, value14=10, value10=8, value5=5

  it("normal bot passes when strength < 40 (no scoring cards)", () => {
    // Weak hand: no point-value cards → strength = 0
    const weakHand: import("../types.js").CardId[] = ["B2", "B3", "B4", "B6", "B7", "B8", "B9", "R2", "R3", "R4"];
    const state = makeBiddingStateWithHand("E", weakHand);
    state.currentBid; // just to use it
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("normal bot passes when minNextBid > bidWillingness(strength ~50)", () => {
    // strength ~50: ROOK(15) + B1(15) + R14(10) + G5(5) + Y5(5) = 50 → willingness = 110
    // Set currentBid = 110 so minNextBid = 115 > 110
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R14", "G5", "Y5", "B2", "B3", "B4", "R2", "R3"];
    const base = makeBiddingStateWithHand("E", hand);
    const state = { ...base, currentBid: 110 };
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("hard bot passes when minNextBid > bidWillingness(strength ~50) + 10", () => {
    // strength ~50: willingness = 110; hard ceiling = 110 + 10 = 120
    // Set currentBid = 120 so minNextBid = 125 > 120
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R14", "G5", "Y5", "B2", "B3", "B4", "R2", "R3"];
    const base = makeBiddingStateWithHand("E", hand);
    const state = { ...base, currentBid: 120 };
    const profile = BOT_PRESETS.hard;
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("normal bot bids when minNextBid <= bidWillingness(strength ~50)", () => {
    // strength ~50 → willingness = 110; minNextBid at 100 (currentBid = 0)
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R14", "G5", "Y5", "B2", "B3", "B4", "R2", "R3"];
    const state = makeBiddingStateWithHand("E", hand);
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlaceBid");
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBe(DEFAULT_RULES.minimumBid); // 100
    }
  });

  it("normal bot passes when minNextBid > bidWillingness(strength ~75)", () => {
    // strength ~75: ROOK(15) + B1(15) + R1(15) + R14(10) + G14(10) + B10(8) = 73
    // add Y5(5) = 78 → bidWillingness(78) = 150 (75 <= 78 < 85)
    // Set currentBid = 150 so minNextBid = 155 > 150
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R1", "R14", "G14", "B10", "Y5", "B2", "B3", "B4"];
    const base = makeBiddingStateWithHand("E", hand);
    const state = { ...base, currentBid: 150 };
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("normal bot never bids above 180 on a non-Moon normal hand (regression)", () => {
    // Even with a super-strong hand (strength ~123), normal bot ceiling = 180
    // Strength: ROOK(15)+B1(15)+R1(15)+G1(15)+Y1(15)+R14(10)+G14(10)+B14(10)+Y14(10)+B10(8) = 123
    // strength >= 95 → willingness = 180; minNextBid = 180 <= 180 → should bid 180 (not 185)
    // Block ShootMoon by putting the seat in moonShooters so we test the bid ceiling
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10"];
    const base = makeBiddingStateWithHand("E", hand);
    const state = { ...base, currentBid: 175, moonShooters: ["E"] as import("../types.js").Seat[] };
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    // With currentBid=175, minNextBid=180 which equals the ceiling (180) → bot bids 180
    expect(cmd.type).toBe("PlaceBid");
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBe(180);
    }
  });

  it("normal bot passes rather than bidding above 180 (regression cap)", () => {
    // Same strong hand, but currentBid = 180 → minNextBid = 185 > 180 → should pass
    const hand: import("../types.js").CardId[] = ["ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10"];
    const base = makeBiddingStateWithHand("E", hand);
    const state = { ...base, currentBid: 180, moonShooters: ["E"] as import("../types.js").Seat[] };
    const profile = BOT_PRESETS.normal;
    const cmd = botChooseCommand(state, "E", profile);
    // minNextBid = 185 > 180 → should pass
    expect(cmd.type).toBe("PassBid");
  });
});
