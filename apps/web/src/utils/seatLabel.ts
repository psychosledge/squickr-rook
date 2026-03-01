import type { Seat, Team } from "@rook/engine";

export function getSeatLabel(seat: Seat): string {
  const labels: Record<Seat, string> = {
    N: "You",
    E: "P2",
    S: "P3",
    W: "P4",
  };
  return labels[seat];
}

export function getTeamLabel(team: Team): string {
  const labels: Record<Team, string> = {
    NS: "P1 & P3",
    EW: "P2 & P4",
  };
  return labels[team];
}
