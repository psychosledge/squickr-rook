import type { Seat } from "./types.js";
import { nextSeat } from "./types.js";

/**
 * Return the next bidder clockwise from `afterSeat`, skipping only "pass" seats.
 * Seats with null or number bids are still active.
 */
export function getNextBidder(
  bids: Record<Seat, number | "pass" | null>,
  afterSeat: Seat,
): Seat {
  let seat = nextSeat(afterSeat);
  for (let i = 0; i < 4; i++) {
    if (bids[seat] !== "pass") return seat;
    seat = nextSeat(seat);
  }
  // Fallback (shouldn't happen — always at least one non-pass seat while bidding)
  return seat;
}
