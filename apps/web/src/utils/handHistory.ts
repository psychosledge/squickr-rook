import type { HandScore, Seat, Team } from "@rook/engine";
import { SEAT_TEAM } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";

export type OutcomeBadge = "🌙 Set!" | "🌙 Moon!" | "Made it" | "Set!";

export type HandHistoryRow = {
  handNumber: number;
  bidderTeam: Team;
  bidderSeat: Seat;
  bidderLabel: string;
  bidAmount: number;
  bidMade: boolean;
  shotMoon: boolean;
  moonShooterWentSet: boolean;
  nsDelta: number;
  ewDelta: number;
  nsCumulative: number;
  ewCumulative: number;
  outcomeBadge: OutcomeBadge;
};

export function buildHandHistoryRows(
  history: HandScore[],
  startScores: Record<Team, number> = { NS: 0, EW: 0 },
): HandHistoryRow[] {
  if (history.length === 0) return [];

  let nsCumulative = startScores.NS;
  let ewCumulative = startScores.EW;

  return history.map((score, index) => {
    const bidderTeam: Team = SEAT_TEAM[score.bidder];
    const bidderSeat: Seat = score.bidder;
    const bidderLabel = getSeatLabel(bidderSeat);

    const { shotMoon, moonShooterWentSet, bidAmount, nsTotal, ewTotal, nsDelta, ewDelta } = score;

    const bidderPoints = bidderTeam === "NS" ? nsTotal : ewTotal;

    const bidMade = (shotMoon && !moonShooterWentSet) || bidderPoints >= bidAmount;

    const outcomeBadge: OutcomeBadge =
      shotMoon && moonShooterWentSet
        ? "🌙 Set!"
        : shotMoon && !moonShooterWentSet
          ? "🌙 Moon!"
          : bidMade
            ? "Made it"
            : "Set!";

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
      nsDelta,
      ewDelta,
      nsCumulative,
      ewCumulative,
      outcomeBadge,
    };
  });
}
