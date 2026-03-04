import { CARD_POINTS } from "./deck.js";
import type { CardId, CompletedTrick, GameRules, HandScore, Seat, Team } from "./types.js";
import { SEAT_TEAM } from "./types.js";

/**
 * Point value of a single card.
 */
export function pointValue(cardId: CardId): number {
  return CARD_POINTS[cardId] ?? 0;
}

/**
 * Score a completed hand.
 */
export function scoreHand(params: {
  completedTricks: CompletedTrick[];
  discarded: CardId[];
  nestCards: CardId[];
  bidder: Seat;
  bidAmount: number;
  hand: number;
  rules: GameRules;
  shotMoon?: boolean;
  preHandScores?: Record<Team, number>;
}): HandScore {
  const {
    completedTricks,
    discarded,
    nestCards,
    bidder,
    bidAmount,
    hand,
    shotMoon = false,
    preHandScores,
  } = params;

  // 1. Count point cards captured by each team from completed tricks
  let nsPointCards = 0;
  let ewPointCards = 0;

  // Count cards captured by each team (all cards in tricks)
  let nsCardCount = 0;
  let ewCardCount = 0;

  let lastTrickWinner: Seat | null = null;

  for (let i = 0; i < completedTricks.length; i++) {
    const trick = completedTricks[i]!;
    const team = SEAT_TEAM[trick.winner];
    lastTrickWinner = trick.winner;

    for (const play of trick.plays) {
      const pts = pointValue(play.cardId);
      if (team === "NS") {
        nsPointCards += pts;
        nsCardCount++;
      } else {
        ewPointCards += pts;
        ewCardCount++;
      }
    }
  }

  // 2. Determine which team won the last trick
  const nsWonLastTrick = lastTrickWinner !== null && SEAT_TEAM[lastTrickWinner] === "NS";
  const ewWonLastTrick = lastTrickWinner !== null && SEAT_TEAM[lastTrickWinner] === "EW";

  // 3. Add point value of discarded nest cards to the last-trick-winning team
  let nsNestBonus = 0;
  let ewNestBonus = 0;

  for (const cardId of discarded) {
    const pts = pointValue(cardId);
    if (nsWonLastTrick) {
      nsNestBonus += pts;
      nsCardCount++; // also count nest cards for card count
    } else if (ewWonLastTrick) {
      ewNestBonus += pts;
      ewCardCount++;
    }
  }

  // 4. Most-cards bonus: team with >22 of the 45 cards gets +20
  // The 5 nest cards go to the last trick winner's team
  // Total cards = nsCardCount + ewCardCount should be 45
  let nsMostCardsBonus = 0;
  let ewMostCardsBonus = 0;

  if (nsCardCount > 22) {
    nsMostCardsBonus = 20;
  } else if (ewCardCount > 22) {
    ewMostCardsBonus = 20;
  }

  // 5. Compute totals (before bid adjustment)
  const nsTotal = nsPointCards + nsNestBonus + nsMostCardsBonus;
  const ewTotal = ewPointCards + ewNestBonus + ewMostCardsBonus;

  // 6. Apply bid outcome
  const bidderTeam: Team = SEAT_TEAM[bidder];
  const bidderTotal = bidderTeam === "NS" ? nsTotal : ewTotal;

  // Detect moon shooter going set: shotMoon=true AND bidder didn't capture all tricks
  const moonShooterWentSet = shotMoon && bidderTotal < bidAmount;

  // Detect moon shooter making it: shotMoon=true AND bidder made the bid
  const bidderMadeIt = bidderTotal >= bidAmount;

  // Pre-hand score for the bidder team (0 if not provided)
  const preHandScore = preHandScores ? preHandScores[bidderTeam] : 0;

  // Moon made: shotMoon=true, bidder made bid, AND pre-hand score >= 0
  const moonShooterMadePositive = shotMoon && bidderMadeIt && preHandScore >= 0;
  // Moon made but in the hole: shotMoon=true, bidder made bid, pre-hand score < 0
  const moonShooterMadeInHole = shotMoon && bidderMadeIt && preHandScore < 0;

  let nsDelta: number;
  let ewDelta: number;

  if (moonShooterWentSet) {
    // Moon shooter went set: bidder team scores 0, opponent gets the full point pool
    if (bidderTeam === "NS") {
      nsDelta = 0;
      ewDelta = nsTotal + ewTotal;
    } else {
      nsDelta = nsTotal + ewTotal;
      ewDelta = 0;
    }
  } else if (moonShooterMadeInHole) {
    // Moon made but bidder team is in the hole: reset their score to 0
    // Opponent scores their normal points
    if (bidderTeam === "NS") {
      nsDelta = Math.abs(preHandScore); // brings NS from negative to 0
      ewDelta = ewTotal;
    } else {
      nsDelta = nsTotal;
      ewDelta = Math.abs(preHandScore); // brings EW from negative to 0
    }
  } else if (moonShooterMadePositive) {
    // Moon made with positive pre-hand score: instant win (score normally, win condition handled in checkWinCondition)
    nsDelta = nsTotal;
    ewDelta = ewTotal;
  } else if (bidderMadeIt) {
    // Normal win — both teams score their points
    nsDelta = nsTotal;
    ewDelta = ewTotal;
  } else {
    // Normal set
    if (bidderTeam === "NS") {
      nsDelta = -bidAmount;
      ewDelta = ewTotal;
    } else {
      nsDelta = nsTotal;
      ewDelta = -bidAmount;
    }
  }

  return {
    hand,
    bidder,
    bidAmount,
    nestCards,
    discarded,
    nsPointCards,
    ewPointCards,
    nsMostCardsBonus,
    ewMostCardsBonus,
    nsNestBonus,
    ewNestBonus,
    nsWonLastTrick,
    ewWonLastTrick,
    nsTotal,
    ewTotal,
    nsDelta,
    ewDelta,
    shotMoon,
    moonShooterWentSet,
  };
}

/**
 * Check win condition after applying score deltas.
 * Returns winner and reason, or null if game continues.
 */
export function checkWinCondition(
  scores: Record<Team, number>,
  bidderTeam: Team,
  rules: GameRules,
  moonShooterWentSet = false,
  moonShooterMade = false,
): { winner: Team; reason: "threshold-reached" | "bust" | "moon-set" | "moon-made" } | null {
  const { winThreshold, bustThreshold } = rules;

  // Instant loss: moon shooter went set
  if (moonShooterWentSet) {
    const winner: Team = bidderTeam === "NS" ? "EW" : "NS";
    return { winner, reason: "moon-set" };
  }

  // Instant win: moon shooter made it (only if score was >= 0 before hand)
  if (moonShooterMade) {
    return { winner: bidderTeam, reason: "moon-made" };
  }

  // Check bust condition first
  const nsBusted = scores.NS < bustThreshold;
  const ewBusted = scores.EW < bustThreshold;

  if (nsBusted && ewBusted) {
    // Both busted — bidder team loses (other team wins)
    const winner: Team = bidderTeam === "NS" ? "EW" : "NS";
    return { winner, reason: "bust" };
  }
  if (nsBusted) {
    return { winner: "EW", reason: "bust" };
  }
  if (ewBusted) {
    return { winner: "NS", reason: "bust" };
  }

  // Check win threshold
  const nsWon = scores.NS >= winThreshold;
  const ewWon = scores.EW >= winThreshold;

  if (nsWon && ewWon) {
    // Both reached threshold — bidding team wins
    return { winner: bidderTeam, reason: "threshold-reached" };
  }
  if (nsWon) {
    return { winner: "NS", reason: "threshold-reached" };
  }
  if (ewWon) {
    return { winner: "EW", reason: "threshold-reached" };
  }

  return null;
}
