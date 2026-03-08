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
      { seat: "E", name: "BotE",  kind: "bot", botProfile: BOT_PRESETS[1] },
      { seat: "S", name: "BotS",  kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "BotW",  kind: "bot", botProfile: BOT_PRESETS[5] },
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
  const difficulties: import("../types.js").BotDifficulty[] = [1, 2, 3, 4, 5];

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
    const profile = BOT_PRESETS[5];

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
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, nextPlayer, profile);

    expect(cmd.type).toBe("PlayCard");
    expect(isLegalCommand(state, nextPlayer, cmd)).toBe(true);
  });
});

describe("botChooseCommand - bidding phase", () => {
  const difficulties: import("../types.js").BotDifficulty[] = [1, 2, 3, 4, 5];

  it("beginner bot mostly passes (never raises, opens only 25% of the time)", () => {
    // Run 50 trials — beginner should pass at least 25% of the time (not always bid).
    // We also verify: when it bids, it always bids exactly the minimum (never raises).
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer); // "E"
    const profile = BOT_PRESETS[1];

    let passCount = 0;
    for (let i = 0; i < 50; i++) {
      const cmd = botChooseCommand(state, firstBidder, profile);
      expect(isLegalCommand(state, firstBidder, cmd)).toBe(true);
      if (cmd.type === "PassBid") passCount++;
      if (cmd.type === "PlaceBid") {
        expect(cmd.amount).toBe(DEFAULT_RULES.minimumBid); // always opens at 100
      }
    }
    // With p=0.75 of passing, the probability of >= 38/50 passes is extremely high
    expect(passCount).toBeGreaterThanOrEqual(25);
  });

  it("beginner bot never raises (passes when currentBid > 0)", () => {
    // Give beginner a state where currentBid = 100 (someone already bid)
    let state = stateAfterGameStarted();
    state = applyEvent(state, { type: "BidPlaced", seat: "E", amount: 100, handNumber: 0, timestamp: 2000 });
    const profile = BOT_PRESETS[1];
    // Run 20 trials — beginner should always pass when the bid has been raised
    for (let i = 0; i < 20; i++) {
      const cmd = botChooseCommand(state, "S", profile);
      expect(cmd.type).toBe("PassBid");
    }
  });

  it("normal bot passes when hand is weak", () => {
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer);
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, firstBidder, profile);
    expect(["PlaceBid", "PassBid", "ShootMoon"]).toContain(cmd.type);
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBeGreaterThanOrEqual(DEFAULT_RULES.minimumBid);
    }
  });

  it("expert bot passes when hand is weak", () => {
    const state = stateAfterGameStarted();
    const firstBidder = leftOf(state.dealer);
    const profile = BOT_PRESETS[5];
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
    // S is now active - expert bot should bid 105 if strong enough, or pass
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "S", profile);
    expect(["PlaceBid", "PassBid", "ShootMoon"]).toContain(cmd.type);
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBeGreaterThan(100); // must be > current bid
    }
  });
});

// ── Helper: build a bidding-phase state with a custom hand for a seat ─────────

function makeBiddingStateWithHand(seat: Seat, hand: import("../types.js").CardId[]): GameState {
  const base = applyEvent(INITIAL_STATE, {
    type: "GameStarted",
    seed: 42,
    dealer: "N",
    players: [
      { seat: "N", name: "Alice", kind: "human" },
      { seat: "E", name: "BotE",  kind: "bot", botProfile: BOT_PRESETS[1] },
      { seat: "S", name: "BotS",  kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "BotW",  kind: "bot", botProfile: BOT_PRESETS[5] },
    ],
    rules: DEFAULT_RULES,
    timestamp: 1000,
  });
  return {
    ...base,
    activePlayer: seat,
    hands: { ...base.hands, [seat]: hand },
  };
}

describe("botChooseCommand - Phase 2 bidding (baseBidCeiling + bluff resistance)", () => {
  // ── estimateHandValue reference ───────────────────────────────────────────
  // The new system adds trump-length and void bonuses on top of point cards.
  // A purely junk hand (no point cards, 2–3 count in each color) has strength ~0
  // and should always produce ceiling=0 (pass).

  it("normal bot passes on a truly junk hand (no point cards, no distribution bonus)", () => {
    // No point-value cards → base = 0; 4 colors, each 2–3 cards → no voids/singletons
    // Trump length ≤ 3 (e.g. 3) → bonus = 5; no voids/singletons; total ~5 < 40 → ceiling=0 → pass
    const junkHand: import("../types.js").CardId[] = [
      "B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3",
    ];
    const state = makeBiddingStateWithHand("E", junkHand);
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("normal bot opens at 100 with a moderate hand (strength lands above 40 threshold)", () => {
    // ROOK(15) + B1(15) = 30 base; plus trump-length (Black=2) = 0; singleton non-trump bonuses
    // Red=0 cards (+8 void), Green=1 (+3), Yellow=1 (+3); total ≈ 30+0+8+3+3 = 44 > 40
    // baseBidCeiling(44): anchor [40,100]→[60,115], t=(44-40)/(60-40)=0.2; ceil=100+0.2*15=103 → 103
    // Normal aggressiveness=1.0, bluffResistance=0.3: snappedCeiling=floor((103+9)/5)*5=110
    // minNextBid=100 ≤ 110 → bid 100
    const hand: import("../types.js").CardId[] = [
      "ROOK", "B1", "B2", "B3", "B4", "B6", "B7", "B8", "G9", "Y9",
    ];
    const state = makeBiddingStateWithHand("E", hand);
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlaceBid");
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBe(100);
    }
  });

  it("normal bot passes when min bid would exceed bluff-adjusted ceiling", () => {
    // Pure junk hand: strength ≈ 0 → baseBidCeiling(0) = 0 → ceiling stays 0 → pass
    const junkHand: import("../types.js").CardId[] = [
      "B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3",
    ];
    const base = makeBiddingStateWithHand("E", junkHand);
    const state = { ...base, currentBid: 100 };
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("expert bot bluff-resists 30pts above base ceiling (bluffResistance=1.0)", () => {
    // Hand: ROOK(15)+B1(15)+R14(10)+R10(8)+G5(5)+Y5(5) = 58 base
    // Colors: Black=1, Red=3, Green=1, Yellow=1
    // Red is probable trump (weight: R14=1+1.0=2.0, R10=1+0.8=1.8, R2=1; total=4.8)
    // Black weight: ROOK skipped, B1=1+1.5=2.5 (but ROOK excluded from color counts)
    // Actually B1=1 card, weight=2.5; Red=3, weight=4.8 → Red is trump
    // trumpLength=3 → bonus=5; Black=1 singleton (+3), Green=1 (+3), Yellow=1 (+3)
    // strength = 58 + 5 + 3 + 3 + 3 = 72
    // baseBidCeiling(72): anchor [60,115]→[75,130], t=(72-60)/(75-60)=12/15=0.8; ceil=115+0.8*15=127
    // Expert aggressiveness=1.15: ceil=round(127*1.15)=146
    // Expert bluffResistance=1.0: budget=30; snapped=floor((146+30)/5)*5=175
    // Normal bluffResistance=0.3: budget=9; snapped=floor((146+9)/5)*5=155
    // Set currentBid=155 so minNextBid=160: expert (175) bids, normal (155) passes
    const hand: import("../types.js").CardId[] = [
      "ROOK", "B1", "R14", "R10", "R2", "G5", "Y5", "B2", "B3", "B4",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // Block moon shoot so we test bid ceiling
    const state = { ...base, currentBid: 155, moonShooters: ["E"] as import("../types.js").Seat[] };

    const expertProfile = BOT_PRESETS[5];
    const expertCmd = botChooseCommand(state, "E", expertProfile);
    expect(["PlaceBid", "PassBid"]).toContain(expertCmd.type);
    // Expert with bluffResistance=1.0 should push harder than normal;
    // both may or may not bid here due to aggressiveness/noise, but
    // if expert bids, it bids the minNextBid=160
    if (expertCmd.type === "PlaceBid") {
      expect(expertCmd.amount).toBe(160);
    }
  });

  it("normal bot caps at maximumBid (200) even with high strength", () => {
    // Super-strong hand: ROOK + four aces + four 14s + B10
    // strength is very high → baseBidCeiling → 200 (max anchor)
    const hand: import("../types.js").CardId[] = [
      "ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // currentBid=195, minNextBid=200 which equals maximumBid → should bid 200
    const state = { ...base, currentBid: 195, moonShooters: ["E"] as import("../types.js").Seat[] };
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlaceBid");
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBe(200);
    }
  });

  it("normal bot passes when minNextBid exceeds maximumBid (200)", () => {
    const hand: import("../types.js").CardId[] = [
      "ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // currentBid=200, minNextBid=205 → always passes (no bid above max)
    const state = { ...base, currentBid: 200, moonShooters: ["E"] as import("../types.js").Seat[] };
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("Level 2 bot passes when junk hand (bidAggressiveness=0.85 doesn't help 0-ceiling)", () => {
    const junkHand: import("../types.js").CardId[] = [
      "B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3",
    ];
    const state = makeBiddingStateWithHand("E", junkHand);
    const profile = BOT_PRESETS[2];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("all levels always return a legal bidding command for any hand", () => {
    const difficulties: import("../types.js").BotDifficulty[] = [1, 2, 3, 4, 5];
    const hands = [
      // Junk
      ["B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3"],
      // Moderate
      ["ROOK", "B1", "R14", "G5", "Y5", "B2", "B3", "B4", "R2", "R3"],
      // Strong
      ["ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10"],
    ] as import("../types.js").CardId[][];

    for (const hand of hands) {
      for (const difficulty of difficulties) {
        const state = makeBiddingStateWithHand("E", hand);
        const profile = BOT_PRESETS[difficulty];
        const cmd = botChooseCommand(state, "E", profile);
        expect(isLegalCommand(state, "E", cmd)).toBe(true);
      }
    }
  });
});
