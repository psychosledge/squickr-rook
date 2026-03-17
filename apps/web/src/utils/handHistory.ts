import type { HandScore, Seat, Team } from "@rook/engine";
import { SEAT_TEAM } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";

export type HandHistoryRow = {
  handNumber: number;
  bidderTeam: Team;
  bidderSeat: Seat;
  bidderLabel: string;
  bidAmount: number;
  bidMade: boolean;
  shotMoon: boolean;
  moonShooterWentSet: boolean;
  moonOutcome: "set" | "made-positive" | "made-in-hole" | null;
  nsDelta: number;
  ewDelta: number;
  nsCumulative: number;
  ewCumulative: number;
};

export function buildHandHistoryRows(
  history: HandScore[],
  startScores: Record<Team, number> = { NS: 0, EW: 0 },
  seatNames?: Partial<Record<Seat, string>>,
): HandHistoryRow[] {
  if (history.length === 0) return [];

  let nsCumulative = startScores.NS;
  let ewCumulative = startScores.EW;

  return history.map((score, index) => {
    const bidderTeam: Team = SEAT_TEAM[score.bidder];
    const bidderSeat: Seat = score.bidder;
    const bidderLabel = seatNames?.[bidderSeat] ?? getSeatLabel(bidderSeat);

    const { shotMoon, moonShooterWentSet, bidAmount, nsTotal, ewTotal, nsDelta, ewDelta } = score;

    const bidderPoints = bidderTeam === "NS" ? nsTotal : ewTotal;

    const bidMade = (shotMoon && !moonShooterWentSet) || bidderPoints >= bidAmount;

    // Capture pre-hand cumulative scores BEFORE adding deltas
    const preHandNs = nsCumulative;
    const preHandEw = ewCumulative;

    // Compute moonOutcome using pre-hand bidder score
    let moonOutcome: HandHistoryRow["moonOutcome"] = null;
    if (shotMoon) {
      if (moonShooterWentSet) {
        moonOutcome = "set";
      } else {
        const preHandBidderScore = bidderTeam === "NS" ? preHandNs : preHandEw;
        moonOutcome = preHandBidderScore < 0 ? "made-in-hole" : "made-positive";
      }
    }

    nsCumulative += nsDelta;
    ewCumulative += ewDelta;

    return {
      handNumber: index + 1,
      bidderTeam,
      bidderSeat,
      bidderLabel,
      bidAmount,
      bidMade,
      shotMoon,
      moonShooterWentSet,
      moonOutcome,
      nsDelta,
      ewDelta,
      nsCumulative,
      ewCumulative,
    };
  });
}
