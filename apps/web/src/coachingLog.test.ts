/**
 * TDD tests for coachingLog.ts transform layer.
 *
 * Tests are written FIRST (RED) before implementation exists.
 * They cover the 10 key scenarios called out in the spec.
 */

import { describe, it, expect } from "vitest";
import type { HandLogEntry, BidEvent } from "./devLog";
import type { CardId, Seat } from "@rook/engine";
import { buildCoachingEntry, buildCoachingLog } from "./coachingLog";
import type { CoachingPlay, CoachingAuctionEvent } from "./coachingLog";

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal but complete HandLogEntry fixture.
 *
 * Point values in this engine:
 *   value 1  → 15 pts
 *   value 5  → 5 pts
 *   value 10 → 10 pts
 *   value 14 → 10 pts
 *   ROOK     → 20 pts
 *   values 6-9, 11-13 → 0 pts
 *
 * Card layout (post-discard, 10 cards each):
 *   N: B6 B7 B8 B9 B11 B12 B13 B5 B10 B1  (all Black)
 *   E: R6 R7 R8 R9 R11 R12 R13 R5 R10 R1  (all Red)
 *   S: G6 G7 G8 G9 G11 G12 G13 G5 G10 G1  (all Green)
 *   W: Y6 Y7 Y8 Y9 Y11 Y12 Y13 Y5 Y10 Y1  (all Yellow)
 *
 * N is bid winner. Nest = [B14 R14 G14 Y14 ROOK]. N discards nest cards back.
 * N's effective hand = N's starting 10 cards (unchanged).
 *
 * Tricks (N leads Black, N wins all — others follow own suit each trick):
 *   Trick 0: B6  R6  G6  Y6  → N  (0 pts)
 *   Trick 1: B7  R7  G7  Y7  → N  (0 pts)
 *   Trick 2: B8  R8  G8  Y8  → N  (0 pts)
 *   Trick 3: B9  R9  G9  Y9  → N  (0 pts)
 *   Trick 4: B11 R11 G11 Y11 → N  (0 pts)
 *   Trick 5: B12 R12 G12 Y12 → N  (0 pts)
 *   Trick 6: B13 R13 G13 Y13 → N  (0 pts)
 *   Trick 7: B5  R5  G5  Y5  → N  (5+5+5+5 = 20 pts NS)
 *   Trick 8: B10 R10 G10 Y10 → N  (10+10+10+10 = 40 pts NS)
 *   Trick 9: B1  R1  G1  Y1  → N  (15+15+15+15 = 60 pts NS)
 *
 * NS total point cards from tricks: 20 + 40 + 60 = 120 pts
 * EW total: 0 pts
 */

// N's starting hand (10 Black cards)
const N_START: CardId[] = ["B6","B7","B8","B9","B11","B12","B13","B5","B10","B1"];
const E_START: CardId[] = ["R6","R7","R8","R9","R11","R12","R13","R5","R10","R1"];
const S_START: CardId[] = ["G6","G7","G8","G9","G11","G12","G13","G5","G10","G1"];
const W_START: CardId[] = ["Y6","Y7","Y8","Y9","Y11","Y12","Y13","Y5","Y10","Y1"];

// Nest cards: N picks these up and discards them all back
// B14(10)+R14(10)+G14(10)+Y14(10)+ROOK(20) = 60 pts in nest/discards
const NEST_CARDS: CardId[] = ["B14","R14","G14","Y14","ROOK"];
const BID_WINNER_DISCARDS: CardId[] = ["B14","R14","G14","Y14","ROOK"];

function makeTrick(
  trickIndex: number,
  n: CardId,
  e: CardId,
  s: CardId,
  w: CardId,
  winner: Seat,
  leadColor: import("@rook/engine").Color | null,
): import("./devLog").TrickLog {
  return {
    trickIndex,
    leadColor,
    plays: [
      { seat: "N", cardId: n, isHuman: true, annotation: null },
      { seat: "E", cardId: e, isHuman: false, annotation: { phase: "playing", seat: "E", difficulty: 3, trickIndex, leadOrFollow: trickIndex === 0 ? "lead" : "follow", trumpPulled: false, isBiddingTeam: false, teamPointsCaptured: 0, cardChosen: e, reasoning: "lowest_losing" } },
      { seat: "S", cardId: s, isHuman: false, annotation: { phase: "playing", seat: "S", difficulty: 3, trickIndex, leadOrFollow: trickIndex === 0 ? "lead" : "follow", trumpPulled: false, isBiddingTeam: true, teamPointsCaptured: 0, cardChosen: s, reasoning: "lowest_losing" } },
      { seat: "W", cardId: w, isHuman: false, annotation: { phase: "playing", seat: "W", difficulty: 3, trickIndex, leadOrFollow: trickIndex === 0 ? "lead" : "follow", trumpPulled: false, isBiddingTeam: false, teamPointsCaptured: 0, cardChosen: w, reasoning: "lowest_losing" } },
    ],
    winner,
    pointCards: [],
  };
}

// 10 tricks — N wins all (leads Black, everyone else follows with their own suit)
const TRICKS: import("./devLog").TrickLog[] = [
  makeTrick(0, "B6",  "R6",  "G6",  "Y6",  "N", "Black"),
  makeTrick(1, "B7",  "R7",  "G7",  "Y7",  "N", "Black"),
  makeTrick(2, "B8",  "R8",  "G8",  "Y8",  "N", "Black"),
  makeTrick(3, "B9",  "R9",  "G9",  "Y9",  "N", "Black"),
  makeTrick(4, "B11", "R11", "G11", "Y11", "N", "Black"),
  makeTrick(5, "B12", "R12", "G12", "Y12", "N", "Black"),
  makeTrick(6, "B13", "R13", "G13", "Y13", "N", "Black"),
  makeTrick(7, "B5",  "R5",  "G5",  "Y5",  "N", "Black"),
  makeTrick(8, "B10", "R10", "G10", "Y10", "N", "Black"),
  makeTrick(9, "B1",  "R1",  "G1",  "Y1",  "N", "Black"),
];

// Cumulative NS trick points: 0+0+0+0+0+0+0+20+40+60 = 120, EW = 0
const SCORE_FIXED: import("@rook/engine").HandScore = {
  hand: 1,
  bidder: "N",
  bidAmount: 100,
  nestCards: NEST_CARDS,
  discarded: BID_WINNER_DISCARDS,
  nsPointCards: 120,
  ewPointCards: 0,
  nsMostCardsBonus: 20,  // NS won all 40 trick cards + 5 nest = 45 > 22
  ewMostCardsBonus: 0,
  nsNestBonus: 0,        // score says 0 (discarded cards used as input, not recomputed)
  ewNestBonus: 0,
  nsWonLastTrick: true,
  ewWonLastTrick: false,
  nsTotal: 140,          // 120 + 20 mostCards
  ewTotal: 0,
  nsDelta: 140,          // bid made: nsTotal(140) >= bidAmount(100) ✓
  ewDelta: 0,
  shotMoon: false,
  moonShooterWentSet: false,
};

const AUCTION_EVENTS: BidEvent[] = [
  { seat: "N", isHuman: true,  action: "place",  amount: 100, standingBid: 95,  round: 1, annotation: null },
  { seat: "E", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
  { seat: "S", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
  { seat: "W", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
];

function makeFixture(overrides: Partial<HandLogEntry> = {}): HandLogEntry {
  return {
    handNumber: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    dealer: "W",
    trump: "Black",
    botDifficulties: { E: 3, S: 3, W: 3 },
    auctionEvents: AUCTION_EVENTS,
    auctionRounds: 1,
    bidSummary: [],
    finalBidder: "N",
    finalBidAmount: 100,
    moonAttempted: false,
    moonMade: false,
    nestCards: NEST_CARDS,
    bidWinnerDiscards: BID_WINNER_DISCARDS,
    startingHands: {
      N: [...N_START],
      E: [...E_START],
      S: [...S_START],
      W: [...W_START],
    },
    discardAnnotations: [],
    trumpAnnotation: null,
    tricks: TRICKS,
    score: SCORE_FIXED,
    scoresAfter: { NS: 140, EW: 0 },
    scoresBefore: { NS: 0, EW: 0 },
    durationMs: 12000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildCoachingEntry — 1. smoke test (shape)", () => {
  it("returns a CoachingHandEntry with correct top-level shape", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    expect(entry).toBeDefined();
    expect(entry.handNumber).toBe(1);
    expect(entry.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(entry.dealer).toBe("W");
    expect(entry.trump).toBe("Black");
    expect(entry.scoreContext).toBeDefined();
    expect(entry.biddingSummary).toBeDefined();
    expect(entry.auctionTimeline).toBeDefined();
    expect(entry.nestSummary).toBeDefined();
    expect(entry.effectiveHands).toBeDefined();
    expect(entry.handsAtTrick).toBeDefined();
    expect(entry.tricks).toBeDefined();
    expect(entry.outcome).toBeDefined();
  });
});

describe("buildCoachingEntry — 2. scoreContext", () => {
  it("computes pointsToWin correctly", () => {
    const raw = makeFixture({ scoresBefore: { NS: 200, EW: -100 } });
    const entry = buildCoachingEntry(raw);

    expect(entry.scoreContext.scoresBefore).toEqual({ NS: 200, EW: -100 });
    expect(entry.scoreContext.pointsToWin.NS).toBe(300);   // 500 - 200
    expect(entry.scoreContext.pointsToWin.EW).toBe(600);   // 500 - (-100)
  });

  it("computes pointsToBust correctly", () => {
    const raw = makeFixture({ scoresBefore: { NS: 200, EW: -100 } });
    const entry = buildCoachingEntry(raw);

    expect(entry.scoreContext.pointsToBust.NS).toBe(700);  // 200 + 500
    expect(entry.scoreContext.pointsToBust.EW).toBe(400);  // -100 + 500
  });
});

describe("buildCoachingEntry — 3. biddingSummary.isForced", () => {
  it("isForced = false when no forced action present", () => {
    const raw = makeFixture(); // all normal bid events
    const entry = buildCoachingEntry(raw);
    expect(entry.biddingSummary.isForced).toBe(false);
  });

  it("isForced = true when finalBidder has 'forced' action in auctionEvents", () => {
    const raw = makeFixture({
      auctionEvents: [
        { seat: "N", isHuman: false, action: "forced", amount: 100, standingBid: 95, round: 1, annotation: null },
        { seat: "E", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
        { seat: "S", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
        { seat: "W", isHuman: false, action: "pass",   amount: null, standingBid: 100, round: 1, annotation: null },
      ],
    });
    const entry = buildCoachingEntry(raw);
    expect(entry.biddingSummary.isForced).toBe(true);
  });

  it("other biddingSummary fields are set correctly", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.biddingSummary.finalBidder).toBe("N");
    expect(entry.biddingSummary.finalBidAmount).toBe(100);
    expect(entry.biddingSummary.finalBidderTeam).toBe("NS");
    expect(entry.biddingSummary.auctionRounds).toBe(1);
    expect(entry.biddingSummary.moonAttempted).toBe(false);
    expect(entry.biddingSummary.moonMade).toBe(false);
  });
});

describe("buildCoachingEntry — 4. effectiveHands", () => {
  it("bid winner's effective hand = startingHand + nestCards - discards", () => {
    // N starts with N_START (10 cards), picks up NEST_CARDS (5 cards = 15 total),
    // then discards BID_WINNER_DISCARDS (5 cards). Since discards === nestCards,
    // effective hand = N_START (10 cards, unchanged).
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    expect(entry.effectiveHands.N).toHaveLength(10);
    // All N_START cards should be present
    for (const c of N_START) {
      expect(entry.effectiveHands.N).toContain(c);
    }
    // Discarded cards should NOT be present
    for (const c of BID_WINNER_DISCARDS) {
      expect(entry.effectiveHands.N).not.toContain(c);
    }
  });

  it("other seats' effective hands are unchanged copies of startingHands", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    expect([...entry.effectiveHands.E]).toEqual(E_START);
    expect([...entry.effectiveHands.S]).toEqual(S_START);
    expect([...entry.effectiveHands.W]).toEqual(W_START);
  });

  it("bid winner picks up a nest card that was not in starting hand", () => {
    // Give N a nest card (B14) that N did NOT discard back
    // N's starting hand: 10 cards, nest = [B14, R14, G14, Y14, ROOK]
    // N discards [R14, G14, Y14, ROOK, B13] — N KEEPS B14
    // Effective hand = N_START minus B13 plus B14
    const raw = makeFixture({
      nestCards: ["B14","R14","G14","Y14","ROOK"],
      bidWinnerDiscards: ["R14","G14","Y14","ROOK","B13"],
      score: { ...SCORE_FIXED, nestCards: ["B14","R14","G14","Y14","ROOK"], discarded: ["R14","G14","Y14","ROOK","B13"] },
    });
    const entry = buildCoachingEntry(raw);

    // B14 should be in effective hand (kept from nest)
    expect(entry.effectiveHands.N).toContain("B14");
    // B13 should NOT be in effective hand (discarded)
    expect(entry.effectiveHands.N).not.toContain("B13");
    // Hand should still be 10 cards
    expect(entry.effectiveHands.N).toHaveLength(10);
  });
});

describe("buildCoachingEntry — 5. handsAtTrick", () => {
  it("has exactly 10 entries", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.handsAtTrick).toHaveLength(10);
  });

  it("handsAtTrick[0] equals effectiveHands", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    for (const seat of ["N","E","S","W"] as Seat[]) {
      expect([...entry.handsAtTrick[0][seat]]).toEqual([...entry.effectiveHands[seat]]);
    }
  });

  it("handsAtTrick[1] has each player's card from trick 0 removed", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    // Trick 0: N plays B6, E plays R6, S plays G6, W plays Y6
    expect(entry.handsAtTrick[1].N).not.toContain("B6");
    expect(entry.handsAtTrick[1].E).not.toContain("R6");
    expect(entry.handsAtTrick[1].S).not.toContain("G6");
    expect(entry.handsAtTrick[1].W).not.toContain("Y6");

    // Each hand should have 9 cards after trick 0
    expect(entry.handsAtTrick[1].N).toHaveLength(9);
    expect(entry.handsAtTrick[1].E).toHaveLength(9);
    expect(entry.handsAtTrick[1].S).toHaveLength(9);
    expect(entry.handsAtTrick[1].W).toHaveLength(9);
  });

  it("handsAtTrick[9] has 1 card remaining per player", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    expect(entry.handsAtTrick[9].N).toHaveLength(1);
    expect(entry.handsAtTrick[9].E).toHaveLength(1);
    expect(entry.handsAtTrick[9].S).toHaveLength(1);
    expect(entry.handsAtTrick[9].W).toHaveLength(1);
  });
});

describe("buildCoachingEntry — 6. CoachingPlay.isForced", () => {
  it("lead seat (N) is never forced", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    for (const trick of entry.tricks) {
      const leadPlay = trick.plays.find((p: CoachingPlay) => p.seat === trick.leadSeat)!;
      expect(leadPlay.isForced).toBe(false);
    }
  });

  it("follower with cards of led color is NOT forced", () => {
    // For a "not forced" test, we need a trick where followers have the led suit.
    // Build a fixture where E has some Black cards.
    const eHandWithBlack: CardId[] = ["B2","R5","R6","R7","R8","R9","R10","R11","R12","R13"];
    const raw2 = makeFixture({
      startingHands: {
        N: [...N_START],
        E: eHandWithBlack,
        S: [...S_START],
        W: [...W_START],
      },
      tricks: [
        // Trick 0: N leads Black, E has B2 (can follow suit) → NOT forced
        {
          trickIndex: 0,
          leadColor: "Black",
          plays: [
            { seat: "N", cardId: "B1",  isHuman: true,  annotation: null },
            { seat: "E", cardId: "B2",  isHuman: false, annotation: { phase: "playing", seat: "E", difficulty: 3, trickIndex: 0, leadOrFollow: "follow", trumpPulled: false, isBiddingTeam: false, teamPointsCaptured: 0, cardChosen: "B2", reasoning: "lowest_losing" } },
            { seat: "S", cardId: "G1",  isHuman: false, annotation: { phase: "playing", seat: "S", difficulty: 3, trickIndex: 0, leadOrFollow: "follow", trumpPulled: false, isBiddingTeam: true,  teamPointsCaptured: 0, cardChosen: "G1",  reasoning: "lowest_losing" } },
            { seat: "W", cardId: "Y1",  isHuman: false, annotation: { phase: "playing", seat: "W", difficulty: 3, trickIndex: 0, leadOrFollow: "follow", trumpPulled: false, isBiddingTeam: false, teamPointsCaptured: 0, cardChosen: "Y1",  reasoning: "lowest_losing" } },
          ],
          winner: "N",
          pointCards: [],
        },
        // Tricks 1–9: simplified, use same cards but shifted
        ...TRICKS.slice(1).map(t => ({
          ...t,
          plays: t.plays.map(p => ({
            ...p,
            cardId: p.seat === "E"
              ? (["R5","R6","R7","R8","R9","R10","R11","R12","R13"] as CardId[])[t.trickIndex - 1] ?? p.cardId
              : p.cardId,
          })),
        })),
      ],
    });
    const entry2 = buildCoachingEntry(raw2);
    const trick0 = entry2.tricks[0]!;
    const ePlay = trick0.plays.find((p: CoachingPlay) => p.seat === "E")!;
    expect(ePlay.isForced).toBe(false); // E had Black card, so NOT forced
  });

  it("follower void in led color IS forced", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    // In the fixture, N leads Black but E/S/W have no Black cards.
    // They should be forced.
    const trick0 = entry.tricks[0]!;
    const ePlay = trick0.plays.find((p: CoachingPlay) => p.seat === "E")!;
    const sPlay = trick0.plays.find((p: CoachingPlay) => p.seat === "S")!;
    const wPlay = trick0.plays.find((p: CoachingPlay) => p.seat === "W")!;
    expect(ePlay.isForced).toBe(true);
    expect(sPlay.isForced).toBe(true);
    expect(wPlay.isForced).toBe(true);
  });
});

describe("buildCoachingEntry — 7. cumulativePoints", () => {
  it("cumulative points running sum is correct after each trick", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    // Tricks 0-6: all 0-pt cards → cumulative stays 0
    expect(entry.tricks[0]!.cumulativePoints.NS).toBe(0);
    expect(entry.tricks[0]!.cumulativePoints.EW).toBe(0);
    expect(entry.tricks[6]!.cumulativePoints.NS).toBe(0);
    expect(entry.tricks[6]!.cumulativePoints.EW).toBe(0);

    // Trick 7: B5+R5+G5+Y5 = 20 pts → NS cumulative: 20
    expect(entry.tricks[7]!.cumulativePoints.NS).toBe(20);
    expect(entry.tricks[7]!.cumulativePoints.EW).toBe(0);

    // Trick 8: B10+R10+G10+Y10 = 40 pts → NS cumulative: 60
    expect(entry.tricks[8]!.cumulativePoints.NS).toBe(60);
    expect(entry.tricks[8]!.cumulativePoints.EW).toBe(0);

    // Trick 9: B1+R1+G1+Y1 = 60 pts → NS cumulative: 120
    expect(entry.tricks[9]!.cumulativePoints.NS).toBe(120);
    expect(entry.tricks[9]!.cumulativePoints.EW).toBe(0);
  });

  it("final cumulativePoints matches score.nsPointCards / score.ewPointCards", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    const lastTrick = entry.tricks[9]!;

    expect(lastTrick.cumulativePoints.NS).toBe(raw.score.nsPointCards);
    expect(lastTrick.cumulativePoints.EW).toBe(raw.score.ewPointCards);
  });
});

describe("buildCoachingEntry — 8. cardCount", () => {
  it("after trick 9, NS + EW cardCount === 40", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    const lastTrick = entry.tricks[9]!;
    expect(lastTrick.cardCount.NS + lastTrick.cardCount.EW).toBe(40);
  });

  it("card count increases by 4 each trick for the winning team", () => {
    const raw = makeFixture(); // N wins all tricks
    const entry = buildCoachingEntry(raw);

    // After each trick, NS gets +4 (N wins all), EW gets +0
    for (let i = 0; i < 10; i++) {
      expect(entry.tricks[i]!.cardCount.NS).toBe((i + 1) * 4);
      expect(entry.tricks[i]!.cardCount.EW).toBe(0);
    }
  });
});

describe("buildCoachingEntry — 9. nestSummary.nestBonusToTeam", () => {
  it("nestBonusToTeam matches team of last trick winner", () => {
    const raw = makeFixture(); // N wins trick 9 → NS
    const entry = buildCoachingEntry(raw);
    expect(entry.nestSummary.nestBonusToTeam).toBe("NS");
  });

  it("nestBonusPoints = nsNestBonus when NS wins last trick", () => {
    const rawWithNestBonus = makeFixture({
      score: { ...SCORE_FIXED, nsNestBonus: 15, ewNestBonus: 0, nsWonLastTrick: true, ewWonLastTrick: false },
    });
    const entry = buildCoachingEntry(rawWithNestBonus);
    expect(entry.nestSummary.nestBonusPoints).toBe(15);
  });

  it("nestSummary contains nestCards and discarded", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.nestSummary.nestCards).toEqual(NEST_CARDS);
    expect(entry.nestSummary.discarded).toEqual(BID_WINNER_DISCARDS);
  });

  it("nestPointValue is sum of pointValue() for nestCards", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    // B14=10, R14=10, G14=10, Y14=10, ROOK=20 → total 60
    expect(entry.nestSummary.nestPointValue).toBe(60);
  });
});

describe("buildCoachingLog — 10. array transform", () => {
  it("returns an empty array for empty input", () => {
    expect(buildCoachingLog([])).toEqual([]);
  });

  it("returns an array of length 1 for a single entry", () => {
    const raw = makeFixture();
    const result = buildCoachingLog([raw]);
    expect(result).toHaveLength(1);
  });

  it("returns an array of length 2 for two entries", () => {
    const raw1 = makeFixture();
    const raw2 = makeFixture({ handNumber: 2, timestamp: "2026-01-01T00:01:00.000Z" });
    const result = buildCoachingLog([raw1, raw2]);
    expect(result).toHaveLength(2);
    expect(result[0]!.handNumber).toBe(1);
    expect(result[1]!.handNumber).toBe(2);
  });

  it("each entry in result has correct handNumber", () => {
    const entries = [1, 2, 3].map(n => makeFixture({ handNumber: n }));
    const result = buildCoachingLog(entries);
    expect(result.map((e: { handNumber: number }) => e.handNumber)).toEqual([1, 2, 3]);
  });
});

describe("buildCoachingEntry — auctionTimeline", () => {
  it("maps auctionEvents to CoachingAuctionEvent correctly", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    expect(entry.auctionTimeline).toHaveLength(4);
    const first = entry.auctionTimeline[0]!;
    expect(first.seat).toBe("N");
    expect(first.isHuman).toBe(true);
    expect(first.action).toBe("place");
    expect(first.amount).toBe(100);
    expect(first.standingBid).toBe(95);
    expect(first.round).toBe(1);
    expect(first.botContext).toBeNull(); // human bid → null
  });

  it("sets botContext from annotation for bot bids", () => {
    const annotation: import("./devLog").BiddingAnnotation = {
      phase: "bidding",
      seat: "E",
      difficulty: 3,
      trueHandValue: 105,
      estimatedHandValue: 100,
      ceiling: 110,
      minNextBid: 105,
      partnerBid: null,
      partnerHoldsBid: false,
      partnerCeilingBonus: 5,
      moonShootAttempted: false,
      decision: "pass",
    };
    const raw = makeFixture({
      auctionEvents: [
        { seat: "N", isHuman: true,  action: "place", amount: 100, standingBid: 95, round: 1, annotation: null },
        { seat: "E", isHuman: false, action: "pass",  amount: null, standingBid: 100, round: 1, annotation },
        { seat: "S", isHuman: false, action: "pass",  amount: null, standingBid: 100, round: 1, annotation: null },
        { seat: "W", isHuman: false, action: "pass",  amount: null, standingBid: 100, round: 1, annotation: null },
      ],
    });
    const entry = buildCoachingEntry(raw);
    const eEvent = entry.auctionTimeline.find((e: CoachingAuctionEvent) => e.seat === "E")!;
    expect(eEvent.botContext).not.toBeNull();
    expect(eEvent.botContext!.trueHandValue).toBe(105);
    expect(eEvent.botContext!.ceiling).toBe(110);
    expect(eEvent.botContext!.partnerCeilingBonus).toBe(5);
    expect(eEvent.botContext!.decision).toBe("pass");
  });
});

describe("buildCoachingEntry — outcome", () => {
  it("outcome has correct bidderTeam and bidMade", () => {
    const raw = makeFixture(); // N bid 100, NS nsDelta=140 (positive) → bid IS made
    const entry = buildCoachingEntry(raw);
    expect(entry.outcome.bidderTeam).toBe("NS");
    expect(entry.outcome.bidMade).toBe(true); // nsDelta=140 > 0
  });

  it("outcome.delta matches score deltas", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.outcome.delta.NS).toBe(raw.score.nsDelta);
    expect(entry.outcome.delta.EW).toBe(raw.score.ewDelta);
  });

  it("outcome.scoresAfter matches scoresAfter from raw entry", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.outcome.scoresAfter).toEqual({ NS: 140, EW: 0 });
  });

  it("outcome.bidMade is false when bidder went set (nsDelta < 0)", () => {
    const raw = makeFixture({
      score: {
        ...SCORE_FIXED,
        nsTotal: 80,
        nsDelta: -100,  // set — bidder scored less than bid amount
        ewDelta: 80,
      },
    });
    const entry = buildCoachingEntry(raw);
    expect(entry.outcome.bidMade).toBe(false);
  });

  it("outcome.bonuses.lastTrickBonus has points: 0", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.outcome.bonuses.lastTrickBonus.points).toBe(0);
  });
});

describe("buildCoachingEntry — trick fields", () => {
  it("tricks has exactly 10 entries", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    expect(entry.tricks).toHaveLength(10);
  });

  it("isFinalTrick is true only for trick 9", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);
    for (let i = 0; i < 9; i++) {
      expect(entry.tricks[i]!.isFinalTrick).toBe(false);
    }
    expect(entry.tricks[9]!.isFinalTrick).toBe(true);
  });

  it("pointsAtStake matches sum of card point values", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    // Tricks 0-6: all 0-pt cards
    expect(entry.tricks[0]!.pointsAtStake).toBe(0);
    expect(entry.tricks[1]!.pointsAtStake).toBe(0);
    expect(entry.tricks[6]!.pointsAtStake).toBe(0);

    // Trick 7: 4×5-value cards = 5 pts each = 20 pts
    expect(entry.tricks[7]!.pointsAtStake).toBe(20);

    // Trick 8: 4×10-value cards = 10 pts each = 40 pts
    expect(entry.tricks[8]!.pointsAtStake).toBe(40);

    // Trick 9: 4×1-value cards = 15 pts each = 60 pts
    expect(entry.tricks[9]!.pointsAtStake).toBe(60);
  });

  it("winnerTeam is 'EW' when an EW seat wins a trick", () => {
    // Override tricks so trick 7 is won by E instead of N
    const tricksWithEWWin: import("./devLog").TrickLog[] = TRICKS.map((t, i) =>
      i === 7
        ? { ...t, winner: "E" as Seat }
        : t,
    );
    const raw = makeFixture({ tricks: tricksWithEWWin });
    const entry = buildCoachingEntry(raw);
    expect(entry.tricks[7]!.winnerTeam).toBe("EW");
    // All other tricks still NS
    for (let i = 0; i < 10; i++) {
      if (i !== 7) expect(entry.tricks[i]!.winnerTeam).toBe("NS");
    }
  });

  it("cumulativePoints correctly credits EW when EW wins a trick", () => {
    // Trick 7 (20 pts) won by E (EW team)
    const tricksWithEWWin: import("./devLog").TrickLog[] = TRICKS.map((t, i) =>
      i === 7
        ? { ...t, winner: "E" as Seat }
        : t,
    );
    const raw = makeFixture({ tricks: tricksWithEWWin });
    const entry = buildCoachingEntry(raw);
    // After trick 7: EW cumulativePoints = 20 (the 5-value trick)
    expect(entry.tricks[7]!.cumulativePoints.EW).toBe(20);
    expect(entry.tricks[7]!.cumulativePoints.NS).toBe(0);
    // After trick 8 (40 pts, N wins): NS += 40
    expect(entry.tricks[8]!.cumulativePoints.NS).toBe(40);
    expect(entry.tricks[8]!.cumulativePoints.EW).toBe(20);
  });

  it("winnerTeam is derived from winner seat", () => {
    const raw = makeFixture(); // N wins all
    const entry = buildCoachingEntry(raw);
    for (const trick of entry.tricks) {
      expect(trick.winnerTeam).toBe("NS");
    }
  });

  it("leadSeat and leadColor are set correctly", () => {
    const raw = makeFixture();
    const entry = buildCoachingEntry(raw);

    // All tricks led by N (wins all)
    for (const trick of entry.tricks) {
      expect(trick.leadSeat).toBe("N");
      expect(trick.leadColor).toBe("Black");
    }
  });
});
