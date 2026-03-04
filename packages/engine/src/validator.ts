import type { GameCommand } from "./commands.js";
import { compareTrickCards, cardFromId } from "./deck.js";
import type { GameEvent, TrickCompleted, HandScored, GameFinished, HandStarted } from "./events.js";
import { applyEvent } from "./reducer.js";
import { scoreHand, checkWinCondition } from "./scoring.js";
import type { CardId, Color, GameRules, GameState, Seat, Team } from "./types.js";
import { DEFAULT_RULES, SEAT_TEAM, leftOf, nextSeat } from "./types.js";

const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Check if bidding is complete.
 * Complete when:
 *   - passedCount === 3 → the one non-passed seat wins
 *   - passedCount === 4 → forced bid on dealer (minimumBid)
 * Returns the BiddingComplete event payload or null if still ongoing.
 */
function checkBiddingComplete(
  bids: Record<Seat, number | "pass" | null>,
  dealer: Seat,
  rules: GameRules,
  moonShooters: Seat[],
  now: number,
  handNumber: number,
): Extract<GameEvent, { type: "BiddingComplete" }> | null {
  const seats: Seat[] = ["N", "E", "S", "W"];
  const passedSeats = seats.filter((s) => bids[s] === "pass");
  const passedCount = passedSeats.length;

  if (passedCount === 4) {
    // All passed — forced bid on dealer
    return {
      type: "BiddingComplete",
      winner: dealer,
      amount: rules.minimumBid,
      forced: true,
      shotMoon: false,
      handNumber,
      timestamp: now,
    };
  }

  if (passedCount === 3) {
    // Exactly one player remaining — they win
    const winner = seats.find((s) => bids[s] !== "pass")!;
    const bidValue = bids[winner];
    const amount =
      typeof bidValue === "number" ? bidValue : rules.minimumBid;
    const forced = bidValue === null; // never had a chance to bid
    return {
      type: "BiddingComplete",
      winner,
      amount: forced ? rules.minimumBid : amount,
      forced,
      shotMoon: moonShooters.includes(winner),
      handNumber,
      timestamp: now,
    };
  }

  return null;
}

/**
 * Validate a command against the current game state.
 * Returns events to apply if valid, or an error string if invalid.
 */
export function validateCommand(
  state: GameState,
  command: GameCommand,
  rules: GameRules = DEFAULT_RULES,
): { ok: true; events: GameEvent[] } | { ok: false; error: string } {
  const now = Date.now();

  switch (command.type) {
    case "PlaceBid": {
      if (state.phase !== "bidding") {
        return { ok: false, error: `Cannot PlaceBid in phase: ${state.phase}` };
      }
      if (state.activePlayer !== command.seat) {
        return {
          ok: false,
          error: `PlaceBid: not your turn (active: ${state.activePlayer}, you: ${command.seat})`,
        };
      }
      if (state.bids[command.seat] === "pass") {
        return { ok: false, error: `PlaceBid: ${command.seat} already passed` };
      }
      if (command.amount < rules.minimumBid) {
        return {
          ok: false,
          error: `PlaceBid: amount ${command.amount} below minimum ${rules.minimumBid}`,
        };
      }
      if (command.amount > rules.maximumBid) {
        return {
          ok: false,
          error: `PlaceBid: amount ${command.amount} above maximum ${rules.maximumBid}`,
        };
      }
      if (command.amount <= state.currentBid) {
        return {
          ok: false,
          error: `PlaceBid: amount ${command.amount} must be > currentBid ${state.currentBid}`,
        };
      }
      // Validate increment: amount must be minimumBid + N * bidIncrement
      const offset = command.amount - rules.minimumBid;
      if (offset % rules.bidIncrement !== 0) {
        return {
          ok: false,
          error: `PlaceBid: amount ${command.amount} is not a valid increment (minimumBid=${rules.minimumBid}, increment=${rules.bidIncrement})`,
        };
      }

      const events: GameEvent[] = [];
      const bidPlaced: GameEvent = {
        type: "BidPlaced",
        seat: command.seat,
        amount: command.amount,
        handNumber: state.handNumber,
        timestamp: now,
      };
      events.push(bidPlaced);

      // Apply the bid to check for completion
      const newBids = { ...state.bids, [command.seat]: command.amount };
      const complete = checkBiddingComplete(
        newBids,
        state.dealer,
        rules,
        state.moonShooters,
        now,
        state.handNumber,
      );
      if (complete) events.push(complete);

      return { ok: true, events };
    }

    case "PassBid": {
      if (state.phase !== "bidding") {
        return { ok: false, error: `Cannot PassBid in phase: ${state.phase}` };
      }
      if (state.activePlayer !== command.seat) {
        return {
          ok: false,
          error: `PassBid: not your turn (active: ${state.activePlayer}, you: ${command.seat})`,
        };
      }
      if (state.bids[command.seat] === "pass") {
        return { ok: false, error: `PassBid: ${command.seat} already passed` };
      }

      const events: GameEvent[] = [];
      const bidPassed: GameEvent = {
        type: "BidPassed",
        seat: command.seat,
        handNumber: state.handNumber,
        timestamp: now,
      };
      events.push(bidPassed);

      const newBids = { ...state.bids, [command.seat]: "pass" as const };
      const complete = checkBiddingComplete(
        newBids,
        state.dealer,
        rules,
        state.moonShooters,
        now,
        state.handNumber,
      );
      if (complete) events.push(complete);

      return { ok: true, events };
    }

    case "ShootMoon": {
      if (state.phase !== "bidding") {
        return { ok: false, error: `Cannot ShootMoon in phase: ${state.phase}` };
      }
      if (state.activePlayer !== command.seat) {
        return {
          ok: false,
          error: `ShootMoon: not your turn (active: ${state.activePlayer}, you: ${command.seat})`,
        };
      }
      if (state.bids[command.seat] === "pass") {
        return { ok: false, error: `ShootMoon: ${command.seat} already passed` };
      }
      if (state.moonShooters.includes(command.seat)) {
        return { ok: false, error: `ShootMoon: ${command.seat} already declared moon` };
      }
      if (typeof state.bids[command.seat] === "number") {
        return {
          ok: false,
          error: `ShootMoon: ${command.seat} has already placed a numeric bid`,
        };
      }

      const events: GameEvent[] = [];
      const moonDeclared: GameEvent = {
        type: "MoonDeclared",
        seat: command.seat,
        amount: rules.maximumBid,
        handNumber: state.handNumber,
        timestamp: now,
      };
      events.push(moonDeclared);

      const newBids = { ...state.bids, [command.seat]: rules.maximumBid };
      const complete = checkBiddingComplete(
        newBids,
        state.dealer,
        rules,
        [...state.moonShooters, command.seat],
        now,
        state.handNumber,
      );
      if (complete) events.push(complete);

      return { ok: true, events };
    }

    case "TakeNest": {
      if (state.phase !== "nest") {
        return { ok: false, error: `Cannot TakeNest in phase: ${state.phase}` };
      }
      const expectedSeat = state.bidder!;
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
      const expectedSeat = state.bidder!;
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
      const expectedSeat = state.bidder!;
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
      if (state.currentTrick.length >= 4) {
        return {
          ok: false,
          error: `PlayCard: trick already has ${state.currentTrick.length} cards — must wait for TrickCompleted`,
        };
      }
      const hand = state.hands[command.seat] ?? [];
      if (!hand.includes(command.cardId)) {
        return { ok: false, error: `PlayCard: card ${command.cardId} not in hand` };
      }

      // Must-follow rule — single source of truth via getLegalCards
      const legalCards = getLegalCards(state, command.seat, hand);
      if (!legalCards.includes(command.cardId)) {
        const leadPlay = state.currentTrick[0];
        const leadCard = leadPlay ? cardFromId(leadPlay.cardId) : null;
        const ledSuit: Color | null =
          leadCard?.kind === "rook"
            ? state.trump
            : leadCard?.kind === "regular"
            ? leadCard.color
            : null;
        return {
          ok: false,
          error: `Must follow suit: have ${ledSuit} cards, played ${command.cardId}`,
        };
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

          // Score the hand using bidder and bidAmount from state
          const bidder = state.bidder ?? leftOf(state.dealer);
          const bidAmount = state.bidAmount > 0 ? state.bidAmount : rules.autoBidAmount;

          // Snapshot pre-hand scores BEFORE applying deltas
          const preHandScores = { ...stateAfterTrick.scores };

          const handScore = scoreHand({
            completedTricks: stateAfterTrick.completedTricks,
            discarded: stateAfterTrick.discarded,
            nestCards: stateAfterTrick.originalNest,
            bidder,
            bidAmount,
            hand: state.handNumber,
            rules,
            shotMoon: state.shotMoon,
            preHandScores,
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

          // Determine moon-made flag: only true if pre-hand score was >= 0
          const bidderTotal = bidderTeam === "NS" ? handScore.nsTotal : handScore.ewTotal;
          const moonShooterMade =
            state.shotMoon &&
            bidderTotal >= bidAmount &&
            preHandScores[bidderTeam] >= 0;

          const winCondition = checkWinCondition(
            newScores,
            bidderTeam,
            rules,
            handScore.moonShooterWentSet,
            moonShooterMade,
          );

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
      void _exhaustive;
      return { ok: false, error: "Unknown command" };
    }
  }
}

/**
 * Return all legal commands for a given seat in the current state.
 */
export function legalCommands(
  state: GameState,
  seat: Seat,
  _rules?: GameRules,
): GameCommand[] {
  const rules = _rules ?? state.rules ?? DEFAULT_RULES;
  const commands: GameCommand[] = [];

  switch (state.phase) {
    case "bidding": {
      if (state.activePlayer !== seat) return [];
      if (state.bids[seat] === "pass") return [];

      // PassBid is always available
      commands.push({ type: "PassBid", seat });

      // PlaceBid: from max(minimumBid, currentBid + increment) to maximumBid
      const startBid =
        state.currentBid === 0
          ? rules.minimumBid
          : state.currentBid + rules.bidIncrement;
      for (let amount = startBid; amount <= rules.maximumBid; amount += rules.bidIncrement) {
        commands.push({ type: "PlaceBid", seat, amount });
      }

      // ShootMoon if not already in moonShooters and no prior numeric bid
      const hasPlacedNumericBid = typeof state.bids[seat] === "number";
      if (!state.moonShooters.includes(seat) && !hasPlacedNumericBid) {
        commands.push({ type: "ShootMoon", seat });
      }

      break;
    }

    case "nest": {
      const expectedSeat = state.bidder!;
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
      const expectedSeat = state.bidder!;
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
function getLegalCards(state: GameState, _seat: Seat, hand: CardId[]): CardId[] {
  // Leading — any card is legal
  if (state.currentTrick.length === 0) {
    return [...hand];
  }

  const leadCard = cardFromId(state.currentTrick[0]!.cardId);
  const trump = state.trump!; // always set in playing phase

  // Effective led suit: Rook led → trump (Rook is lowest trump)
  const ledSuit: Color =
    leadCard.kind === "rook" ? trump : leadCard.color;

  const trumpWasLed = ledSuit === trump;

  // Regular cards matching the led suit
  const regularLedCards = hand.filter((c) => {
    if (c === "ROOK") return false;
    const card = cardFromId(c);
    return card.kind === "regular" && card.color === ledSuit;
  });

  const rookInHand = hand.includes("ROOK");

  // Determine if the player is void in the led suit.
  // When trump was led: Rook counts as trump (in-suit).
  // When non-trump was led: Rook is trump-coloured (not led-suit-coloured),
  //   so only regular led-suit cards determine void.
  const hasLedSuit = trumpWasLed
    ? regularLedCards.length > 0 || rookInHand
    : regularLedCards.length > 0;

  if (!hasLedSuit) {
    // Void in led suit — any card is legal
    return [...hand];
  }

  // Player has led-suit cards — must follow.
  // Rook is only a legal co-play when trump was led (Rook is in-suit as lowest trump).
  // When non-trump was led and the player holds led-suit cards, the Rook is trump
  // (not the led suit) and is therefore NOT a legal play.
  const legal = [...regularLedCards];
  if (rookInHand && trumpWasLed) legal.push("ROOK");
  return legal;
}
