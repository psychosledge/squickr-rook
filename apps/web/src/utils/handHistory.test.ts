import { describe, it, expect } from "vitest";
import { buildHandHistoryRows } from "./handHistory";
import type { HandScore } from "@rook/engine";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeHandScore(overrides: Partial<HandScore> & Pick<HandScore, "hand" | "bidder" | "bidAmount" | "nsTotal" | "ewTotal" | "nsDelta" | "ewDelta">): HandScore {
  return {
    nestCards: [],
    discarded: [],
    nsPointCards: 0,
    ewPointCards: 0,
    nsMostCardsBonus: 0,
    ewMostCardsBonus: 0,
    nsNestBonus: 0,
    ewNestBonus: 0,
    nsWonLastTrick: false,
    ewWonLastTrick: false,
    shotMoon: false,
    moonShooterWentSet: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildHandHistoryRows", () => {
  it("returns [] for empty history", () => {
    expect(buildHandHistoryRows([])).toEqual([]);
  });

  it("single hand — NS bidder made it", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 130,
        ewTotal: 60,
        nsDelta: 120,
        ewDelta: 60,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.handNumber).toBe(1);
    expect(row.bidderTeam).toBe("NS");
    expect(row.bidderSeat).toBe("N");
    expect(row.bidAmount).toBe(120);
    expect(row.bidMade).toBe(true);
    expect(row.nsCumulative).toBe(120);
    expect(row.ewCumulative).toBe(60);
  });

  it("single hand — NS bidder set", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "S",
        bidAmount: 120,
        nsTotal: 80,
        ewTotal: 110,
        nsDelta: -120,
        ewDelta: 110,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.bidMade).toBe(false);
    expect(row.nsCumulative).toBe(-120);
    expect(row.ewCumulative).toBe(110);
  });

  it("multi-hand — cumulative scores accumulate correctly", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 130,
        ewTotal: 60,
        nsDelta: 120,
        ewDelta: 60,
      }),
      makeHandScore({
        hand: 2,
        bidder: "N",
        bidAmount: 130,
        nsTotal: 100,
        ewTotal: 90,
        nsDelta: -130,
        ewDelta: 90,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    expect(rows).toHaveLength(2);
    expect(rows[0].nsCumulative).toBe(120);
    expect(rows[0].ewCumulative).toBe(60);
    expect(rows[1].nsCumulative).toBe(-10);   // 120 + (-130)
    expect(rows[1].ewCumulative).toBe(150);   // 60 + 90
  });

  it("moon made — shotMoon true, bidMade true", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 200,
        ewTotal: 0,
        nsDelta: 200,
        ewDelta: 0,
        shotMoon: true,
        moonShooterWentSet: false,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    const row = rows[0];
    expect(row.shotMoon).toBe(true);
    expect(row.moonShooterWentSet).toBe(false);
    expect(row.bidMade).toBe(true);
  });

  it("moon set — shotMoon true, moonShooterWentSet true, bidMade false", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 0,
        ewTotal: 200,
        nsDelta: -120,
        ewDelta: 200,
        shotMoon: true,
        moonShooterWentSet: true,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    const row = rows[0];
    expect(row.shotMoon).toBe(true);
    expect(row.moonShooterWentSet).toBe(true);
    expect(row.bidMade).toBe(false);
  });

  it("bidderLabel for seat N is 'P1', for seat E is 'P2'", () => {
    const historyN: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 80, nsDelta: 100, ewDelta: 80 }),
    ];
    const historyE: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "E", bidAmount: 100, ewTotal: 110, nsTotal: 80, ewDelta: 100, nsDelta: 80 }),
    ];

    expect(buildHandHistoryRows(historyN)[0].bidderLabel).toBe("P1");
    expect(buildHandHistoryRows(historyE)[0].bidderLabel).toBe("P2");
  });

  it("EW bidder team correctly identified for seat E and W", () => {
    const historyE: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "E", bidAmount: 100, ewTotal: 110, nsTotal: 80, ewDelta: 100, nsDelta: 80 }),
    ];
    const historyW: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "W", bidAmount: 100, ewTotal: 110, nsTotal: 80, ewDelta: 100, nsDelta: 80 }),
    ];

    expect(buildHandHistoryRows(historyE)[0].bidderTeam).toBe("EW");
    expect(buildHandHistoryRows(historyW)[0].bidderTeam).toBe("EW");
  });

  it("startScores offset is applied to cumulative totals", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 80, nsDelta: 100, ewDelta: 80 }),
    ];

    const rows = buildHandHistoryRows(history, { NS: 50, EW: 75 });

    expect(rows[0].nsCumulative).toBe(150); // 50 + 100
    expect(rows[0].ewCumulative).toBe(155); // 75 + 80
  });

  it("exact bid boundary — bidderPoints === bidAmount → bidMade true", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 120,
        ewTotal: 70,
        nsDelta: 120,
        ewDelta: 70,
      }),
    ];

    const rows = buildHandHistoryRows(history);

    const row = rows[0];
    expect(row.bidMade).toBe(true);
  });

  it("startScores offset applied once — two hands do not re-add offset each iteration", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 60, nsDelta: 10, ewDelta: -5 }),
      makeHandScore({ hand: 2, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 60, nsDelta: 10, ewDelta: -5 }),
    ];

    const rows = buildHandHistoryRows(history, { NS: 50, EW: 30 });

    expect(rows[0].nsCumulative).toBe(60);  // 50 + 10
    expect(rows[1].nsCumulative).toBe(70);  // 50 + 10 + 10 (not 120)
  });

  it("handNumber sequence — two hands have handNumber 1 and 2", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 80, nsDelta: 100, ewDelta: 80 }),
      makeHandScore({ hand: 2, bidder: "E", bidAmount: 110, ewTotal: 120, nsTotal: 70, ewDelta: 110, nsDelta: 70 }),
    ];

    const rows = buildHandHistoryRows(history);

    expect(rows[0].handNumber).toBe(1);
    expect(rows[1].handNumber).toBe(2);
  });

  // ── moonOutcome tests ──────────────────────────────────────────────────────

  it("moonOutcome is null for a non-moon hand", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 130,
        ewTotal: 60,
        nsDelta: 120,
        ewDelta: 60,
        shotMoon: false,
      }),
    ];

    const rows = buildHandHistoryRows(history);
    expect(rows[0].moonOutcome).toBeNull();
  });

  it("moonOutcome is 'set' when shotMoon=true and moonShooterWentSet=true", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 0,
        ewTotal: 200,
        nsDelta: -120,
        ewDelta: 200,
        shotMoon: true,
        moonShooterWentSet: true,
      }),
    ];

    const rows = buildHandHistoryRows(history);
    expect(rows[0].moonOutcome).toBe("set");
  });

  it("moonOutcome is 'made-positive' when moon made and bidder pre-hand score >= 0", () => {
    // Start with NS at 50 (>=0), NS bids and makes moon
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 200,
        ewTotal: 0,
        nsDelta: 200,
        ewDelta: 0,
        shotMoon: true,
        moonShooterWentSet: false,
      }),
    ];

    // startScores NS=50 means pre-hand score is 50 (>=0) → made-positive
    const rows = buildHandHistoryRows(history, { NS: 50, EW: 100 });
    expect(rows[0].moonOutcome).toBe("made-positive");
  });

  it("moonOutcome is 'made-in-hole' when moon made and bidder pre-hand score < 0", () => {
    // NS bidder, pre-hand score is -50 (NS starts at -50)
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 200,
        ewTotal: 0,
        nsDelta: 45,
        ewDelta: 0,
        shotMoon: true,
        moonShooterWentSet: false,
      }),
    ];

    // startScores NS=-50 → pre-hand score is -50 (<0) → made-in-hole
    const rows = buildHandHistoryRows(history, { NS: -50, EW: 100 });
    expect(rows[0].moonOutcome).toBe("made-in-hole");
  });

  it("moonOutcome is 'made-positive' when moon made and bidder pre-hand score is exactly 0", () => {
    const history: HandScore[] = [
      makeHandScore({
        hand: 1,
        bidder: "N",
        bidAmount: 120,
        nsTotal: 200,
        ewTotal: 0,
        nsDelta: 200,
        ewDelta: 0,
        shotMoon: true,
        moonShooterWentSet: false,
      }),
    ];
    // startScores NS=0 → pre-hand = 0 → not < 0 → "made-positive"
    const rows = buildHandHistoryRows(history, { NS: 0, EW: 0 });
    expect(rows[0].moonOutcome).toBe("made-positive");
  });

  // ── seatNames parameter ────────────────────────────────────────────────────

  it("bidderLabel uses seatNames display name when provided for the bidder seat", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 80, nsDelta: 100, ewDelta: 80 }),
    ];

    const rows = buildHandHistoryRows(history, undefined, { N: "Alice" });

    expect(rows[0].bidderLabel).toBe("Alice");
  });

  it("bidderLabel falls back to getSeatLabel when seatNames does not include bidder seat", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "N", bidAmount: 100, nsTotal: 110, ewTotal: 80, nsDelta: 100, ewDelta: 80 }),
    ];

    // seatNames has E but not N
    const rows = buildHandHistoryRows(history, undefined, { E: "Bob" });

    expect(rows[0].bidderLabel).toBe("P1"); // getSeatLabel("N") === "P1"
  });

  it("bidderLabel falls back to getSeatLabel when seatNames is undefined", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "E", bidAmount: 100, ewTotal: 110, nsTotal: 80, ewDelta: 100, nsDelta: 80 }),
    ];

    const rows = buildHandHistoryRows(history, undefined, undefined);

    expect(rows[0].bidderLabel).toBe("P2"); // getSeatLabel("E") === "P2"
  });

  it("bidderLabel uses seatNames for seat E when provided", () => {
    const history: HandScore[] = [
      makeHandScore({ hand: 1, bidder: "E", bidAmount: 100, ewTotal: 110, nsTotal: 80, ewDelta: 100, nsDelta: 80 }),
    ];

    const rows = buildHandHistoryRows(history, undefined, { E: "Charlie" });

    expect(rows[0].bidderLabel).toBe("Charlie");
  });
});
