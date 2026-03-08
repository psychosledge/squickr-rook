import type { GameCommand } from "./commands.js";
import { compareTrickCards, cardFromId, offSuitRank, trumpRank } from "./deck.js";
import { pointValue } from "./scoring.js";
import { legalCommands } from "./validator.js";
import type { BotProfile, CardId, Color, GameState, Seat } from "./types.js";
import { DEFAULT_RULES, SEAT_TEAM } from "./types.js";

const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/**
 * Returns the maximum bid amount this bot is willing to reach.
 * Returns 0 if the bot won't bid at all.
 */
function bidWillingness(strength: number): number {
  if (strength < 40) return 0;
  if (strength < 55) return 110;
  if (strength < 65) return 120;
  if (strength < 75) return 135;
  if (strength < 85) return 150;
  if (strength < 95) return 165;
  return 180;
}

// BotProfile fields active in current implementation:
//   playAccuracy, trackPlayedCards, sluffStrategy, trumpManagement, canShootMoon,
//   moonShootThreshold, contextualMoonShoot
//
// Reserved for future phases (currently populated in BOT_PRESETS but not yet read):
//   handValuationAccuracy (Phase 2), bidAggressiveness (Phase 2),
//   bluffResistance (Phase 2), scoreContextAwareness (Phase 2),
//   voidExploitation (Phase 5), endgameCardAwareness (Phase 6),
//   roleAwareness (Phase 4)

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
    case "bidding": {
      const hand = state.hands[seat] ?? [];
      const strength = estimateBidStrength(hand);
      const rules = state.rules ?? DEFAULT_RULES;
      const minNextBid = state.currentBid === 0
        ? rules.minimumBid
        : state.currentBid + rules.bidIncrement;

      if (profile.difficulty <= 2) {
        // Beginner/Easy always passes
        return { type: "PassBid", seat };
      }

      // Normal–Expert: attempt moon shoot if enabled and hand is strong enough
      if (profile.canShootMoon && strength >= profile.moonShootThreshold && !state.moonShooters.includes(seat)) {
        const shootCmd = legal.find(c => c.type === "ShootMoon");
        if (shootCmd) return shootCmd;
      }

      // Bid up to aggressiveness-adjusted ceiling
      const baseCeiling = bidWillingness(strength);
      const ceiling = Math.round(baseCeiling * profile.bidAggressiveness);
      if (minNextBid <= ceiling) {
        const bidCmd = legal.find(c => c.type === "PlaceBid" && c.amount === minNextBid);
        if (bidCmd) return bidCmd;
      }
      return { type: "PassBid", seat };
    }

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

      if (profile.difficulty <= 2) {
        // Beginner/Easy: random discard
        return pickRandom(discardCommands);
      }

      // Normal/Hard: discard lowest-point non-trump cards first; prefer keeping 1s and 14s
      return chooseBestDiscard(discardCommands, state, seat, profile);
    }

    case "trump": {
      const selectCommands = legal.filter((c) => c.type === "SelectTrump");
      if (selectCommands.length === 0) return legal[0]!;

      if (profile.difficulty <= 2) {
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

// ── Bid strength estimation ───────────────────────────────────────────────────

function estimateBidStrength(hand: CardId[]): number {
  let strength = 0;
  for (const cardId of hand) {
    if (cardId === "ROOK") { strength += 15; continue; }
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    if (card.value === 1) strength += 15;   // Ace (highest)
    if (card.value === 14) strength += 10;  // 14-point card
    if (card.value === 10) strength += 8;   // 10-point card
    if (card.value === 5) strength += 5;    // 5-point card
  }
  return strength;
}

// ── Discard strategy ──────────────────────────────────────────────────────────

function chooseBestDiscard(
  discardCommands: GameCommand[],
  state: GameState,
  _seat: Seat,
  // TODO Phase 5: apply profile.voidExploitation to target color voids
  _profile: BotProfile,
): GameCommand {
  // Score each card: lower score = better to discard
  // Prefer discarding: zero-point non-trump cards, then low-point cards
  // Keep: 1s (15 pts), 14s (10 pts), 10s (10 pts), trump cards
  const trump = state.trump; // May be null at discard phase (always null, trump not set yet)

  const scored = discardCommands.map((cmd) => {
    if (cmd.type !== "DiscardCard") return { cmd, score: 0 };
    const cardId = cmd.cardId;
    const pts = pointValue(cardId);
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

  if (profile.trumpManagement < 0.7) {
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

  // High trump management (>= 0.7): weight by point value
  const colorWeights: Record<Color, number> = {
    Black: 0, Red: 0, Green: 0, Yellow: 0,
  };
  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    const card = cardFromId(cardId);
    if (card.kind === "regular") {
      colorWeights[card.color] += 1 + pointValue(cardId) * 0.1;
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

  if (profile.difficulty <= 2) {
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
  _seat: Seat,
  _profile: BotProfile,
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

  // sluffStrategy + partner is winning: play highest point card
  if (profile.sluffStrategy && partnerIsWinning) {
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
    return pointValue(cmd.cardId) > pointValue(best.cardId) ? cmd : best;
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
    return pointValue(c.cardId) === 0;
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
    return pointValue(cmd.cardId) < pointValue(best.cardId) ? cmd : best;
  });
}

function pickRandom<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx]!;
}
