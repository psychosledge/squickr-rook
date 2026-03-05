import type { Seat } from "@rook/engine";

const CLOCKWISE: Seat[] = ["N", "E", "S", "W"];

/**
 * Derives the 4 positional display slots (bottom/top/left/right) from humanSeat.
 * bottom = humanSeat, top = opposite (partner), left = next CW, right = prev CW.
 */
export function deriveSlots(humanSeat: Seat): { bottom: Seat; top: Seat; left: Seat; right: Seat } {
  const idx = CLOCKWISE.indexOf(humanSeat);
  return {
    bottom: humanSeat,
    top: CLOCKWISE[(idx + 2) % 4] as Seat,
    left: CLOCKWISE[(idx + 1) % 4] as Seat,
    right: CLOCKWISE[(idx + 3) % 4] as Seat,
  };
}
