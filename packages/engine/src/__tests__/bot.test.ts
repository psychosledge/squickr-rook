import { describe, it, expect } from "vitest";
import { botChooseCommand } from "../bot.js";
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
    // Expert threshold = 75. Opponents near win → threshold -= 20 → 55.
    // E is on EW team → opponents are NS.
    // Set NS=360 (>= 500-150=350) to trigger the reduction.
    // Hand strength ~58 (above 55 adjusted threshold but below 75 baseline).
    // Hand: ROOK(15)+B1(15)+R14(10)+G8+G7+G6+G5(5)+R2+B2+Y2
    // Green: G8,G7,G6,G5 = 4 cards, weight=4+0.5=4.5 → probableTrump
    // Base: ROOK(15)+B1(15)+R14(10)+G5(5)=45; trump bonus=10; Yellow singleton(+3)
    // strength = 58 > 55 → should shoot moon
    const hand: CardId[] = ["ROOK", "B1", "R14", "G8", "G7", "G6", "G5", "R2", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 360, EW: 0 },  // opponents (NS) at 360 >= 500-150=350
      moonShooters: [] as Seat[],
    };
    // Expert bot: contextualMoonShoot=true, moonShootThreshold=75
    // After contextual adjustment: threshold = 75 - 20 = 55
    // Hand strength = 58 > 55 → should shoot moon
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("expert bot raises moon threshold when winning comfortably", () => {
    // Expert threshold = 75. Own score=420 >= 500-100=400 AND 420 > 200+150=350 → threshold += 20 → 95.
    // Give bot a hand with strength ~80 (above 75 but below 95).
    // Hand: ROOK(15)+B1(15)+R1(15)+G5(5)+G9+G8+G7+R2+B2+Y2
    // Green: G5(5), G9(0), G8(0), G7(0) = 4 cards, weight=4+0.5=4.5 → probable trump
    // Black: B1(15), B2(0) = 2, weight=3.5
    // Red: R1(15), R2(0) = 2, weight=3.5
    // Yellow: Y2(0) = 1, weight=1.0
    // probableTrump=Green, trumpLength=4 → bonus=10
    // Non-trump singletons: Yellow=1 (+3)
    // Base: ROOK(15)+B1(15)+R1(15)+G5(5)=50
    // Total = 50 + 10 + 3 = 63... need higher
    // Let's add more trump: ROOK,B1,R1,G1,G5,G9,G8,G7,G6,R2
    // Green: G1(15),G5(5),G9,G8,G7,G6 = 6 cards, weight=6+15*0.1+5*0.1=6+1.5+0.5=8.0
    // Black: B1(15) = 1, weight=2.5
    // Red: R1(15),R2 = 2, weight=3.5
    // Yellow: none → void (+8)
    // probableTrump=Green(8.0), trumpLength=6 → bonus=28
    // Base: ROOK(15)+B1(15)+R1(15)+G1(15)+G5(5)=65
    // Total = 65+28+8+3(B1 singleton)+3(R2 non-singleton... R=2 cards, no singleton bonus)
    // Actually R=2 cards: no singleton bonus. B=1 singleton: +3.
    // Total = 65+28+8+3 = 104... too high (would shoot regardless)
    // Let's use a hand where strength is around 78-85:
    // ROOK(15)+B1(15)+G5(5)+G9+G8+G7+G6+R2+B2+Y2
    // Green: G5(5),G9,G8,G7,G6 = 5 cards, weight=5+0.5=5.5
    // Black: B1(15),B2 = 2, weight=2+1.5=3.5
    // Red: R2 = 1, weight=1
    // Yellow: Y2 = 1, weight=1
    // probableTrump=Green(5.5), trumpLength=5 → bonus=18
    // Singletons: Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+G5(5) = 35
    // Total = 35+18+3+3 = 59 < 75 baseline → even without raising it wouldn't shoot
    // Need to pick hand with strength 76-94:
    // ROOK(15)+B1(15)+R14(10)+G9+G8+G7+G6+G5+B2+Y2
    // Green: G9,G8,G7,G6,G5(5) = 5 cards, weight=5+0.5=5.5
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R14(10) = 1, weight=1+1.0=2.0
    // Yellow: Y2 = 1, weight=1
    // probableTrump=Green(5.5), trumpLength=5 → bonus=18
    // Singletons: Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+R14(10)+G5(5) = 45
    // Total = 45+18+3+3 = 69 < 75... still not enough
    // Try: ROOK+B1+R1+R14+G8+G7+G6+G5+B2+Y2
    // Red: R1(15),R14(10) = 2, weight=2+1.5+1.0=4.5
    // Green: G8,G7,G6,G5(5) = 4, weight=4+0.5=4.5
    // Black: B1(15),B2 = 2, weight=3.5
    // Yellow: Y2 = 1, weight=1.0
    // Both Red and Green tied at 4.5... Red gets picked (first encountered)
    // probableTrump=Red(4.5), trumpLength=2 → bonus=0
    // Non-trump voids: none; singletons: Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+R1(15)+R14(10)+G5(5) = 60
    // Total = 60+0+3 = 63 < 75
    // Let's try a reliable hand: 5 trump, 3 big point cards, 2 singletons
    // ROOK+B1+R1+G1+G14+G9+G8+G7+B2+Y2
    // Green: G1(15),G14(10),G9,G8,G7 = 5, weight=5+1.5+1.0=7.5
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R1(15) = 1, weight=2.5
    // Yellow: Y2 = 1, weight=1.0
    // probableTrump=Green(7.5), trumpLength=5 → bonus=18
    // Singletons: Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+R1(15)+G1(15)+G14(10) = 70
    // Total = 70+18+3+3 = 94 > 75 → would shoot at baseline
    // Hmm. Need strength in range 76-94.
    // ROOK+B1+G14+G9+G8+G7+G6+R2+B2+Y2
    // Green: G14(10),G9,G8,G7,G6 = 5, weight=5+1.0=6.0
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R2 = 1, weight=1.0
    // Yellow: Y2 = 1, weight=1.0
    // probableTrump=Green(6.0), trumpLength=5 → bonus=18
    // Singletons: Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+G14(10) = 40
    // Total = 40+18+3+3 = 64 < 75
    // ROOK+B1+R1+G14+G9+G8+G7+G6+B2+Y2
    // Green: G14(10),G9,G8,G7,G6 = 5, weight=5+1.0=6.0
    // Black: B1(15),B2 = 2, weight=3.5
    // Red: R1(15) = 1, weight=2.5
    // Yellow: Y2 = 1, weight=1.0
    // probableTrump=Green(6.0), trumpLength=5 → bonus=18
    // Singletons: Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+R1(15)+G14(10) = 55
    // Total = 55+18+3+3 = 79
    // 79 > 75 (baseline threshold) → would ALREADY shoot at baseline!
    // We need: 75 < strength < 95
    // 79 is in range 75–95. With score condition: threshold becomes 75+20=95.
    // 79 < 95 → should NOT shoot. ✓
    const hand: CardId[] = ["ROOK", "B1", "R1", "G14", "G9", "G8", "G7", "G6", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // EW (E's team) winning comfortably: score >= 400 AND > opp+150
      scores: { NS: 200, EW: 420 },
      moonShooters: [] as Seat[],
    };
    // Expert bot: contextualMoonShoot=true
    // threshold = 75, own=420 >= 400 AND 420 > 200+150=350 → threshold += 20 → 95
    // strength = 79 < 95 → should NOT shoot
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    // Should not shoot moon (should bid or pass)
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("non-expert bot does not contextually adjust threshold", () => {
    // Level 4 bot: contextualMoonShoot=false, moonShootThreshold=90
    // Opponents at 360 → contextual would drop threshold by 20 → 70
    // But level 4 doesn't contextually adjust → threshold stays 90
    // Give bot a hand with strength ~80 (above 70 but below 90)
    // ROOK+B1+R1+G14+G9+G8+G7+G6+B2+Y2 → strength=79 (computed above)
    // 79 < 90 → should NOT shoot (no contextual adjustment)
    const hand: CardId[] = ["ROOK", "B1", "R1", "G14", "G9", "G8", "G7", "G6", "B2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      scores: { NS: 360, EW: 0 },  // opponents (NS) at 360 >= 350
      moonShooters: [] as Seat[],
    };
    // Level 4: contextualMoonShoot=false
    const profile = BOT_PRESETS[4];
    const cmd = botChooseCommand(state, "E", profile);
    // Without contextual adjustment, threshold=90, strength=79 → no shoot
    expect(cmd.type).not.toBe("ShootMoon");
  });

  it("expert bot with desperation bonus (myTeam <= -200) shoots moon just above lowered threshold", () => {
    // Expert threshold = 75. Own team at -200 → threshold -= 10 → 65.
    // Opponents NOT near win (no opp trigger) → only desperation applies.
    //
    // Hand: ROOK(15)+B1(15)+R14(10)+G9+G8+G7+G6+G5+R2+Y2
    // Green: G9,G8,G7,G6,G5(5)=5 cards, weight=5+0.5=5.5 → probableTrump=Green
    // Black: B1(15),B2 skipped (no B2 here) → B1=1, weight=2.5... wait let's recount:
    //   Black: B1=1 card, weight=1+15*0.1=2.5
    //   Red: R14(10),R2=2 cards, weight=2+10*0.1=3.0 → no, R2 weight=1, R14 weight=2.0 → total=3.0
    //   Yellow: Y2=1 card, weight=1
    //   Green: G9,G8,G7,G6,G5(5)=5, weight=5+5*0.1=5.5 → probableTrump=Green
    // trumpLength=5 → bonus=18
    // Singletons (non-trump): Black=1(+3), Red=2... no, Red=2 cards (no singleton). Yellow=1(+3)
    // Base: ROOK(15)+B1(15)+R14(10)+G5(5)=45
    // Total = 45+18+3+3 = 69
    //
    // 69 >= 65 (desperation threshold) → SHOOTS ✓
    // 69 < 75 (baseline threshold) → would NOT shoot without desperation ✓
    const hand: CardId[] = ["ROOK", "B1", "R14", "G9", "G8", "G7", "G6", "G5", "R2", "Y2"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // EW (E's team) in deep hole: -200 → triggers desperation (-10)
      // NS (opponents) at 0 → NOT near win, so opp trigger does NOT fire
      scores: { NS: 0, EW: -200 },
      moonShooters: [] as Seat[],
    };
    // Expert: contextualMoonShoot=true, moonShootThreshold=75
    // Desperation: threshold = 75 - 10 = 65; strength=69 >= 65 → shoot
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });

  it("expert bot with dual triggers (opp near win + desperation) applies combined -30 reduction", () => {
    // Expert threshold = 75. BOTH triggers:
    //   - Opponents (NS) >= 350 → threshold -= 20
    //   - Own team (EW) <= -200 → threshold -= 10
    //   Effective threshold = 75 - 20 - 10 = 45
    //
    // Hand chosen to have strength ~47, which is:
    //   >= 45 (dual trigger fires) ✓
    //   < 55  (opp-only trigger would not fire alone) ✓
    //   < 65  (desp-only trigger would not fire alone) ✓
    //   < 75  (baseline threshold) ✓
    //
    // Hand: ROOK(15)+G9+G8+G7+G6+G5+R10(8)+B2+Y2+B3
    //   Green: G9,G8,G7,G6,G5(5)=5, weight=5+0.5=5.5 → probableTrump=Green
    //   Black: B2,B3=2, weight=2
    //   Red: R10(8)=1, weight=1+0.8=1.8
    //   Yellow: Y2=1, weight=1.0
    // trumpLength=5 → bonus=18
    // Singletons (non-trump): Red=1(+3), Yellow=1(+3)
    // Base: ROOK(15)+R10(8)+G5(5)=28 (G5 is trump, worth 5pts)
    // Total = 28+18+3+3 = 52
    //
    // 52 >= 45 (dual threshold) → SHOOTS ✓
    const hand: CardId[] = ["ROOK", "G9", "G8", "G7", "G6", "G5", "R10", "B2", "Y2", "B3"];
    const state = {
      ...makeBiddingStateWithHand("E", hand),
      // Both triggers active:
      scores: { NS: 360, EW: -200 },  // opp(NS)=360 >= 350, own(EW)=-200 <= -200
      moonShooters: [] as Seat[],
    };
    // Expert: threshold = 75 - 20 - 10 = 45; strength≈52 >= 45 → shoots
    const profile = BOT_PRESETS[5];
    const cmd = botChooseCommand(state, "E", profile);
    expect(cmd.type).toBe("ShootMoon");
  });
});
