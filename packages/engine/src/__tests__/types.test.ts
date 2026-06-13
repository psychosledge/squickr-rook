import { describe, it, expectTypeOf } from "vitest";
import type {
  BidEntry,
  TrickPlay,
  TrickSnapshot,
  GameRecord,
  Seat,
  CardId,
  Color,
  Team,
  HandScore,
} from "../types.js";

describe("TrickPlay", () => {
  it("accepts a valid TrickPlay object", () => {
    const play: TrickPlay = {
      seat: "N" satisfies Seat,
      cardId: "Red-10" satisfies CardId,
      handAtTrickStart: ["Red-10", "Black-5"],
    };
    expectTypeOf(play).toMatchTypeOf<TrickPlay>();
  });
});

describe("TrickSnapshot", () => {
  it("accepts a valid TrickSnapshot object", () => {
    const play: TrickPlay = {
      seat: "S",
      cardId: "Green-7",
      handAtTrickStart: ["Green-7", "Yellow-9"],
    };
    const snapshot: TrickSnapshot = {
      trickNumber: 1,
      leadSeat: "S" satisfies Seat,
      trump: "Green" satisfies Color,
      handsAtTrickStart: {
        N: ["Black-14"],
        E: ["Red-5"],
        S: ["Green-7", "Yellow-9"],
        W: ["Yellow-1"],
      } satisfies Record<Seat, CardId[]>,
      plays: [play],
      winner: "E" satisfies Seat,
      pointsInTrick: 10,
      cumulativeScore: { NS: 20, EW: 10 } satisfies Record<Team, number>,
    };
    expectTypeOf(snapshot).toMatchTypeOf<TrickSnapshot>();
  });
});

describe("BidEntry", () => {
  it("accepts a numeric bid", () => {
    const e: BidEntry = { seat: "N", bid: 110 };
    expectTypeOf(e).toMatchTypeOf<BidEntry>();
  });
  it("accepts a pass", () => {
    const e: BidEntry = { seat: "E", bid: "pass" };
    expectTypeOf(e).toMatchTypeOf<BidEntry>();
  });
});

describe("GameRecord", () => {
  it("accepts a valid GameRecord object", () => {
    const outcome: HandScore = {
      hand: 1,
      bidder: "N",
      bidAmount: 100,
      nestCards: ["Black-1"],
      discarded: ["Red-5"],
      nsPointCards: 60,
      ewPointCards: 40,
      nsMostCardsBonus: 0,
      ewMostCardsBonus: 0,
      nsNestBonus: 0,
      ewNestBonus: 0,
      nsWonLastTrick: true,
      ewWonLastTrick: false,
      nsTotal: 60,
      ewTotal: 40,
      nsDelta: 100,
      ewDelta: -100,
      shotMoon: false,
      moonShooterWentSet: false,
    };
    const record: GameRecord = {
      gameId: "game-0042",
      dealSeed: 12345,
      handNumber: 3,
      bidHistory: [
        { seat: "N", bid: 100 },
        { seat: "E", bid: "pass" },
        { seat: "S", bid: "pass" },
        { seat: "W", bid: "pass" },
      ],
      transcript: [],
      outcome,
    };
    expectTypeOf(record).toMatchTypeOf<GameRecord>();
  });
});
