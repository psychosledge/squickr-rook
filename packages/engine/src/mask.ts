import type { GameState, Seat } from "./types.js";
import type { GameEvent } from "./events.js";

/** The placeholder CardId used for masked hand cards. */
export const MASKED_CARD = "??";

/**
 * Returns a copy of `state` with sensitive information hidden for `forSeat`:
 * - All opponent hands are replaced with `"??"` placeholders (length preserved).
 * - `nest` is always cleared to `[]`.
 * - `originalNest` is only visible to the bidder; everyone else gets `[]`.
 * - All other fields pass through unchanged.
 *
 * Does NOT mutate the input state.
 */
export function maskState(state: GameState, forSeat: Seat): GameState {
  const maskedHands = {
    N: forSeat === "N" ? state.hands.N : Array(state.hands.N.length).fill(MASKED_CARD) as string[],
    E: forSeat === "E" ? state.hands.E : Array(state.hands.E.length).fill(MASKED_CARD) as string[],
    S: forSeat === "S" ? state.hands.S : Array(state.hands.S.length).fill(MASKED_CARD) as string[],
    W: forSeat === "W" ? state.hands.W : Array(state.hands.W.length).fill(MASKED_CARD) as string[],
  };

  const visibleOriginalNest =
    state.bidder !== null && state.bidder === forSeat
      ? state.originalNest
      : [];

  return {
    ...state,
    hands: maskedHands,
    nest: [],
    originalNest: visibleOriginalNest,
  };
}

/**
 * Filters a `GameEvent` for a specific seat:
 * - `NestTaken`: only the bidder sees the real `nestCards`; everyone else gets `nestCards: []`.
 * - All other events: returned unchanged (same reference).
 *
 * Does NOT mutate the input event.
 */
export function filterEvent(
  event: GameEvent,
  forSeat: Seat,
  bidder: Seat | null,
): GameEvent {
  if (event.type === "NestTaken") {
    const canSeeNest = bidder !== null && forSeat === bidder;
    if (canSeeNest) {
      return event;
    }
    return { ...event, nestCards: [] };
  }
  return event;
}
