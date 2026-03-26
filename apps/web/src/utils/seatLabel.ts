import type { Seat, Team } from "@rook/engine";

export function getSeatLabel(seat: Seat): string {
  const labels: Record<Seat, string> = {
    N: "P1",
    E: "P2",
    S: "P3",
    W: "P4",
  };
  return labels[seat];
}

export function getLobbyLabel(seat: Seat): string {
  const labels: Record<Seat, string> = {
    N: "P1",
    S: "P2",
    E: "P3",
    W: "P4",
  };
  return labels[seat];
}

export function getTeamLabel(team: Team): string {
  const labels: Record<Team, string> = {
    NS: "P1 & P2",
    EW: "P3 & P4",
  };
  return labels[team];
}

export function teamDisplay(
  team: Team,
  seatNames?: Partial<Record<Seat, string>>,
): string {
  if (!seatNames) return getTeamLabel(team);
  const [s1, s2]: Seat[] = team === "NS" ? ["N", "S"] : ["E", "W"];
  const n1 = seatNames[s1] ?? getSeatLabel(s1);
  const n2 = seatNames[s2] ?? getSeatLabel(s2);
  return `${n1} & ${n2}`;
}
