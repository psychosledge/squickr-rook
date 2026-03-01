import type { Seat } from "@rook/engine";

export function getSeatLabel(seat: Seat): string {
  const labels: Record<Seat, string> = {
    N: "You",
    E: "East",
    S: "South",
    W: "West",
  };
  return labels[seat];
}
