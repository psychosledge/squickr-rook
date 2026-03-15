/**
 * Coaching log transform layer.
 *
 * DEV-ONLY — transforms raw HandLogEntry[] into a richer CoachingHandEntry[]
 * format that pre-computes expensive reconstructions for Roxy (game coach AI) analysis.
 *
 * Never imported in production builds.
 */

import type { CardId, Color, Seat, Team } from "@rook/engine";
import { cardFromId, pointValue, SEAT_TEAM } from "@rook/engine";
import type {
  HandLogEntry,
  PlayReason,
  BidAction,
  BidEvent,
  BiddingAnnotation,
} from "./devLog";

// ── Score context ─────────────────────────────────────────────────────────────

export type ScoreContext = {
  scoresBefore: { NS: number; EW: number };
  pointsToWin: { NS: number; EW: number };   // 500 - scoresBefore[team]
  pointsToBust: { NS: number; EW: number };  // scoresBefore[team] + 500
};

// ── Bidding ───────────────────────────────────────────────────────────────────

export type CoachingBidContext = {
  trueHandValue: number;
  ceiling: number;
  partnerCeilingBonus: number;
  decision: number | "pass";
};

export type CoachingAuctionEvent = {
  seat: Seat;
  isHuman: boolean;
  action: BidAction;
  amount: number | null;
  standingBid: number;
  round: number;
  botContext: CoachingBidContext | null;  // null for human and forced bids
};

export type CoachingBiddingSummary = {
  finalBidder: Seat;
  finalBidAmount: number;
  finalBidderTeam: Team;
  auctionRounds: number;
  moonAttempted: boolean;
  moonMade: boolean;
  isForced: boolean;  // true if finalBidder has a "forced" action in auctionEvents
};

// ── Nest ──────────────────────────────────────────────────────────────────────

export type CoachingNestSummary = {
  nestCards: CardId[];            // 5 cards in the nest before discard
  nestPointValue: number;         // sum of pointValue() for nestCards
  discarded: CardId[];            // 5 cards bidWinner discarded back
  discardedPointValue: number;    // sum of pointValue() for discarded
  nestBonusToTeam: Team;          // team that won the last trick (receives nest bonus)
  nestBonusPoints: number;        // actual point bonus
};

// ── Hands at each trick ───────────────────────────────────────────────────────

export type CoachingHandsAtTrick = Readonly<Record<Seat, readonly CardId[]>>;
// 10 entries (one per trick, representing the hand at the START of that trick)

// ── Tricks ────────────────────────────────────────────────────────────────────

export type CoachingPlay = {
  seat: Seat;
  cardId: CardId;
  isHuman: boolean;
  pointValue: number;           // pointValue(cardId)
  isForced: boolean;            // true if player had no cards of the led suit
  wonTrick: boolean;            // true if this seat === trick.winner
  reasoning: PlayReason | null; // from PlayAnnotation.reasoning (null for human)
};

export type CoachingTrick = {
  trickIndex: number;           // 0-based
  leadSeat: Seat;               // plays[0].seat
  leadColor: Color | null;
  plays: readonly [CoachingPlay, CoachingPlay, CoachingPlay, CoachingPlay];
  winner: Seat;
  winnerTeam: Team;
  pointsAtStake: number;        // sum of pointValue for all 4 cards played in this trick
  cumulativePoints: { NS: number; EW: number }; // running total after this trick (NOT including nest bonus)
  cardCount: { NS: number; EW: number };        // cards captured so far
  isFinalTrick: boolean;        // trickIndex === 9
};

// ── Outcome ───────────────────────────────────────────────────────────────────

export type CoachingOutcome = {
  bidderTeam: Team;
  bidMade: boolean;
  pointsFromTricks: { NS: number; EW: number };  // raw trick points only
  bonuses: {
    nestBonus: { team: Team; points: number };
    mostCardsBonus: { team: Team | null; points: number };
    lastTrickBonus: { team: Team | null; points: number };
  };
  delta: { NS: number; EW: number };    // from score.nsDelta / ewDelta
  scoresAfter: { NS: number; EW: number };
  moonAttempted: boolean;
  moonMade: boolean;
};

// ── Top-level entry ───────────────────────────────────────────────────────────

export type CoachingHandEntry = {
  handNumber: number;
  timestamp: string;
  dealer: Seat;
  trump: Color;
  scoreContext: ScoreContext;
  biddingSummary: CoachingBiddingSummary;
  auctionTimeline: CoachingAuctionEvent[];
  nestSummary: CoachingNestSummary;
  effectiveHands: Record<Seat, readonly CardId[]>;   // post-discard 10-card hands
  handsAtTrick: readonly [
    CoachingHandsAtTrick, CoachingHandsAtTrick, CoachingHandsAtTrick, CoachingHandsAtTrick,
    CoachingHandsAtTrick, CoachingHandsAtTrick, CoachingHandsAtTrick, CoachingHandsAtTrick,
    CoachingHandsAtTrick, CoachingHandsAtTrick,
  ]; // 10 entries
  tricks: readonly [
    CoachingTrick, CoachingTrick, CoachingTrick, CoachingTrick, CoachingTrick,
    CoachingTrick, CoachingTrick, CoachingTrick, CoachingTrick, CoachingTrick,
  ]; // always 10 tricks
  outcome: CoachingOutcome;
};

export type CoachingLog = CoachingHandEntry[];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the Color of a card, or null for the ROOK card.
 */
function colorOf(cardId: CardId): Color | null {
  const card = cardFromId(cardId);
  return card.kind === "regular" ? card.color : null;
}

/**
 * Remove the first occurrence of a card from a hand (returns new array).
 */
function removeCard(hand: readonly CardId[], cardId: CardId): CardId[] {
  const idx = hand.indexOf(cardId);
  if (idx === -1) return [...hand];
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

// ── Transform functions ───────────────────────────────────────────────────────

/**
 * Transform a single HandLogEntry into a CoachingHandEntry.
 */
export function buildCoachingEntry(raw: HandLogEntry): CoachingHandEntry {
  const { score, scoresBefore, finalBidder, finalBidAmount, auctionEvents } = raw;

  // ── ScoreContext ────────────────────────────────────────────────────────────
  const scoreContext: ScoreContext = {
    scoresBefore: { ...scoresBefore },
    pointsToWin: {
      NS: 500 - scoresBefore.NS,
      EW: 500 - scoresBefore.EW,
    },
    pointsToBust: {
      NS: scoresBefore.NS + 500,
      EW: scoresBefore.EW + 500,
    },
  };

  // ── BiddingSummary ──────────────────────────────────────────────────────────
  const isForced = auctionEvents.some(
    (e: BidEvent) => e.seat === finalBidder && e.action === "forced",
  );
  const biddingSummary: CoachingBiddingSummary = {
    finalBidder,
    finalBidAmount,
    finalBidderTeam: SEAT_TEAM[finalBidder],
    auctionRounds: raw.auctionRounds,
    moonAttempted: raw.moonAttempted,
    moonMade: raw.moonMade,
    isForced,
  };

  // ── AuctionTimeline ─────────────────────────────────────────────────────────
  const auctionTimeline: CoachingAuctionEvent[] = auctionEvents.map((e: BidEvent) => {
    let botContext: CoachingBidContext | null = null;
    if (!e.isHuman && e.action !== "forced" && e.annotation) {
      const ann: BiddingAnnotation = e.annotation;
      botContext = {
        trueHandValue: ann.trueHandValue,
        ceiling: ann.ceiling,
        partnerCeilingBonus: ann.partnerCeilingBonus,
        decision: ann.decision,
      };
    }
    return {
      seat: e.seat,
      isHuman: e.isHuman,
      action: e.action,
      amount: e.amount,
      standingBid: e.standingBid,
      round: e.round,
      botContext,
    };
  });

  // ── EffectiveHands ──────────────────────────────────────────────────────────
  const effectiveHands: Record<Seat, CardId[]> = {
    N: [...raw.startingHands.N],
    E: [...raw.startingHands.E],
    S: [...raw.startingHands.S],
    W: [...raw.startingHands.W],
  };

  // Bid winner picks up nest cards and discards some back
  const bidWinnerSeat = finalBidder;
  const withNest = [...effectiveHands[bidWinnerSeat], ...raw.nestCards];
  // Remove discards (one at a time in case of duplicates)
  let bidWinnerHand = [...withNest];
  for (const discard of raw.bidWinnerDiscards) {
    const idx = bidWinnerHand.indexOf(discard);
    if (idx !== -1) {
      bidWinnerHand = [...bidWinnerHand.slice(0, idx), ...bidWinnerHand.slice(idx + 1)];
    }
  }
  effectiveHands[bidWinnerSeat] = bidWinnerHand;

  // ── HandsAtTrick ────────────────────────────────────────────────────────────
  // handsAtTrick[0] = effectiveHands (deep copy)
  // handsAtTrick[n] = handsAtTrick[n-1] minus each player's card from trick n-1
  const handsAtTrickMutable: CoachingHandsAtTrick[] = [];

  handsAtTrickMutable.push({
    N: [...effectiveHands.N],
    E: [...effectiveHands.E],
    S: [...effectiveHands.S],
    W: [...effectiveHands.W],
  });

  for (let i = 0; i < raw.tricks.length - 1; i++) {
    const prevHands = handsAtTrickMutable[i]!;
    const trick = raw.tricks[i]!;
    const nextHands: Record<Seat, CardId[]> = {
      N: [...prevHands.N],
      E: [...prevHands.E],
      S: [...prevHands.S],
      W: [...prevHands.W],
    };
    for (const play of trick.plays) {
      nextHands[play.seat] = removeCard(nextHands[play.seat]!, play.cardId);
    }
    handsAtTrickMutable.push(nextHands);
  }

  const handsAtTrick = handsAtTrickMutable as unknown as CoachingHandEntry["handsAtTrick"];

  // ── Tricks ──────────────────────────────────────────────────────────────────
  let cumulativeNS = 0;
  let cumulativeEW = 0;
  let cardCountNS = 0;
  let cardCountEW = 0;

  const coachingTricks: CoachingTrick[] = raw.tricks.map((trick, trickIndex) => {
    const handsNow = handsAtTrick[trickIndex]!;
    const leadSeat = trick.plays[0]!.seat;
    const leadColor = trick.leadColor;

    const plays: CoachingPlay[] = trick.plays.map(trickPlay => {
      const isLead = trickPlay.seat === leadSeat;
      let isForced = false;
      if (!isLead && leadColor !== null) {
        const handAtStart = handsNow[trickPlay.seat];
        const hasLedColor = handAtStart.some(c => colorOf(c) === leadColor);
        isForced = !hasLedColor;
      }

      const annotation = trickPlay.annotation;
      const reasoning: PlayReason | null =
        trickPlay.isHuman || !annotation
          ? null
          : (annotation.reasoning === "human" ? null : annotation.reasoning as PlayReason);

      return {
        seat: trickPlay.seat,
        cardId: trickPlay.cardId,
        isHuman: trickPlay.isHuman,
        pointValue: pointValue(trickPlay.cardId),
        isForced,
        wonTrick: trickPlay.seat === trick.winner,
        reasoning,
      };
    });

    const pointsAtStake = plays.reduce((sum, p) => sum + p.pointValue, 0);
    const winnerTeam = SEAT_TEAM[trick.winner];

    if (winnerTeam === "NS") {
      cumulativeNS += pointsAtStake;
      cardCountNS += 4;
    } else {
      cumulativeEW += pointsAtStake;
      cardCountEW += 4;
    }

    return {
      trickIndex,
      leadSeat,
      leadColor,
      plays: plays as [CoachingPlay, CoachingPlay, CoachingPlay, CoachingPlay],
      winner: trick.winner,
      winnerTeam,
      pointsAtStake,
      cumulativePoints: { NS: cumulativeNS, EW: cumulativeEW },
      cardCount: { NS: cardCountNS, EW: cardCountEW },
      isFinalTrick: trickIndex === 9,
    };
  });

  const tricks = coachingTricks as unknown as CoachingHandEntry["tricks"];

  // ── NestSummary ─────────────────────────────────────────────────────────────
  const lastTrickWinner = raw.tricks[9]!.winner;
  const nestBonusToTeam: Team = SEAT_TEAM[lastTrickWinner];
  // nestBonusPoints is always attributed to the last-trick winner's team; may be 0
  // when none of the discarded nest cards have point value.
  const nestBonusPoints = score.nsNestBonus > 0 ? score.nsNestBonus : score.ewNestBonus;

  const nestSummary: CoachingNestSummary = {
    nestCards: [...raw.nestCards],
    nestPointValue: raw.nestCards.reduce((sum, c) => sum + pointValue(c), 0),
    discarded: [...raw.bidWinnerDiscards],
    discardedPointValue: raw.bidWinnerDiscards.reduce((sum, c) => sum + pointValue(c), 0),
    nestBonusToTeam,
    nestBonusPoints,
  };

  // ── Outcome ─────────────────────────────────────────────────────────────────
  const bidderTeam: Team = SEAT_TEAM[finalBidder];
  // Derive bidMade from the score delta (authoritative signal from scoring engine).
  // Using delta avoids the moon-bust edge case where raw nsTotal/ewTotal >= bidAmount
  // but the bidder still went set (moonShooterWentSet=true → delta=0, not negative).
  const bidMade = bidderTeam === "NS" ? score.nsDelta > 0 : score.ewDelta > 0;

  // Most cards bonus
  const mostCardsBonusTeam: Team | null =
    score.nsMostCardsBonus > 0 ? "NS" :
    score.ewMostCardsBonus > 0 ? "EW" :
    null;
  const mostCardsBonusPoints = score.nsMostCardsBonus > 0
    ? score.nsMostCardsBonus
    : score.ewMostCardsBonus;

  const outcome: CoachingOutcome = {
    bidderTeam,
    bidMade,
    pointsFromTricks: {
      NS: score.nsPointCards,
      EW: score.ewPointCards,
    },
    bonuses: {
      nestBonus: { team: nestBonusToTeam, points: nestBonusPoints },
      mostCardsBonus: { team: mostCardsBonusTeam, points: mostCardsBonusPoints },
      lastTrickBonus: { team: null, points: 0 },
      // NOTE: HandScore does not expose a standalone lastTrickBonusPoints field.
      // The last-trick nest bonus is already captured in nestBonus above.
      // If the engine ever adds a separate lastTrickBonusPoints, populate this here.
    },
    delta: { NS: score.nsDelta, EW: score.ewDelta },
    scoresAfter: { ...raw.scoresAfter },
    moonAttempted: raw.moonAttempted,
    moonMade: raw.moonMade,
  };

  return {
    handNumber: raw.handNumber,
    timestamp: raw.timestamp,
    dealer: raw.dealer,
    trump: raw.trump,
    scoreContext,
    biddingSummary,
    auctionTimeline,
    nestSummary,
    effectiveHands: {
      N: effectiveHands.N,
      E: effectiveHands.E,
      S: effectiveHands.S,
      W: effectiveHands.W,
    },
    handsAtTrick,
    tricks,
    outcome,
  };
}

/**
 * Transform an array of HandLogEntry into a CoachingLog.
 */
export function buildCoachingLog(raw: HandLogEntry[]): CoachingLog {
  return raw.map(buildCoachingEntry);
}
