import type { GameCommand } from "./commands.js";
import { compareTrickCards, cardFromId, offSuitRank, trumpRank } from "./deck.js";
import { legalCommands } from "./validator.js";
import type { BotProfile, CardId, Color, GameState, Seat } from "./types.js";
import { SEAT_TEAM } from "./types.js";

const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Choose the best command for a bot player.
 */
export function botChooseCommand(
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  const legal = legalCommands(state, seat);

  if (legal.length === 0) {
    throw new Error(`No legal commands for seat ${seat} in phase ${state.phase}`);
  }

  // Handle by phase
  switch (state.phase) {
    case "nest": {
      // Check if we need to take nest or discard
      if (state.nest.length > 0) {
        // Take the nest
        const takeNest = legal.find((c) => c.type === "TakeNest");
        if (takeNest) return takeNest;
      }

      // Discard 5 cards
      const discardCommands = legal.filter((c) => c.type === "DiscardCard");
      if (discardCommands.length === 0) {
        return legal[0]!;
      }

      if (profile.difficulty === "easy") {
        // Random discard
        return pickRandom(discardCommands);
      }

      // Normal/Hard: discard lowest-point non-trump cards first; prefer keeping 1s and 14s
      return chooseBestDiscard(discardCommands, state, seat, profile);
    }

    case "trump": {
      const selectCommands = legal.filter((c) => c.type === "SelectTrump");
      if (selectCommands.length === 0) return legal[0]!;

      if (profile.difficulty === "easy") {
        return pickRandom(selectCommands);
      }

      return chooseBestTrump(selectCommands, state, seat, profile);
    }

    case "playing": {
      const playCommands = legal.filter((c) => c.type === "PlayCard");
      if (playCommands.length === 0) return legal[0]!;

      // Accuracy check: if random fails, play randomly
      if (Math.random() > profile.playAccuracy) {
        return pickRandom(playCommands);
      }

      return chooseBestPlay(playCommands, state, seat, profile);
    }

    default:
      return legal[0]!;
  }
}

// ── Discard strategy ──────────────────────────────────────────────────────────

function chooseBestDiscard(
  discardCommands: GameCommand[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  // Score each card: lower score = better to discard
  // Prefer discarding: zero-point non-trump cards, then low-point cards
  // Keep: 1s (15 pts), 14s (10 pts), 10s (10 pts), trump cards
  const trump = state.trump; // May be null at discard phase (always null, trump not set yet)

  const scored = discardCommands.map((cmd) => {
    if (cmd.type !== "DiscardCard") return { cmd, score: 0 };
    const cardId = cmd.cardId;
    const pts = getCardPoints(cardId);
    const isTrump = trump !== null && trumpRank(cardId, trump) >= 0;
    const isHighValue = isHighValueCard(cardId);

    let score = 100; // Start with high (keep)
    if (pts === 0 && !isTrump) score = pts; // Prefer discarding zero-point non-trump
    else if (pts > 0 && !isHighValue) score = pts + 10; // Medium priority to discard
    else if (isHighValue) score = 500; // Keep high value cards
    else if (isTrump) score = 400; // Keep trump

    return { cmd, score };
  });

  // Sort ascending (lower score = discard first)
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.cmd;
}

function getCardPoints(cardId: CardId): number {
  if (cardId === "ROOK") return 20;
  const card = cardFromId(cardId);
  if (card.kind !== "regular") return 0;
  if (card.value === 1) return 15;
  if (card.value === 5) return 5;
  if (card.value === 10) return 10;
  if (card.value === 14) return 10;
  return 0;
}

function isHighValueCard(cardId: CardId): boolean {
  if (cardId === "ROOK") return true;
  const card = cardFromId(cardId);
  if (card.kind !== "regular") return false;
  return card.value === 1 || card.value === 14;
}

// ── Trump selection strategy ──────────────────────────────────────────────────

function chooseBestTrump(
  selectCommands: GameCommand[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  const hand = state.hands[seat] ?? [];

  if (profile.difficulty === "normal") {
    // Most cards by color
    const colorCounts: Record<Color, number> = {
      Black: 0, Red: 0, Green: 0, Yellow: 0,
    };
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      const card = cardFromId(cardId);
      if (card.kind === "regular") {
        colorCounts[card.color]++;
      }
    }
    let bestColor: Color = "Black";
    let bestCount = -1;
    for (const color of COLORS) {
      if (colorCounts[color] > bestCount) {
        bestCount = colorCounts[color];
        bestColor = color;
      }
    }
    const cmd = selectCommands.find(
      (c) => c.type === "SelectTrump" && c.color === bestColor,
    );
    return cmd ?? selectCommands[0]!;
  }

  // Hard: most cards weighted by point value
  const colorWeights: Record<Color, number> = {
    Black: 0, Red: 0, Green: 0, Yellow: 0,
  };
  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    const card = cardFromId(cardId);
    if (card.kind === "regular") {
      colorWeights[card.color] += 1 + getCardPoints(cardId) * 0.1;
    }
  }
  let bestColor: Color = "Black";
  let bestWeight = -1;
  for (const color of COLORS) {
    if (colorWeights[color] > bestWeight) {
      bestWeight = colorWeights[color];
      bestColor = color;
    }
  }
  const cmd = selectCommands.find(
    (c) => c.type === "SelectTrump" && c.color === bestColor,
  );
  return cmd ?? selectCommands[0]!;
}

// ── Play strategy ─────────────────────────────────────────────────────────────

function chooseBestPlay(
  playCommands: GameCommand[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  const isLeading = state.currentTrick.length === 0;

  if (profile.difficulty === "easy") {
    return pickRandom(playCommands);
  }

  if (isLeading) {
    // Normal/Hard: play highest trump if available, else highest card
    return chooseLeadCard(playCommands, state, seat, profile);
  }

  return chooseFollowCard(playCommands, state, seat, profile);
}

function chooseLeadCard(
  playCommands: GameCommand[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  const trump = state.trump;

  // Find trump cards
  if (trump !== null) {
    const trumpCards = playCommands.filter((c) => {
      if (c.type !== "PlayCard") return false;
      return trumpRank(c.cardId, trump) >= 0;
    });
    if (trumpCards.length > 0) {
      // Play highest trump
      return trumpCards.reduce((best, cmd) => {
        if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
        return trumpRank(cmd.cardId, trump) > trumpRank(best.cardId, trump) ? cmd : best;
      });
    }
  }

  // No trump or no trump cards — play highest off-suit card
  return playCommands.reduce((best, cmd) => {
    if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
    return offSuitRank(cmd.cardId) > offSuitRank(best.cardId) ? cmd : best;
  });
}

function chooseFollowCard(
  playCommands: GameCommand[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): GameCommand {
  // Determine current winning card
  const trump = state.trump;
  const trick = state.currentTrick;
  if (trick.length === 0) return playCommands[0]!;

  const leadPlay = trick[0]!;
  const leadCard = cardFromId(leadPlay.cardId);
  const leadColor: Color | null = leadCard.kind === "regular" ? leadCard.color : null;

  // Find current trick winner
  let currentWinnerPlay = leadPlay;
  for (let i = 1; i < trick.length; i++) {
    const play = trick[i]!;
    const cmp = compareTrickCards(play.cardId, currentWinnerPlay.cardId, leadColor, trump);
    if (cmp > 0) currentWinnerPlay = play;
  }

  const partnerTeam = SEAT_TEAM[seat];
  const partnerIsWinning = SEAT_TEAM[currentWinnerPlay.seat] === partnerTeam;

  // Hard + sluffStrategy + partner is winning: play highest point card
  if (profile.sluffStrategy && partnerIsWinning && profile.difficulty === "hard") {
    return chooseHighestPointCard(playCommands);
  }

  // Find winning cards
  const winningCommands = playCommands.filter((c) => {
    if (c.type !== "PlayCard") return false;
    const cmp = compareTrickCards(
      c.cardId,
      currentWinnerPlay.cardId,
      leadColor,
      trump,
    );
    return cmp > 0;
  });

  if (winningCommands.length > 0) {
    // Play lowest winning card
    return chooseLowestWinningCard(winningCommands, leadColor, trump);
  }

  // Cannot win — play lowest non-point card, or if all are point cards, lowest point card
  return chooseLowestCard(playCommands);
}

function chooseHighestPointCard(playCommands: GameCommand[]): GameCommand {
  return playCommands.reduce((best, cmd) => {
    if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
    return getCardPoints(cmd.cardId) > getCardPoints(best.cardId) ? cmd : best;
  });
}

function chooseLowestWinningCard(
  winningCommands: GameCommand[],
  leadColor: Color | null,
  trump: Color | null,
): GameCommand {
  // Among winning cards, pick the weakest one
  return winningCommands.reduce((best, cmd) => {
    if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
    const cmpResult = compareTrickCards(cmd.cardId, best.cardId, leadColor, trump);
    return cmpResult < 0 ? cmd : best; // cmd is weaker than best
  });
}

function chooseLowestCard(playCommands: GameCommand[]): GameCommand {
  const nonPointCards = playCommands.filter((c) => {
    if (c.type !== "PlayCard") return false;
    return getCardPoints(c.cardId) === 0;
  });

  if (nonPointCards.length > 0) {
    // Play lowest non-point card by off-suit rank
    return nonPointCards.reduce((best, cmd) => {
      if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
      return offSuitRank(cmd.cardId) < offSuitRank(best.cardId) ? cmd : best;
    });
  }

  // All are point cards — play lowest
  return playCommands.reduce((best, cmd) => {
    if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
    return getCardPoints(cmd.cardId) < getCardPoints(best.cardId) ? cmd : best;
  });
}

function pickRandom<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx]!;
}
