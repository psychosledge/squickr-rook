import { describe, it, expect } from "vitest";
import { pointValue, scoreHand, checkWinCondition } from "../scoring.js";
import { CARD_POINTS, buildDeck } from "../deck.js";
import type { CompletedTrick, GameRules, Seat } from "../types.js";
import { DEFAULT_RULES } from "../types.js";

describe("pointValue", () => {
  it("B1 = 15", () => expect(pointValue("B1")).toBe(15));
  it("R5 = 5",  () => expect(pointValue("R5")).toBe(5));
  it("G10 = 10", () => expect(pointValue("G10")).toBe(10));
  it("Y14 = 10", () => expect(pointValue("Y14")).toBe(10));
  it("ROOK = 20", () => expect(pointValue("ROOK")).toBe(20));
  it("B6 = 0",  () => expect(pointValue("B6")).toBe(0));
  it("B7 = 0",  () => expect(pointValue("B7")).toBe(0));
  it("B8 = 0",  () => expect(pointValue("B8")).toBe(0));
  it("B9 = 0",  () => expect(pointValue("B9")).toBe(0));
  it("B11 = 0", () => expect(pointValue("B11")).toBe(0));
  it("B12 = 0", () => expect(pointValue("B12")).toBe(0));
  it("B13 = 0", () => expect(pointValue("B13")).toBe(0));
  it("R1 = 15", () => expect(pointValue("R1")).toBe(15));
  it("G14 = 10", () => expect(pointValue("G14")).toBe(10));

  it("total point cards (all 1s, 5s, 10s, 14s, ROOK) = 180", () => {
    const deck = buildDeck();
    const total = deck.reduce((sum, id) => sum + pointValue(id), 0);
    // 4×15=60 + 4×5=20 + 4×10=40 + 4×10=40 + 20(ROOK) = 180
    expect(total).toBe(180);
  });
});

// ── Helper to build completed tricks ─────────────────────────────────────────

function makeTrick(winner: Seat, plays: Array<[Seat, string]>): CompletedTrick {
  return {
    winner,
    plays: plays.map(([seat, cardId]) => ({ seat, cardId })),
    leadColor: null,
  };
}

describe("scoreHand", () => {
  const rules = DEFAULT_RULES;

  it("bidder wins: both teams score their actual points", () => {
    // NS scores 110, EW scores 70. Bidder is N (NS team), bid=100.
    // NS > 100 so they make bid. NS gets 110, EW gets 70.
    const tricks: CompletedTrick[] = [
      // Give NS 110 points: four 1s (60) + four 10s (40) + one 5 (5) + Rook (20)? 
      // Let's use: B1(15), R1(15), G1(15), Y1(15) = 60 NS, B10(10), R10(10) = 20 NS, total=80 NS
      // Then add B5, R5, G5 to EW = 15 EW, Y10(10), G10(10), B14(10), R14(10), G14(10), Y14(10) = 60 EW
      // Keep it simple:
      makeTrick("N", [["N", "B1"], ["E", "B6"], ["S", "B7"], ["W", "B8"]]),     // NS: 15
      makeTrick("N", [["N", "R1"], ["E", "R6"], ["S", "R7"], ["W", "R8"]]),     // NS: 15
      makeTrick("N", [["N", "G1"], ["E", "G6"], ["S", "G7"], ["W", "G8"]]),     // NS: 15
      makeTrick("N", [["N", "Y1"], ["E", "Y6"], ["S", "Y7"], ["W", "Y8"]]),     // NS: 15
      makeTrick("N", [["N", "B10"], ["E", "B9"], ["S", "B11"], ["W", "B12"]]),  // NS: 10
      makeTrick("N", [["N", "R10"], ["E", "R9"], ["S", "R11"], ["W", "R12"]]),  // NS: 10
      makeTrick("N", [["N", "G10"], ["E", "G9"], ["S", "G11"], ["W", "G12"]]),  // NS: 10
      makeTrick("N", [["N", "Y10"], ["E", "Y9"], ["S", "Y11"], ["W", "Y12"]]),  // NS: 10
      makeTrick("E", [["E", "B5"], ["N", "B13"], ["S", "R13"], ["W", "G13"]]),  // EW: 5
      makeTrick("E", [["E", "R5"], ["N", "B14"], ["S", "R14"], ["W", "G5"]]),   // EW: 5+10+10+5=30
    ];

    // NS total from tricks: 15+15+15+15+10+10+10+10 = 100
    // EW total from tricks: 5 + 5+10+10+5 = 35
    // Last trick won by E (EW). Discarded = []. Nest = 0 bonus.
    // NS captured: 8 tricks × 4 = 32 cards. EW: 2 × 4 = 8 cards. NS has >22 → +20 NS.
    // NS total = 100 + 20 = 120 (with most-cards bonus)
    // EW total = 35
    // Bidder = N (NS), bid=100. NS made bid (120 >= 100). Both score.

    const score = scoreHand({
      completedTricks: tricks,
      discarded: [],
      nestCards: [],
      bidder: "N",
      bidAmount: 100,
      hand: 0,
      rules,
    });

    expect(score.nsTotal).toBeGreaterThanOrEqual(100); // NS made it
    expect(score.nsDelta).toBe(score.nsTotal); // Scored their points
    expect(score.ewDelta).toBe(score.ewTotal); // EW also scores
  });

  it("bidder loses: bidder team loses 100, opponent scores normally", () => {
    // EW team is bidder (seat E, NS team is opponent)
    // NS scores 130, EW scores 50 → EW fails bid of 100
    const tricks: CompletedTrick[] = [
      makeTrick("N", [["N", "B1"], ["E", "B6"], ["S", "B7"], ["W", "B8"]]),
      makeTrick("N", [["N", "R1"], ["E", "R6"], ["S", "R7"], ["W", "R8"]]),
      makeTrick("N", [["N", "G1"], ["E", "G6"], ["S", "G7"], ["W", "G8"]]),
      makeTrick("N", [["N", "Y1"], ["E", "Y6"], ["S", "Y7"], ["W", "Y8"]]),
      makeTrick("N", [["N", "B10"], ["E", "B9"], ["S", "B11"], ["W", "B12"]]),
      makeTrick("N", [["N", "R10"], ["E", "R9"], ["S", "R11"], ["W", "R12"]]),
      makeTrick("N", [["N", "G10"], ["E", "G9"], ["S", "G11"], ["W", "G12"]]),
      makeTrick("N", [["N", "Y10"], ["E", "Y9"], ["S", "Y11"], ["W", "Y12"]]),
      makeTrick("N", [["N", "B13"], ["E", "B5"], ["S", "R13"], ["W", "G13"]]),
      makeTrick("N", [["N", "B14"], ["E", "R5"], ["S", "R14"], ["W", "G14"]]),
    ];
    // NS has all 40 cards. EW has 0.
    // NS total = 15+15+15+15+10+10+10+10+10+10 = 120, plus most-cards bonus = +20 → 140
    // EW total = 0
    // Bidder = E (EW team), bid=100. EW scored 0 < 100 → EW loses 100.

    const score = scoreHand({
      completedTricks: tricks,
      discarded: [],
      nestCards: [],
      bidder: "E",
      bidAmount: 100,
      hand: 0,
      rules,
    });

    expect(score.ewTotal).toBeLessThan(100);
    expect(score.ewDelta).toBe(-100);
    expect(score.nsDelta).toBe(score.nsTotal); // NS (opponent) scores normally
  });

  it("last trick winner gets discarded nest point cards", () => {
    // Simple: 10 tricks, last trick won by E (EW). Discarded has B1 (15 pts).
    const tricks: CompletedTrick[] = [];
    for (let i = 0; i < 9; i++) {
      tricks.push(makeTrick("N", [
        ["N", `B${6 + i}`], ["E", "R6"], ["S", "G6"], ["W", "Y6"],
      ] as Array<[Seat, string]>));
    }
    // But we need unique cards — let's just use simpler approach with R-cards
    const simpleTricks: CompletedTrick[] = [
      makeTrick("N", [["N", "B6"], ["E", "R6"], ["S", "G6"], ["W", "Y6"]]),
      makeTrick("N", [["N", "B7"], ["E", "R7"], ["S", "G7"], ["W", "Y7"]]),
      makeTrick("N", [["N", "B8"], ["E", "R8"], ["S", "G8"], ["W", "Y8"]]),
      makeTrick("N", [["N", "B9"], ["E", "R9"], ["S", "G9"], ["W", "Y9"]]),
      makeTrick("N", [["N", "B11"], ["E", "R11"], ["S", "G11"], ["W", "Y11"]]),
      makeTrick("N", [["N", "B12"], ["E", "R12"], ["S", "G12"], ["W", "Y12"]]),
      makeTrick("N", [["N", "B13"], ["E", "R13"], ["S", "G13"], ["W", "Y13"]]),
      makeTrick("N", [["N", "B1"],  ["E", "R1"],  ["S", "G1"],  ["W", "Y1"]]),
      makeTrick("N", [["N", "B10"], ["E", "R10"], ["S", "G10"], ["W", "Y10"]]),
      // Last trick won by EW
      makeTrick("E", [["E", "B14"], ["N", "R14"], ["S", "G14"], ["W", "Y14"]]),
    ];

    const discarded = ["B5"]; // 5 pts

    const score = scoreHand({
      completedTricks: simpleTricks,
      discarded,
      nestCards: [],
      bidder: "N",
      bidAmount: 100,
      hand: 0,
      rules,
    });

    expect(score.ewNestBonus).toBe(5); // EW won last trick, gets discarded B5
    expect(score.nsNestBonus).toBe(0);
    expect(score.ewWonLastTrick).toBe(true);
  });

  it("most-cards bonus awarded to team with >22 cards", () => {
    // NS wins 8 tricks (32 cards), EW wins 2 tricks (8 + discarded 5 = 13 with nest)
    // NS has 32 cards > 22 → gets +20
    const tricks: CompletedTrick[] = [
      makeTrick("N", [["N", "B6"], ["E", "R6"], ["S", "G6"], ["W", "Y6"]]),
      makeTrick("N", [["N", "B7"], ["E", "R7"], ["S", "G7"], ["W", "Y7"]]),
      makeTrick("N", [["N", "B8"], ["E", "R8"], ["S", "G8"], ["W", "Y8"]]),
      makeTrick("N", [["N", "B9"], ["E", "R9"], ["S", "G9"], ["W", "Y9"]]),
      makeTrick("N", [["N", "B11"], ["E", "R11"], ["S", "G11"], ["W", "Y11"]]),
      makeTrick("N", [["N", "B12"], ["E", "R12"], ["S", "G12"], ["W", "Y12"]]),
      makeTrick("N", [["N", "B13"], ["E", "R13"], ["S", "G13"], ["W", "Y13"]]),
      makeTrick("N", [["N", "B1"],  ["E", "R1"],  ["S", "G1"],  ["W", "Y1"]]),
      makeTrick("E", [["E", "B10"], ["N", "R10"], ["S", "G10"], ["W", "Y10"]]),
      makeTrick("E", [["E", "B14"], ["N", "R14"], ["S", "G14"], ["W", "Y14"]]),
    ];

    const score = scoreHand({
      completedTricks: tricks,
      discarded: [],
      nestCards: [],
      bidder: "N",
      bidAmount: 100,
      hand: 0,
      rules,
    });

    expect(score.nsMostCardsBonus).toBe(20);
    expect(score.ewMostCardsBonus).toBe(0);
  });
});

describe("checkWinCondition", () => {
  const rules = DEFAULT_RULES;

  it("returns null when neither team at threshold", () => {
    const result = checkWinCondition({ NS: 200, EW: 300 }, "NS", rules);
    expect(result).toBeNull();
  });

  it("NS wins when NS reaches 500", () => {
    const result = checkWinCondition({ NS: 500, EW: 200 }, "NS", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("NS");
    expect(result!.reason).toBe("threshold-reached");
  });

  it("EW wins when EW reaches 500", () => {
    const result = checkWinCondition({ NS: 200, EW: 500 }, "EW", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("EW");
    expect(result!.reason).toBe("threshold-reached");
  });

  it("bidder wins when both teams reach 500", () => {
    const result = checkWinCondition({ NS: 510, EW: 500 }, "EW", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("EW"); // bidderTeam
    expect(result!.reason).toBe("threshold-reached");
  });

  it("EW wins when NS busts below -500", () => {
    const result = checkWinCondition({ NS: -600, EW: 200 }, "NS", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("EW");
    expect(result!.reason).toBe("bust");
  });

  it("NS wins when EW busts below -500", () => {
    const result = checkWinCondition({ NS: 200, EW: -600 }, "NS", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("NS");
    expect(result!.reason).toBe("bust");
  });

  it("exactly at -500 is NOT busted (must be strictly less than)", () => {
    const result = checkWinCondition({ NS: -500, EW: 200 }, "NS", rules);
    expect(result).toBeNull();
  });

  it("exactly at 500 wins (threshold reached)", () => {
    const result = checkWinCondition({ NS: 500, EW: 200 }, "NS", rules);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("NS");
  });
});
