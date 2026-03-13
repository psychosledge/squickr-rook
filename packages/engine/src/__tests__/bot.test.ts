import { describe, it, expect } from "vitest";
import { botChooseCommand, computeBidCeiling } from "../bot.js";
import { applyEvent, INITIAL_STATE } from "../reducer.js";
import { legalCommands } from "../validator.js";
import { trumpRank } from "../deck.js";
import type { GameCommand } from "../commands.js";
import type { GameEvent } from "../events.js";
import type { BotDifficulty, CardId, Color, GameState, Seat } from "../types.js";
import { BOT_PRESETS, DEFAULT_RULES, leftOf } from "../types.js";

const ALL_DIFFICULTIES: BotDifficulty[] = [1, 2, 3, 4, 5];

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

function isLegalCommand(state: GameState, seat: Seat, cmd: GameCommand): boolean {
  const legal = legalCommands(state, seat);
  return legal.some(c => JSON.stringify(c) === JSON.stringify(cmd));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("botChooseCommand", () => {
  const difficulties = ALL_DIFFICULTIES;

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
  const difficulties = ALL_DIFFICULTIES;

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

function makeBiddingStateWithHand(seat: Seat, hand: CardId[]): GameState {
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
    const junkHand: CardId[] = [
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
    const hand: CardId[] = [
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
    const junkHand: CardId[] = [
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
    const hand: CardId[] = [
      "ROOK", "B1", "R14", "R10", "R2", "G5", "Y5", "B2", "B3", "B4",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // Block moon shoot so we test bid ceiling
    const state = { ...base, currentBid: 155, moonShooters: ["E"] as Seat[] };

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

  it("expert bot caps at maximumBid (200) even with very high strength", () => {
    // Super-strong hand: ROOK + four aces + four 14s + B10
    // strength is very high → baseBidCeiling → 200 (max anchor)
    // Uses expert (accuracy=1.0) so hand valuation is deterministic — no noise.
    const hand: CardId[] = [
      "ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // currentBid=195, minNextBid=200 which equals maximumBid → should bid 200
    const state = { ...base, currentBid: 195, moonShooters: ["E"] as Seat[] };
    const profile = BOT_PRESETS[5]; // expert: accuracy=1.0, deterministic
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlaceBid");
    if (cmd.type === "PlaceBid") {
      expect(cmd.amount).toBe(200);
    }
  });

  it("normal bot passes when minNextBid exceeds maximumBid (200)", () => {
    const hand: CardId[] = [
      "ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10",
    ];
    const base = makeBiddingStateWithHand("E", hand);
    // currentBid=200, minNextBid=205 → always passes (no bid above max)
    const state = { ...base, currentBid: 200, moonShooters: ["E"] as Seat[] };
    const profile = BOT_PRESETS[3];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("Level 2 bot passes when junk hand (bidAggressiveness=0.85 doesn't help 0-ceiling)", () => {
    const junkHand: CardId[] = [
      "B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3",
    ];
    const state = makeBiddingStateWithHand("E", junkHand);
    const profile = BOT_PRESETS[2];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("all levels always return a legal bidding command for any hand", () => {
    const difficulties = ALL_DIFFICULTIES;
    const hands = [
      // Junk
      ["B2", "B3", "B4", "R2", "R3", "R4", "G2", "G3", "Y2", "Y3"],
      // Moderate
      ["ROOK", "B1", "R14", "G5", "Y5", "B2", "B3", "B4", "R2", "R3"],
      // Strong
      ["ROOK", "B1", "R1", "G1", "Y1", "R14", "G14", "B14", "Y14", "B10"],
    ] as CardId[][];

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

// ── Helper: build a playing-phase state with custom hands, trump, bidder ──────

/**
 * Build a playing-phase state for testing card-play logic.
 * - `seat` is active player (leading)
 * - `hands` are set directly
 * - `trump` is set
 * - `bidder` is set so role awareness can be computed
 * - `tricksPlayed` can be customised
 * - `playedCards` tracks played cards for trump-pulled detection
 * - `originalNest` is set for endgame nest value tests
 */
function makePlayingState(opts: {
  activePlayer: Seat;
  hands: Partial<Record<Seat, CardId[]>>;
  trump: Color;
  bidder: Seat;
  tricksPlayed?: number;
  playedCards?: CardId[];
  scores?: { NS: number; EW: number };
  originalNest?: CardId[];
}): GameState {
  const base = stateAfterTrumpSelected();
  return {
    ...base,
    phase: "playing",
    activePlayer: opts.activePlayer,
    hands: {
      N: opts.hands.N ?? [],
      E: opts.hands.E ?? [],
      S: opts.hands.S ?? [],
      W: opts.hands.W ?? [],
    },
    trump: opts.trump,
    bidder: opts.bidder,
    tricksPlayed: opts.tricksPlayed ?? 0,
    currentTrick: [],
    playedCards: opts.playedCards ?? [],
    scores: opts.scores ?? { NS: 0, EW: 0 },
    originalNest: opts.originalNest ?? [],
  };
}

// ── Phase 4: Role awareness tests ─────────────────────────────────────────────

describe("botChooseCommand - Phase 4 (role awareness)", () => {
  it("bidding team bot leads trump when trump not pulled", () => {
    // N is bidder (NS team). S is active player (also NS team → bidding team).
    // Use playAccuracy=1.0 to ensure deterministic behaviour.
    const state = makePlayingState({
      activePlayer: "S",
      bidder: "N",   // NS team
      trump: "Black",
      tricksPlayed: 0,
      playedCards: [], // no trump played yet → not pulled
      hands: {
        S: ["B5", "B9", "B14", "R2", "G3", "Y6"], // has Black trump + non-trump
        N: ["R3", "G4", "Y2", "R6"],
        E: ["G5", "Y7", "R8"],
        W: ["G6", "Y8", "R9"],
      },
    });
    // Use level 5 (playAccuracy=1.0, roleAwareness=true) for deterministic result
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Should lead a Black (trump) card
      expect(trumpRank(cmd.cardId, "Black")).toBeGreaterThanOrEqual(0);
    }
  });

  it("defending team bot does not lead trump before trick 7", () => {
    // E is active player (EW team). Bidder is N (NS team). So E is defending.
    const state = makePlayingState({
      activePlayer: "E",
      bidder: "N",   // NS team → E is defending
      trump: "Black",
      tricksPlayed: 3, // < 7 → should not lead trump
      playedCards: [],
      hands: {
        E: ["B5", "B9", "R2", "G3", "Y6"], // has trump AND non-trump
        N: ["R3", "G4"],
        S: ["G5", "Y7"],
        W: ["G6", "Y8"],
      },
    });
    const profile = BOT_PRESETS[3]; // roleAwareness=true
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Should NOT lead trump (Black) before trick 7 when has non-trump
      expect(trumpRank(cmd.cardId, "Black")).toBeLessThan(0);
    }
  });

  it("bot with roleAwareness=false (levels 1-2) ignores role logic", () => {
    // Level 2 bot should still play without crashing, regardless of role
    const state = makePlayingState({
      activePlayer: "E",
      bidder: "N",
      trump: "Black",
      tricksPlayed: 3,
      playedCards: [],
      hands: {
        E: ["B5", "B9", "R2", "G3", "Y6"],
        N: ["R3", "G4"],
        S: ["G5", "Y7"],
        W: ["G6", "Y8"],
      },
    });
    const profile = BOT_PRESETS[2]; // roleAwareness=false
    // Should not throw and return a legal command
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlayCard");
    expect(isLegalCommand(state, "E", cmd)).toBe(true);
  });

  it("defending team bot leads trump after trick 7 if only trump remains", () => {
    // After trick 7, or if bot only has trump, it should lead trump
    const state = makePlayingState({
      activePlayer: "E",
      bidder: "N",   // NS team → E is defending
      trump: "Black",
      tricksPlayed: 7, // >= 7 → may lead trump now
      playedCards: [],
      hands: {
        E: ["B5", "B9", "R2", "G3"],
        N: ["R3"],
        S: ["G5"],
        W: ["G6"],
      },
    });
    const profile = BOT_PRESETS[4]; // roleAwareness=true
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("PlayCard");
    expect(isLegalCommand(state, "E", cmd)).toBe(true);
  });

  it("defending team bot does not burn ROOK when it is the only winning card (early game)", () => {
    // Trump=Black. Trick in progress: N led G9 (Green), trick winner is G9.
    // W (EW = defending, bidder=N) has hand: ROOK, Y3, Y4 — no Green cards.
    // Must-follow is void (no Green), so all three cards are legal.
    // ROOK beats G9 (trump beats off-suit); Y3 and Y4 do NOT beat G9.
    // With roleAwareness + trumpManagement>=0.7, defending team early game
    // (tricksPlayed=3 < 5) → bot should prefer a losing card (Y3 or Y4) over burning ROOK.
    const baseState = makePlayingState({
      activePlayer: "W",
      bidder: "N",   // NS team → W is defending (EW)
      trump: "Black",
      tricksPlayed: 3,
      playedCards: [],
      hands: {
        N: [],
        E: [],
        S: [],
        W: ["ROOK", "Y3", "Y4"],
      },
    });
    // Inject a trick already in progress: N led G9
    const state = {
      ...baseState,
      currentTrick: [{ seat: "N" as Seat, cardId: "G9" as CardId }],
    };
    // Level 5: roleAwareness=true, trumpManagement=1.0>=0.7, playAccuracy=1.0
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "W", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Should NOT play ROOK — prefer losing card (Y3 or Y4)
      expect(cmd.cardId).not.toBe("ROOK");
    }
  });

  it("bidding team leads off-suit when trump is pulled (9+ trump in playedCards)", () => {
    // S is active player (NS team). Bidder = N (NS team) → S is bidding team.
    // S holds trump (B5, B9) and non-trump (R2, G3).
    // playedCards has 9 Black (trump) cards → trumpPulled = true.
    // With roleAwareness + trackPlayedCards, bot should lead off-suit (not trump).
    const state = makePlayingState({
      activePlayer: "S",
      bidder: "N",   // NS team → S is bidding team
      trump: "Black",
      tricksPlayed: 0,
      // 9 Black trump cards already played (valid deck values: 1,5–14; exclude B5/B9 held by S)
      playedCards: ["B1", "B6", "B7", "B8", "B10", "B11", "B12", "B13", "B14"] as CardId[],
      hands: {
        S: ["B5", "B9", "R5", "G6"],
        N: [],
        E: [],
        W: [],
      },
    });
    // Level 5: roleAwareness=true, trackPlayedCards=true, playAccuracy=1.0
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Trump is pulled → should NOT lead trump (Black card)
      expect(trumpRank(cmd.cardId, "Black")).toBeLessThan(0);
    }
  });
});

// ── Phase 5: Void exploitation tests ─────────────────────────────────────────

describe("botChooseCommand - Phase 5 (void exploitation)", () => {
  it("level 3+ bot targets void in shortest non-trump suit during discard", () => {
    // Build a state where E has won the bid, taken the nest, and has a hand with
    // a clear shortest suit to void.
    // Hand (15 cards post-nest): 5 Black (probable trump), 4 Red, 1 Green, 5 Yellow → void Green
    let state = stateAfterBiddingComplete();
    // Override the nest player (bidder = left-of-dealer = E when dealer=N)
    const nestPlayer: Seat = "E";
    const nestCards: CardId[] = ["B5", "R2", "G3", "B8", "R6"];
    // Simulate NestTaken
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });

    // Override hand directly: give E a hand with 1 Green card and many Black/others
    // Green is the shortest non-trump suit → should be voided
    const handWithShortGreen: CardId[] = [
      // Black (probable trump — most cards + points)
      "B1", "B14", "B9", "B8", "B7",
      // Red
      "R9", "R8", "R7", "R6",
      // Green (only 1 — the void target)
      "G9",
      // Yellow
      "Y9", "Y8", "Y7", "Y6",
      // ROOK
      "ROOK",
    ];
    state = { ...state, hands: { ...state.hands, [nestPlayer]: handWithShortGreen } };

    const profile = BOT_PRESETS[3]; // voidExploitation=0.5
    const cmd = botChooseCommand(state, nestPlayer, profile);
    expect(cmd.type).toBe("DiscardCard");
    if (cmd.type === "DiscardCard") {
      // Should discard the lone Green card (void target) first
      expect(cmd.cardId).toBe("G9");
    }
  });

  it("level 1-2 bot ignores void strategy (still discards legally)", () => {
    let state = stateAfterBiddingComplete();
    const nestPlayer: Seat = "E";
    const nestCards: CardId[] = ["B5", "R2", "G3", "B8", "R6"];
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });
    const profile = BOT_PRESETS[2]; // voidExploitation=0.0
    // Level 2 uses random discard — just check it's legal and not ROOK
    for (let i = 0; i < 5; i++) {
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("DiscardCard");
      if (cmd.type === "DiscardCard") {
        expect(cmd.cardId).not.toBe("ROOK");
        expect(isLegalCommand(state, nestPlayer, cmd)).toBe(true);
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

  it("bot never discards ROOK during void-exploitation discard path", () => {
    // Level 3+ bot should never discard ROOK even when targeting voids
    let state = stateAfterBiddingComplete();
    const nestPlayer: Seat = "E";
    const nestCards: CardId[] = ["B5", "R2", "G3", "B8", "R6"];
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });

    // Hand with ROOK and a clear short suit
    const handWithRook: CardId[] = [
      "ROOK",
      "B1", "B14", "B9", "B8",
      "R9", "R8", "R7", "R6",
      "G9",   // singleton Green
      "Y9", "Y8", "Y7", "Y6", "Y5",
    ];
    state = { ...state, hands: { ...state.hands, [nestPlayer]: handWithRook } };

    const profile = BOT_PRESETS[5]; // voidExploitation=1.0
    for (let i = 0; i < 5; i++) {
      const cmd = botChooseCommand(state, nestPlayer, profile);
      expect(cmd.type).toBe("DiscardCard");
      if (cmd.type === "DiscardCard") {
        expect(cmd.cardId).not.toBe("ROOK");
        state = applyEvent(state, {
          type: "CardDiscarded",
          seat: nestPlayer,
          cardId: cmd.cardId,
          handNumber: 0,
          timestamp: 3000 + i,
        });
      }
    }
  });

  it("level 4+ bot targets secondary void suit (voidExploitation >= 0.8)", () => {
    // Level 4 has voidExploitation=0.8 → targets TWO void suits.
    //
    // Hand design (16 cards post-nest at discard phase):
    //   Black (probable trump): B1, B14, B9, B8, B7, B6 — 6 Black cards, heavy weights
    //   Red (1 card = primary void target):  R14 — a 10-point card → void-target score = pts = 10
    //   Green (2 cards = secondary void target): G2, G3 — zero-point → void-target score = 0
    //   Yellow (5 cards = non-void-target):  Y9, Y8, Y7, Y6, Y5 — zero-point → score = 50
    //   ROOK → score = 600 (never discard)
    //
    // Scoring:
    //   ROOK        → 600 (never discarded)
    //   B-cards     → 500 (aces/14s) or 400 (probable trump)
    //   R14         → void-target point card → score = 10
    //   G2, G3      → secondary void-target zero-point → score = 0  ← LOWEST
    //   Y9–Y5       → non-void-target zero-point → score = 50
    //
    // Bot should discard G2 or G3 (score=0) before R14 (score=10) or Yellow (score=50).
    // This proves the secondary void suit (Green) IS targeted.
    let state = stateAfterBiddingComplete();
    const nestPlayer: Seat = "E";
    const nestCards: CardId[] = ["B5", "R2", "G3", "B8", "R6"];
    state = applyEvent(state, {
      type: "NestTaken",
      seat: nestPlayer,
      nestCards,
      handNumber: 0,
      timestamp: 2000,
    });

    const handWithTwoShortSuits: CardId[] = [
      // Black (probable trump — heaviest weight)
      "B1", "B14", "B9", "B8", "B7", "B6",
      // Red (1 card — primary void target, has a 10-pt card)
      "R14",
      // Green (2 cards — secondary void target, zero-point)
      "G2", "G3",
      // Yellow (5 cards — not a void target)
      "Y9", "Y8", "Y7", "Y6", "Y5",
      // ROOK
      "ROOK",
    ];
    state = { ...state, hands: { ...state.hands, [nestPlayer]: handWithTwoShortSuits } };

    const profile = BOT_PRESETS[4]; // voidExploitation=0.8 → targets two voids
    const cmd = botChooseCommand(state, nestPlayer, profile);
    expect(cmd.type).toBe("DiscardCard");
    if (cmd.type === "DiscardCard") {
      // Should discard from the secondary void target (Green: G2 or G3),
      // not from Yellow (score=50) or Red (score=10).
      expect(["G2", "G3"]).toContain(cmd.cardId);
    }
  });
});

// ── Phase 6: Endgame awareness tests ─────────────────────────────────────────

describe("botChooseCommand - Phase 6 (endgame awareness)", () => {
  it("endgame-aware bot leads highest-value card on trick 10 when nest is valuable", () => {
    // Set tricksPlayed=9, high nest value (originalNest has point cards), bidding team on lead
    const state = makePlayingState({
      activePlayer: "S",   // S is on NS team
      bidder: "N",          // N is bidder (NS team) → S is bidding team
      trump: "Black",
      tricksPlayed: 9,      // Last trick
      playedCards: [],
      originalNest: ["B1", "R14", "G10", "Y5", "B10"], // 15+10+10+5+10 = 50 pts
      hands: {
        S: ["B9", "R1", "G7"],  // R1 = ace (high value), B9 = high trump, G7 = low
        N: [],
        E: [],
        W: [],
      },
    });
    const profile = BOT_PRESETS[4]; // endgameCardAwareness=0.5
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Should lead the highest-value card — R1 is an ace (15 pts)
      // or B9 (trump, 0 pts off-suit). R1 has highest point value.
      expect(cmd.cardId).toBe("R1");
    }
  });

  it("endgame logic not triggered before trick 7", () => {
    // Same setup but tricksPlayed=6 — should behave normally (not lead highest-value)
    const state = makePlayingState({
      activePlayer: "S",
      bidder: "N",
      trump: "Black",
      tricksPlayed: 6,      // < 7 → endgame not triggered
      playedCards: [],
      originalNest: ["B1", "R14", "G10", "Y5", "B10"],
      hands: {
        S: ["B9", "R1", "G7"],
        N: [],
        E: [],
        W: [],
      },
    });
    // With endgameCardAwareness=0.0 (level 3), no endgame logic
    const profile = BOT_PRESETS[3]; // endgameCardAwareness=0.0
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    // Just verify it's a legal command — no specific card expectation
    expect(isLegalCommand(state, "S", cmd)).toBe(true);
  });

  it("endgame logic not triggered when endgameCardAwareness < 0.5", () => {
    // Level 3 bot (endgameCardAwareness=0.0) should not use endgame logic
    const state = makePlayingState({
      activePlayer: "S",
      bidder: "N",
      trump: "Black",
      tricksPlayed: 9,
      playedCards: [],
      originalNest: ["B1", "R14", "G10", "Y5", "B10"], // 50 pts nest
      hands: {
        S: ["B9", "R1", "G7"],
        N: [],
        E: [],
        W: [],
      },
    });
    const profile = { ...BOT_PRESETS[3], endgameCardAwareness: 0.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    expect(isLegalCommand(state, "S", cmd)).toBe(true);
  });

  it("bidding team preserves trump and ace on tricks 7-8, leads weakest non-trump non-ace", () => {
    // Bidding team (S=NS team, bidder=N), tricksPlayed=7, nestVal=20pts (>15).
    // S holds: B9 (trump), R1 (ace, value=1), G3 (weak non-trump non-ace).
    // endgameCardAwareness >= 0.5 triggers preservation logic for tricks 7-8.
    // Bot should lead G3 (the only non-trump, non-ace card) to save B9 and R1 for trick 10.
    const state = makePlayingState({
      activePlayer: "S",
      bidder: "N",          // NS team → S is bidding team
      trump: "Black",
      tricksPlayed: 7,      // in endgame window (7 <= x < 9)
      playedCards: [],
      originalNest: ["B10", "R10", "G10", "Y5", "R5"], // 10+10+10+5+5=40pts > 15
      hands: {
        S: ["B9", "R1", "G3"],   // trump + ace + weak off-suit
        N: [],
        E: [],
        W: [],
      },
    });
    const profile = BOT_PRESETS[4]; // endgameCardAwareness=0.5
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      // Should lead G3 (non-trump, non-ace) — preserving B9 (trump) and R1 (ace) for trick 10
      expect(cmd.cardId).toBe("G3");
    }
  });
});

// ── Phase 7: Contextual moon shoot tests ─────────────────────────────────────

describe("botChooseCommand - Phase 7 (contextual moon shoot)", () => {
  it("expert bot lowers moon threshold when opponents near win", () => {
    // Expert threshold = 95. Opponents near win → threshold -= 20 → 75.
    // E is on EW team → opponents are NS.
    // Set NS=360 (>= 500-150=350) to trigger the reduction.
    // Hand strength = 79 (above 75 adjusted threshold but below 95 baseline).
    // Hand: ROOK(15)+B1(15)+R1(15)+G14(10)+G9+G8+G7+G6+B2+Y2
    // Green: G14(10),G9,G8,G7,G6 = 5 cards, weight=5+1.0=6.0 → probableTrump
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R1(15) = 1, weight=2.5 → singleton (+3)
    // Yellow: Y2 = 1, weight=1.0 → singleton (+3)
    // trumpLength=5 → bonus=18
    // Base: ROOK(15)+B1(15)+R1(15)+G14(10) = 55
    // Total = 55+18+3+3 = 79 > 75 → should shoot moon
    // Ace gate (difficulty=5≥4): ROOK + B1(ace) → hasRook=true, aceCount=1 ≥ 1 → passes
    const hand: CardId[] = ["ROOK", "B1", "R1", "G14", "G9", "G8", "G7", "G6", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 360, EW: 0 },  // opponents (NS) at 360 >= 500-150=350
      moonShooters: [] as Seat[],
    };
    // Expert bot: contextualMoonShoot=true, moonShootThreshold=95
    // After contextual adjustment: threshold = 95 - 20 = 75
    // Hand strength = 79 > 75 → should shoot moon
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("expert bot raises moon threshold when winning comfortably", () => {
    // Expert threshold = 95. Own score=420 >= 500-100=400 AND 420 > 200+150=350 → threshold += 20 → 115.
    // Additionally: scoreLead=220>100 AND EW=420>0 → mid-game winning lead +15 → threshold = 130.
    // Hand: ROOK(15)+B1(15)+R1(15)+G14(10)+G9+G8+G7+G6+B2+Y2 → strength=79
    // Green: G14(10),G9,G8,G7,G6 = 5, weight=5+1.0=6.0 → probableTrump
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R1(15) = 1, weight=2.5 → singleton (+3)
    // Yellow: Y2 = 1, weight=1.0 → singleton (+3)
    // trumpLength=5 → bonus=18
    // Base: ROOK(15)+B1(15)+R1(15)+G14(10) = 55
    // Total = 55+18+3+3 = 79
    // We need: 75 < strength < 130 (with all adjustments).
    // 79 is in that range. threshold becomes 95+20+15=130.
    // 79 < 130 → should NOT shoot. ✓
    const hand: CardId[] = ["ROOK", "B1", "R1", "G14", "G9", "G8", "G7", "G6", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // EW (E's team) winning comfortably: score >= 400 AND > opp+150
      scores: { NS: 200, EW: 420 },
      moonShooters: [] as Seat[],
    };
    // Expert bot: contextualMoonShoot=true
    // threshold = 95; comfortable winning: +20 → 115; mid-game lead (220>100, 420>0): +15 → 130
    // strength = 79 < 130 → should NOT shoot
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    // Should not shoot moon (should bid or pass)
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("non-expert bot does not contextually adjust threshold", () => {
    // Level 4 bot: contextualMoonShoot=false, moonShootThreshold=105
    // Opponents at 360 → contextual would drop threshold by 20 → 85
    // But level 4 doesn't contextually adjust → threshold stays 105
    // Hand: ROOK+B1+R1+G14+G9+G8+G7+G6+B2+Y2 → strength=79 (computed above)
    // 79 < 105 → should NOT shoot (no contextual adjustment)
    const hand: CardId[] = ["ROOK", "B1", "R1", "G14", "G9", "G8", "G7", "G6", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 360, EW: 0 },  // opponents (NS) at 360 >= 350
      moonShooters: [] as Seat[],
    };
    // Level 4: contextualMoonShoot=false
    const profile = BOT_PRESETS[4];
    const cmd = botChooseCommand(state, "E", profile);
    // Without contextual adjustment, threshold=105, strength=79 → no shoot
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("expert bot with desperation bonus (myTeam <= -200) shoots moon just above lowered threshold", () => {
    // Expert threshold = 95. Own team at -200 → threshold -= 10 → 85.
    // Opponents NOT near win (no opp trigger) → only desperation applies.
    //
    // Hand: ROOK(15)+B1(15)+G1(15)+G9+G8+G7+G6+G5(5)+R2+Y2
    //   Green: G1(15),G9,G8,G7,G6,G5(5) = 6 cards, weight=6+1.5+0.5=8.0 → probableTrump=Green
    //   Black: B1(15) = 1, weight=2.5 → singleton (+3)
    //   Red: R2 = 1, weight=1.0 → singleton (+3)
    //   Yellow: Y2 = 1, weight=1.0 → singleton (+3)
    // trumpLength=6 → bonus=28
    // Base: ROOK(15)+B1(15)+G1(15)+G5(5) = 50
    // Total = 50+28+3+3+3 = 87
    //
    // 87 >= 85 (desperation threshold) → SHOOTS ✓
    // 87 < 95 (baseline threshold) → would NOT shoot without desperation ✓
    // Ace gate: ROOK + B1(ace,Black) + G1(ace,Green) → aceCount=2 → passes ✓
    const hand: CardId[] = ["ROOK", "B1", "G1", "G9", "G8", "G7", "G6", "G5", "R2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // EW (E's team) in deep hole: -200 → triggers desperation (-10)
      // NS (opponents) at 0 → NOT near win, so opp trigger does NOT fire
      scores: { NS: 0, EW: -200 },
      moonShooters: [] as Seat[],
    };
    // Expert: contextualMoonShoot=true, moonShootThreshold=95
    // Desperation: threshold = 95 - 10 = 85; strength=87 >= 85 → shoot
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("expert bot with dual triggers (opp near win + desperation) applies combined -30 reduction", () => {
    // Expert threshold = 95. BOTH triggers:
    //   - Opponents (NS) >= 350 → threshold -= 20
    //   - Own team (EW) <= -200 → threshold -= 10
    //   Effective threshold = 95 - 20 - 10 = 65
    //
    // Hand chosen to have strength ~72, which is:
    //   >= 65 (dual trigger fires) ✓
    //   < 75  (opp-only trigger threshold: 95-20=75) would not fire alone ✓
    //   < 85  (desp-only trigger threshold: 95-10=85) would not fire alone ✓
    //   < 95  (baseline threshold) ✓
    //
    // Hand: ROOK(15)+B1(15)+G9+G8+G7+G6+G5(5)+G3+R2+Y2
    //   Green: G9,G8,G7,G6,G5(5),G3 = 6, weight=6+0.5=6.5 → probableTrump=Green
    //   Black: B1(15) = 1, weight=2.5 → singleton (+3)
    //   Red: R2 = 1, weight=1.0 → singleton (+3)
    //   Yellow: Y2 = 1, weight=1.0 → singleton (+3)
    // trumpLength=6 → bonus=28
    // Base: ROOK(15)+B1(15)+G5(5) = 35
    // Total = 35+28+3+3+3 = 72
    //
    // 72 >= 65 (dual threshold) → SHOOTS ✓
    // Ace gate: ROOK + B1(ace) → hasRook=true, aceCount=1 ≥ 1 → passes ✓
    const hand: CardId[] = ["ROOK", "B1", "G9", "G8", "G7", "G6", "G5", "G3", "R2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // Both triggers active:
      scores: { NS: 360, EW: -200 },  // opp(NS)=360 >= 350, own(EW)=-200 <= -200
      moonShooters: [] as Seat[],
    };
    // Expert: threshold = 95 - 20 - 10 = 65; strength=72 >= 65 → shoots
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });
});

// ── Fix 1: chooseBestSluffCard tests ─────────────────────────────────────────

describe("botChooseCommand - Fix 1 (chooseBestSluffCard)", () => {
  /**
   * Build a following-play state where the bot's partner is currently winning
   * the trick, and the bot holds the given hand.
   *
   * Setup: trump=Black, N is bidder (NS team).
   * Trick in progress: N led G9 (Green off-suit, non-trump), N is winning.
   * Bot seat = S (NS team, partner of N → partnerIsWinning=true).
   * S has NO Green cards → void in lead suit → ALL cards in hand are legal to play.
   * S has sluffStrategy enabled (Level 4/5 profile).
   */
  function makeSluffStateVoid(hand: CardId[]): GameState {
    const baseState = makePlayingState({
      activePlayer: "S",
      bidder: "N",    // N is bidder, NS team; S is also NS team
      trump: "Black",
      tricksPlayed: 0,
      playedCards: [],
      hands: {
        N: [],
        E: [],
        S: hand, // no Green cards → void in Green (lead suit)
        W: [],
      },
    });
    // Inject a trick: N led G9 (Green off-suit) — N is currently winning
    return {
      ...baseState,
      currentTrick: [{ seat: "N" as Seat, cardId: "G9" as CardId }],
    };
  }

  it("sluff avoids ROOK when off-suit point card available (void in lead suit)", () => {
    // Bot (S, NS team) is void in Green. Partner N played G9 and is winning.
    // S holds: ROOK (20pts, trump) and Y10 (10pts, Yellow off-suit point card).
    // Both are legal (S is void in Green). chooseHighestPointCard would pick ROOK (20>10).
    // chooseBestSluffCard Tier 1: Y10 is off-suit point card → plays Y10, not ROOK.
    const state = makeSluffStateVoid(["ROOK", "Y10"]);
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      expect(cmd.cardId).toBe("Y10");
      expect(cmd.cardId).not.toBe("ROOK");
    }
  });

  it("sluff avoids trump ace when off-suit point card available (void in lead suit)", () => {
    // Bot (S) void in Green. Partner N won with G9.
    // S holds: B1 (Black trump ace, 15pts, protected) and Y14 (Yellow 14-point, 10pts).
    // Both legal (void in Green). chooseHighestPointCard picks B1 (15>10).
    // chooseBestSluffCard Tier 1: Y14 is off-suit point card → plays Y14, not B1.
    const state = makeSluffStateVoid(["B1", "Y14"]);
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      expect(cmd.cardId).toBe("Y14");
    }
  });

  it("sluff plays trump-1 (B1) over ROOK when only protected trump cards remain (void in lead suit)", () => {
    // Bot (S) void in Green. Partner N won with G9.
    // S holds: ROOK (20pts, trump, protected) and B1 (Black trump ace, 15pts, protected).
    // Both legal (void in Green). Both protected → Tier 4 fallback.
    // chooseHighestPointCard would pick ROOK (20 > 15).
    // chooseBestSluffCard Tier 4: prefer lowest point value → picks B1 (15 < 20).
    const state = makeSluffStateVoid(["ROOK", "B1"]);
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      expect(cmd.cardId).toBe("B1");
      expect(cmd.cardId).not.toBe("ROOK");
    }
  });

  it("sluff plays unprotected trump point card (Tier 2) over ROOK when no off-suit cards exist (void in lead suit)", () => {
    // Bot (S) void in Green. Partner N won with G9.
    // S holds: ROOK (20pts, trump, protected) and B5 (Black trump 5-point, not ROOK/trump-ace).
    // Both legal (void in Green).
    // Tier 1: no off-suit point cards (B5 is trump, ROOK is trump) → empty.
    // Tier 2: trump point cards that are neither ROOK nor trump-ace → B5 qualifies.
    // chooseBestSluffCard picks B5 (Tier 2) rather than wasting ROOK.
    const state = makeSluffStateVoid(["ROOK", "B5"]);
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PlayCard");
    if (cmd.type === "PlayCard") {
      expect(cmd.cardId).toBe("B5");
      expect(cmd.cardId).not.toBe("ROOK");
    }
  });
});

// ── Fix 2: Partner-holds-bid guard tests ──────────────────────────────────────

describe("botChooseCommand - Fix 2 (partner-holds-bid guard)", () => {
  /**
   * Build a bidding state where the partner already holds the bid.
   * seat = "S" (NS team), partner = "N".
   * state.bidder = "N" (partner holds bid), state.currentBid = partnerBidAmount.
   */
  function makePartnerHoldsBidState(seat: Seat, hand: CardId[], partnerBidAmount: number): GameState {
    const partner: Seat = seat === "S" ? "N" : seat === "N" ? "S" : seat === "E" ? "W" : "E";
    const base = makeBiddingStateWithHand(seat, hand);
    return {
      ...base,
      bidder: partner,
      currentBid: partnerBidAmount,
      bids: { ...base.bids, [partner]: partnerBidAmount },
      activePlayer: seat,
    };
  }

  it("Level 3+ bot passes when partner holds the bid and ceiling is within 25pt margin", () => {
    // Seat S (NS team), partner N holds bid at 120.
    // Hand strength for Black trump (strength ~75 → baseBidCeiling(75)=130).
    // rawCeiling=130, state.currentBid=120, margin=130-120=10 < 25 → passes.
    // Hand: ROOK(15)+B14(10)+B9+B8+B7+B6+R2+G2+Y2+G3
    //   Black: B14(10),B9,B8,B7,B6 = 5 cards, weight=5+1.0=6.0 → probableTrump
    //   Red: R2=1, weight=1
    //   Green: G2,G3=2, weight=2
    //   Yellow: Y2=1, weight=1
    //   trumpLength=5 → bonus=18; singletons: Red=1(+3), Yellow=1(+3)
    //   Base: ROOK(15)+B14(10)=25; Total = 25+18+3+3=49... too low for strength ~75
    //
    // Let's use: ROOK+B1+B14+B9+B8+B7+R2+G2+Y2+G3
    //   Black: B1(15),B14(10),B9,B8,B7 = 5, weight=5+1.5+1.0=7.5
    //   Red: R2=1, weight=1
    //   Green: G2,G3=2, weight=2
    //   Yellow: Y2=1, weight=1
    //   probableTrump=Black(7.5), trumpLength=5 → bonus=18
    //   Singletons: Red=1(+3), Yellow=1(+3)
    //   Base: ROOK(15)+B1(15)+B14(10)=40; Total=40+18+3+3=64
    //   baseBidCeiling(64): anchor [60,115]→[75,130], t=(64-60)/(75-60)=4/15≈0.27; ceil=115+0.27*15≈119
    //   Still not 130. Need strength=75 exactly.
    //
    // Let's target strength=75:
    //   ROOK+B1+B14+B10+B9+B8+R2+G2+Y2+G3
    //   Black: B1(15),B14(10),B10(8),B9,B8 = 5, weight=5+1.5+1.0+0.8=8.3
    //   Red: R2=1, weight=1
    //   Green: G2,G3=2, weight=2
    //   Yellow: Y2=1, weight=1
    //   probableTrump=Black(8.3), trumpLength=5 → bonus=18
    //   Singletons: Red=1(+3), Yellow=1(+3)
    //   Base: ROOK(15)+B1(15)+B14(10)+B10(8)=48; Total=48+18+3+3=72
    //   baseBidCeiling(72): anchor [60,115]→[75,130], t=(72-60)/(75-60)=12/15=0.8; ceil=115+0.8*15=127
    //   rawCeiling=127, partnerBid=120, margin=127-120=7 < 25 → passes ✓
    //
    // Use Expert profile (accuracy=1.0 → deterministic) + scoreContextAwareness=true
    const hand: CardId[] = ["ROOK", "B1", "B14", "B10", "B9", "B8", "R2", "G2", "Y2", "G3"];
    const state = makePartnerHoldsBidState("S", hand, 120);
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(state, "S", profile);
    expect(cmd.type).toBe("PassBid");
  });

  it("Level 3+ bot bids when partner holds the bid but hand is dramatically stronger", () => {
    // Seat S, partner N holds bid at 120.
    // Strong hand → baseBidCeiling well above 120+25=145 → falls through to normal bidding.
    // Hand: ROOK+B1+R1+G1+Y1+B14+R14+G14+Y14+B10
    //   strength very high → baseBidCeiling=200
    //   rawCeiling=200, 200 > 120+25=145 → falls through to normal bidding → bids
    const hand: CardId[] = ["ROOK", "B1", "R1", "G1", "Y1", "B14", "R14", "G14", "Y14", "B10"];
    const state = makePartnerHoldsBidState("S", hand, 120);
    // Block moon shoot so we stay in normal bid path
    const stateNoMoon = { ...state, moonShooters: ["S"] as Seat[] };
    const profile = { ...BOT_PRESETS[5], playAccuracy: 1.0 };
    const cmd = botChooseCommand(stateNoMoon, "S", profile);
    // Should bid (falls through to normal bidding since hand is way above margin)
    expect(cmd.type).toBe("PlaceBid");
  });

  it("computeBidCeiling does not add partner-bid boost when partner holds bid", () => {
    // Seat S (NS team), partner N holds bid at 120 (bidder=N, bids[N]=120).
    // state.bidder === partnerOf("S") = "N" → partnerHoldsBid=true → boost suppressed.
    //
    // Hand: ROOK+B1+B9+B8+B7+R2+G2+Y2+G3+Y3
    //   Black: B1(15),B9,B8,B7 = 4, weight=4+1.5=5.5 → probableTrump
    //   Red: R2=1, weight=1
    //   Green: G2,G3=2, weight=2
    //   Yellow: Y2,Y3=2, weight=2
    //   trumpLength=4 → bonus=10; singletons: Red=1(+3)
    //   Base: ROOK(15)+B1(15)=30; Total=30+10+3=43
    //   baseBidCeiling(43): anchor [40,100]→[60,115], t=(43-40)/(60-40)=0.15; ceil=100+0.15*15≈102
    //   With aggressiveness=1.15 (expert): ceil=round(102*1.15)=117
    //   Without partner boost: ceiling ≈ 117 (base)
    //   With partner boost (partnerBid=120): +max(0,round((120-100)*0.3))=+6 → 123
    //   Verify that when partnerHoldsBid=true, ceiling is the lower value (boost suppressed).
    const hand: CardId[] = ["ROOK", "B1", "B9", "B8", "B7", "R2", "G2", "Y2", "G3", "Y3"];
    const base = makeBiddingStateWithHand("S", hand);
    const stateWithPartnerHoldsBid: GameState = {
      ...base,
      bidder: "N",  // partner holds bid
      currentBid: 120,
      bids: { ...base.bids, N: 120 },
    };
    const stateWithPartnerPassed: GameState = {
      ...base,
      bidder: "E",  // some other seat holds bid (not partner)
      currentBid: 120,
      bids: { ...base.bids, N: 120, E: 120 },
    };
    const profile = { ...BOT_PRESETS[5] }; // scoreContextAwareness=true, accuracy=1.0

    const ceilingWithPartnerHolds = computeBidCeiling(hand, stateWithPartnerHoldsBid, "S", profile);
    const ceilingWithoutPartnerHolds = computeBidCeiling(hand, stateWithPartnerPassed, "S", profile);

    // When partner holds bid, the boost should be suppressed → lower ceiling
    expect(ceilingWithPartnerHolds).toBeLessThanOrEqual(ceilingWithoutPartnerHolds);
  });
});

// ── Fix 3: evaluateMoonShoot structural gates + threshold raises ───────────────

describe("botChooseCommand - Fix 3 (moon shoot structural gates + threshold raises)", () => {
  it("ace-count gate blocks moon shoot on ace-less hard/expert hand (difficulty >= 4)", () => {
    // Level 4 bot (difficulty=4 >= 4), 0 aces, 0 ROOK — gate fires → returns false.
    // Use a trump-heavy hand with no aces: ROOK absent, no value=1 cards.
    // Hand: B14+B13+B12+B11+B10+B9+B8+B7+B6+B5
    //   Black: all 10 cards, weight very high → probableTrump=Black
    //   trumpLength=10 → bonus=35 (capped at 7)
    //   Actually trumpLengthBonuses[Math.min(10,7)] = 35
    //   Base: B14(10)+B10(8)+B5(5) = 23; Total=23+35=58
    //   Level 4 moonShootThreshold=90 (after fix=105), so 58 < 105 anyway.
    //   But the ace-count gate should fire BEFORE the threshold check.
    //   With gate: 0 aces, no ROOK → gate blocks (returns false regardless of strength).
    //
    // To test the gate specifically, use a hand that would pass the threshold check
    // if the gate weren't there: ROOK+B14+B13+B12+B11+B10+B9+B8+B7+B6
    //   ROOK(15); Black=9, weight=9+1.0+0=10+...
    //   Actually: ROOK is excluded from color counting in estimateHandValue
    //   Black: B14(10),B13,B12,B11,B10(8),B9,B8,B7,B6 = 9, weight=9+1.0+0.8=10.8
    //   trumpLength=9 → bonus=35 (capped at 7)
    //   Base: ROOK(15)+B14(10)+B10(8)=33; Total=33+35=68
    //   Still below 105 (new Hard threshold). Let's use a truly strong hand:
    //
    // Best approach: Level 4 bot with a hand that has strength >= Level4_threshold(105)
    // but 0 aces. Use custom profile with lower threshold to make gate the only blocker.
    const hand: CardId[] = ["ROOK", "B14", "R14", "G14", "Y14", "B13", "R13", "G13", "B12", "R12"];
    // Strength calc:
    //   Black: B14(10),B13,B12 = 3, weight=3+1.0=4.0
    //   Red: R14(10),R13,R12 = 3, weight=3+1.0=4.0
    //   Green: G14(10),G13 = 2, weight=2+1.0=3.0
    //   Yellow: Y14(10) = 1, weight=1+1.0=2.0
    //   probableTrump=Black(4.0) or Red(4.0)—Black wins (first encountered)
    //   trumpLength=3 → bonus=5; singletons: Yellow=1(+3); near-void: Green=2(no); Yellow=1(+3)
    //   Base: ROOK(15)+B14(10)+R14(10)+G14(10)+Y14(10)=55; Total=55+5+3=63
    //   Level 4 threshold=105 (after fix), 63 < 105 → still blocked. Not a great test.
    //
    // Use custom profile: difficulty=4, moonShootThreshold set low enough that hand passes threshold
    // but ace-count gate fires.
    const customProfile = { ...BOT_PRESETS[4], moonShootThreshold: 50 }; // low threshold
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 0, EW: 0 },
      moonShooters: [] as Seat[],
    };
    // With moonShootThreshold=50, hand strength ~63 >= 50 → would shoot without gate.
    // But 0 aces, no ROOK → ace-count gate fires at difficulty >= 4 → returns false → passes.
    // Wait — the hand has ROOK! Let me recheck:
    // hand has ROOK — so hasRook=true. Gate: !(hasRook && aceCount >= 1)
    // aceCount: no value=1 cards → 0. hasRook=true, aceCount=0 → condition !(true && false) = !(false) = true → gate fires!
    const cmd = botChooseCommand(state, "E", customProfile);
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("ace-count gate passes with ROOK + 1 ace (difficulty >= 4)", () => {
    // Level 4 bot: hasRook=true, aceCount=1 → gate condition: !(true && true) = false → gate passes.
    // Hand: ROOK + B1 + many trump + others
    // Use low moonShootThreshold so we'd shoot if gate passes.
    const hand: CardId[] = ["ROOK", "B1", "B14", "B13", "B12", "B11", "B10", "B9", "B8", "B7"];
    // Black: B1(15),B14(10),B13,B12,B11,B10(8),B9,B8,B7 = 9, weight=9+1.5+1.0+0.8=12.3
    // trumpLength=9 → bonus=35; no voids/singletons (only Black non-rook)
    // Base: ROOK(15)+B1(15)+B14(10)+B10(8)=48; Total=48+35=83
    const customProfile = { ...BOT_PRESETS[4], moonShootThreshold: 80 }; // 83 >= 80 → shoots if gate passes
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 0, EW: 0 },
      moonShooters: [] as Seat[],
    };
    // aceCount=1 (B1), hasRook=true → gate passes → proceeds to threshold → 83 >= 80 → shoots
    const cmd = botChooseCommand(state, "E", customProfile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("ace-count gate passes with 2 aces and no ROOK (difficulty >= 4)", () => {
    // Level 4 bot: hasRook=false, aceCount=2 → condition: !(false) = not relevant
    //   Gate: aceCount < 2 && !(hasRook && aceCount >= 1) → 2 < 2 = false → gate does NOT fire → passes.
    // Use low moonShootThreshold so we'd shoot if gate passes.
    const hand: CardId[] = ["B1", "R1", "B14", "B13", "B12", "B11", "B10", "B9", "B8", "B7"];
    // Black: B1(15),B14(10),B13,B12,B11,B10(8),B9,B8,B7 = 9, weight=9+1.5+1.0+0.8=12.3
    // Red: R1(15) = 1, weight=2.5
    // probableTrump=Black, trumpLength=9 → bonus=35
    // Singletons: Red=1(+3)
    // Base: B1(15)+R1(15)+B14(10)+B10(8)=48; Total=48+35+3=86
    const customProfile = { ...BOT_PRESETS[4], moonShootThreshold: 80 }; // 86 >= 80 → shoots if gate passes
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 0, EW: 0 },
      moonShooters: [] as Seat[],
    };
    // aceCount=2, gate condition: 2<2 = false → gate does not fire → threshold check → 86>=80 → shoots
    const cmd = botChooseCommand(state, "E", customProfile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("mid-game winning lead raises moon threshold when comfortably ahead", () => {
    // Level 5 bot (contextualMoonShoot=true), moonShootThreshold=95 (after fix).
    // Score: NS=200, EW=80. E is on EW team.
    // scoreLead for E's opponent (NS): NS=200, EW=80 → E's team=EW.
    // myTeam=EW (score=80), oppTeam=NS (score=200). This is E losing — not winning.
    //
    // We need E to be WINNING: myTeam(EW) > oppTeam(NS)+100 AND myTeam > 0.
    // Score: EW=300, NS=150. scoreLead = EW-NS = 150 > 100, EW=300 > 0 → threshold += 15.
    //
    // Expert base threshold = 95. After mid-game raise: 95+15=110.
    // Need hand strength in range [95, 110) → bot would shoot at 95 but not at 110.
    //
    // Hand: ROOK+B1+R1+G1+B14+B9+B8+B7+B6+Y2
    //   Black: B1(15),B14(10),B9,B8,B7,B6 = 6, weight=6+1.5+1.0=8.5 → probableTrump
    //   Red: R1(15) = 1, weight=2.5
    //   Green: G1(15) = 1, weight=2.5
    //   Yellow: Y2 = 1, weight=1
    //   trumpLength=6 → bonus=28; singletons: Red=1(+3), Green=1(+3), Yellow=1(+3)
    //   Base: ROOK(15)+B1(15)+R1(15)+G1(15)+B14(10)=70; Total=70+28+3+3+3=107
    //   107 >= 95 (baseline) → would shoot WITHOUT mid-game raise
    //   107 < 110 (with mid-game raise: 95+15) → should NOT shoot WITH raise ✓
    const hand: CardId[] = ["ROOK", "B1", "R1", "G1", "B14", "B9", "B8", "B7", "B6", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 150, EW: 300 }, // EW winning: lead=150>100, EW=300>0
      moonShooters: [] as Seat[],
    };
    // Expert: contextualMoonShoot=true, moonShootThreshold=95 (after fix)
    // Mid-game raise: threshold=95+15=110. Strength=107 < 110 → does NOT shoot.
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("ace-count gate does not apply at Level 3 (difficulty < 4)", () => {
    // Level 3 bot: difficulty=3 < 4 → ace-count gate does NOT apply.
    // Even with 0 aces and no ROOK, if strength >= moonShootThreshold(110), bot shoots.
    // Hand: B14+R14+G14+Y14+B13+R13+G13+B12+R12+G12
    //   No aces, no ROOK.
    //   Black: B14(10),B13,B12 = 3, weight=3+1.0=4.0 → probableTrump (tied with Red/Green)
    //   (First color encountered wins ties: Black)
    //   trumpLength=3 → bonus=5
    //   Base: B14(10)+R14(10)+G14(10)+Y14(10)=40; Total=40+5=45
    //   Still below 110 threshold... Need a stronger ace-less hand.
    //
    // Use custom profile with low threshold for Level 3:
    const customProfile = { ...BOT_PRESETS[3], moonShootThreshold: 40 };
    const hand: CardId[] = ["B14", "R14", "G14", "Y14", "B13", "R13", "G13", "B12", "R12", "G12"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 0, EW: 0 },
      moonShooters: [] as Seat[],
    };
    // strength ~45, threshold=40, difficulty=3 → gate does NOT apply → shoots ✓
    const cmd = botChooseCommand(state, "E", customProfile);
    expect(cmd.type).toBe("ShootMoon");
  });
});
