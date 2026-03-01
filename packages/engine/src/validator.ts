import type { GameCommand } from "./commands.js";
import { compareTrickCards, cardFromId } from "./deck.js";
import type { GameEvent, TrickCompleted, HandScored, GameFinished, HandStarted } from "./events.js";
import { applyEvent } from "./reducer.js";
import { scoreHand, checkWinCondition } from "./scoring.js";
import type { CardId, Color, GameRules, GameState, Seat, Team } from "./types.js";
import { SEAT_TEAM, leftOf, nextSeat } from "./types.js";

const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Validate a command against the current game state.
 * Returns events to apply if valid, or an error string if invalid.
 */
export function validateCommand(
  state: GameState,
  command: GameCommand,
  rules: GameRules,
): { ok: true; events: GameEvent[] } | { ok: false; error: string } {
  const now = Date.now();

  switch (command.type) {
    case "TakeNest": {
      if (state.phase !== "nest") {
        return { ok: false, error: `Cannot TakeNest in phase: ${state.phase}` };
      }
      const expectedSeat = leftOf(state.dealer);
      if (command.seat !== expectedSeat) {
        return { ok: false, error: `TakeNest: wrong seat ${command.seat}, expected ${expectedSeat}` };
      }
      if (state.nest.length === 0) {
        return { ok: false, error: "TakeNest: nest already taken" };
      }
      const event: GameEvent = {
        type: "NestTaken",
        seat: command.seat,
        nestCards: [...state.nest],
        handNumber: state.handNumber,
        timestamp: now,
      };
      return { ok: true, events: [event] };
    }

    case "DiscardCard": {
      if (state.phase !== "nest") {
        return { ok: false, error: `Cannot DiscardCard in phase: ${state.phase}` };
      }
      const expectedSeat = leftOf(state.dealer);
      if (command.seat !== expectedSeat) {
        return { ok: false, error: `DiscardCard: wrong seat ${command.seat}` };
      }
      if (state.nest.length !== 0) {
        return { ok: false, error: "DiscardCard: must TakeNest first" };
      }
      if (state.discarded.length >= 5) {
        return { ok: false, error: "DiscardCard: already discarded 5 cards" };
      }
      if (command.cardId === "ROOK") {
        return { ok: false, error: "DiscardCard: cannot discard the Rook Bird" };
      }
      const hand = state.hands[command.seat] ?? [];
      if (!hand.includes(command.cardId)) {
        return { ok: false, error: `DiscardCard: card ${command.cardId} not in hand` };
      }
      const event: GameEvent = {
        type: "CardDiscarded",
        seat: command.seat,
        cardId: command.cardId,
        handNumber: state.handNumber,
        timestamp: now,
      };
      return { ok: true, events: [event] };
    }

    case "SelectTrump": {
      if (state.phase !== "trump") {
        return { ok: false, error: `Cannot SelectTrump in phase: ${state.phase}` };
      }
      const expectedSeat = leftOf(state.dealer);
      if (command.seat !== expectedSeat) {
        return { ok: false, error: `SelectTrump: wrong seat ${command.seat}` };
      }
      if (!COLORS.includes(command.color)) {
        return { ok: false, error: `SelectTrump: invalid color ${command.color}` };
      }
      const event: GameEvent = {
        type: "TrumpSelected",
        seat: command.seat,
        color: command.color,
        handNumber: state.handNumber,
        timestamp: now,
      };
      return { ok: true, events: [event] };
    }

    case "PlayCard": {
      if (state.phase !== "playing") {
        return { ok: false, error: `Cannot PlayCard in phase: ${state.phase}` };
      }
      if (state.activePlayer !== command.seat) {
        return {
          ok: false,
          error: `PlayCard: not your turn (active: ${state.activePlayer}, you: ${command.seat})`,
        };
      }
      const hand = state.hands[command.seat] ?? [];
      if (!hand.includes(command.cardId)) {
        return { ok: false, error: `PlayCard: card ${command.cardId} not in hand` };
      }

      // Must-follow rule
      const mustFollowError = checkMustFollow(state, command.seat, command.cardId);
      if (mustFollowError !== null) {
        return { ok: false, error: mustFollowError };
      }

      const events: GameEvent[] = [];

      const cardPlayedEvent: GameEvent = {
        type: "CardPlayed",
        seat: command.seat,
        cardId: command.cardId,
        trickIndex: state.tricksPlayed,
        handNumber: state.handNumber,
        timestamp: now,
      };
      events.push(cardPlayedEvent);

      // Check if this completes a trick (4th card)
      const newTrick = [...state.currentTrick, { seat: command.seat, cardId: command.cardId }];
      if (newTrick.length === 4) {
        // Determine the trick winner
        const leadPlay = newTrick[0]!;
        const leadCard = cardFromId(leadPlay.cardId);
        const leadColor: Color | null =
          leadCard.kind === "regular" ? leadCard.color : null;

        // Find winner: card that beats all others
        let winnerPlay = leadPlay;
        for (let i = 1; i < newTrick.length; i++) {
          const play = newTrick[i]!;
          const comparison = compareTrickCards(
            play.cardId,
            winnerPlay.cardId,
            leadColor,
            state.trump,
          );
          if (comparison > 0) {
            winnerPlay = play;
          }
        }

        const trickCompletedEvent: TrickCompleted = {
          type: "TrickCompleted",
          plays: newTrick,
          winner: winnerPlay.seat,
          leadColor,
          trickIndex: state.tricksPlayed,
          handNumber: state.handNumber,
          timestamp: now,
        };
        events.push(trickCompletedEvent);

        // Check if this is the last trick (10th)
        const newTricksPlayed = state.tricksPlayed + 1;
        if (newTricksPlayed === 10) {
          // Compute the state as it would be after all card/trick events
          const stateAfterCardPlayed = applyEvent(state, {
            type: "CardPlayed",
            seat: command.seat,
            cardId: command.cardId,
            trickIndex: state.tricksPlayed,
            handNumber: state.handNumber,
            timestamp: now,
          });
          const stateAfterTrick = applyEvent(stateAfterCardPlayed, {
            type: "TrickCompleted",
            plays: newTrick,
            winner: winnerPlay.seat,
            leadColor,
            trickIndex: state.tricksPlayed,
            handNumber: state.handNumber,
            timestamp: now,
          });

          // Score the hand
          const bidder = leftOf(stateAfterTrick.dealer);
          const bidAmount = rules.autoBidAmount;

          const handScore = scoreHand({
            completedTricks: stateAfterTrick.completedTricks,
            discarded: stateAfterTrick.discarded,
            nestCards: stateAfterTrick.originalNest,
            bidder,
            bidAmount,
            hand: state.handNumber,
            rules,
          });

          const handScoredEvent: HandScored = {
            type: "HandScored",
            score: handScore,
            handNumber: state.handNumber,
            timestamp: now,
          };
          events.push(handScoredEvent);

          // Compute new scores after this hand
          const newScores: Record<Team, number> = {
            NS: stateAfterTrick.scores.NS + handScore.nsDelta,
            EW: stateAfterTrick.scores.EW + handScore.ewDelta,
          };

          const bidderTeam: Team = SEAT_TEAM[bidder];
          const winCondition = checkWinCondition(newScores, bidderTeam, rules);

          if (winCondition !== null) {
            const gameFinishedEvent: GameFinished = {
              type: "GameFinished",
              winner: winCondition.winner,
              reason: winCondition.reason,
              finalScores: newScores,
              timestamp: now,
            };
            events.push(gameFinishedEvent);
          } else {
            // Start next hand
            const nextHandStarted: HandStarted = {
              type: "HandStarted",
              handNumber: state.handNumber + 1,
              dealer: nextSeat(state.dealer),
              timestamp: now,
            };
            events.push(nextHandStarted);
          }
        }
      }

      return { ok: true, events };
    }

    default: {
      const _exhaustive: never = command;
      return { ok: false, error: "Unknown command" };
    }
  }
}

/**
 * Check must-follow rule.
 * Returns an error string if the card violates must-follow, or null if OK.
 */
function checkMustFollow(
  state: GameState,
  seat: Seat,
  cardId: CardId,
): string | null {
  // If no cards played yet in trick, anything goes
  if (state.currentTrick.length === 0) return null;

  const leadPlay = state.currentTrick[0]!;
  const leadCard = cardFromId(leadPlay.cardId);

  // If lead was ROOK (leadColor = null), any card is legal
  if (leadCard.kind === "rook") return null;

  // Rook Bird can always be played
  if (cardId === "ROOK") return null;

  const leadColor = leadCard.color;
  const hand = state.hands[seat] ?? [];

  // Check if player has any card of lead color (excluding ROOK)
  const hasLeadColor = hand.some((c) => {
    if (c === "ROOK") return false;
    const card = cardFromId(c);
    return card.kind === "regular" && card.color === leadColor;
  });

  if (!hasLeadColor) return null; // Can play anything

  // Player has lead color — must follow suit
  const playedCard = cardFromId(cardId);
  if (playedCard.kind === "regular" && playedCard.color === leadColor) {
    return null; // Following suit correctly
  }

  // Check if played card is trump — trump can be played even when you have lead color? 
  // Actually per standard Rook rules: must follow lead suit. Trump can ONLY be played if you 
  // don't have lead color. But Rook Bird is always legal.
  // The spec says "If you have a card of the lead color, you must follow suit"
  // So playing trump when you have lead color is NOT legal (unless it's the ROOK Bird).
  return `Must follow suit: have ${leadColor} cards, played ${cardId}`;
}

/**
 * Return all legal commands for a given seat in the current state.
 */
export function legalCommands(state: GameState, seat: Seat): GameCommand[] {
  const commands: GameCommand[] = [];

  switch (state.phase) {
    case "nest": {
      const expectedSeat = leftOf(state.dealer);
      if (seat !== expectedSeat) return [];

      if (state.nest.length > 0) {
        // Can take nest
        commands.push({ type: "TakeNest", seat });
      } else if (state.discarded.length < 5) {
        // Need to discard — enumerate non-ROOK cards in hand
        const hand = state.hands[seat] ?? [];
        for (const cardId of hand) {
          if (cardId !== "ROOK") {
            commands.push({ type: "DiscardCard", seat, cardId });
          }
        }
      }
      break;
    }

    case "trump": {
      const expectedSeat = leftOf(state.dealer);
      if (seat !== expectedSeat) return [];
      for (const color of COLORS) {
        commands.push({ type: "SelectTrump", seat, color });
      }
      break;
    }

    case "playing": {
      if (state.activePlayer !== seat) return [];
      const hand = state.hands[seat] ?? [];
      const legalCards = getLegalCards(state, seat, hand);
      for (const cardId of legalCards) {
        commands.push({ type: "PlayCard", seat, cardId });
      }
      break;
    }

    default:
      break;
  }

  return commands;
}

/**
 * Get the legal cards a player can play given the current trick.
 */
function getLegalCards(state: GameState, seat: Seat, hand: CardId[]): CardId[] {
  if (state.currentTrick.length === 0) {
    // Leading — any card is legal
    return [...hand];
  }

  const leadPlay = state.currentTrick[0]!;
  const leadCard = cardFromId(leadPlay.cardId);

  // If Rook was led, any card is legal
  if (leadCard.kind === "rook") return [...hand];

  const leadColor = leadCard.color;

  // Check if player has lead color (non-ROOK)
  const leadColorCards = hand.filter((c) => {
    if (c === "ROOK") return false;
    const card = cardFromId(c);
    return card.kind === "regular" && card.color === leadColor;
  });

  if (leadColorCards.length > 0) {
    // Must follow suit — but ROOK can always be played
    const rookInHand = hand.includes("ROOK");
    if (rookInHand) {
      return [...leadColorCards, "ROOK"];
    }
    return leadColorCards;
  }

  // No lead color — any card is legal
  return [...hand];
}
