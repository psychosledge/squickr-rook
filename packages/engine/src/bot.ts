import type { GameCommand } from "./commands.js";
import { compareTrickCards, cardFromId, offSuitRank, trumpRank } from "./deck.js";
import { pointValue } from "./scoring.js";
import { legalCommands } from "./validator.js";
import type { BotProfile, CardId, Color, GameState, Seat } from "./types.js";
import { DEFAULT_RULES, SEAT_TEAM } from "./types.js";

const COLORS: Color[] = ["Black", "Red", "Green", "Yellow"];

/** Returns the partner seat (opposite in N↔S, E↔W). */
function partnerOf(seat: Seat): Seat {
  switch (seat) {
    case "N": return "S";
    case "S": return "N";
    case "E": return "W";
    case "W": return "E";
  }
}

// ── Phase 2: Hand valuation ───────────────────────────────────────────────────

/**
 * True hand strength: point-card base + trump-length bonus + void/near-void bonuses.
 * Trump is estimated as the most-weighted color (count + point fraction).
 *
 * Strength reference:
 *   Junk:        0–25
 *   Weak:       26–45
 *   Marginal:   46–60   (opens at 100)
 *   Solid:      61–80   (bids 100–130)
 *   Strong:     81–100  (bids 130–150)
 *   Near-moon: 101–120  (bids 150–175)
 *   Moon:      120+     (bids 175–200 or shoots)
 */
export function estimateHandValue(hand: CardId[]): number {
  const colorCounts: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
  const colorPointWeight: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };

  for (const cardId of hand) {
    if (cardId === "ROOK") continue;
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    colorCounts[card.color]++;
    colorPointWeight[card.color] += 1 + pointValue(cardId) * 0.1;
  }

  // Probable trump = color with highest weighted score
  let probableTrump: Color = "Black";
  let bestWeight = -1;
  for (const color of COLORS) {
    if (colorPointWeight[color] > bestWeight) {
      bestWeight = colorPointWeight[color];
      probableTrump = color;
    }
  }

  // Base: point-card values
  let strength = 0;
  for (const cardId of hand) {
    if (cardId === "ROOK") { strength += 15; continue; }
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    if (card.value === 1)  strength += 15;  // Ace
    if (card.value === 14) strength += 10;  // 14-point card
    if (card.value === 10) strength += 8;   // 10-point card
    if (card.value === 5)  strength += 5;   // 5-point card
  }

  // Trump-length bonus: indexed by trump count (0–7)
  const trumpLengthBonuses = [0, 0, 0, 5, 10, 18, 28, 35];
  const trumpLength = colorCounts[probableTrump];
  strength += trumpLengthBonuses[Math.min(trumpLength, 7)] ?? 35;

  // Void bonus: +8 per void in non-trump colors
  for (const color of COLORS) {
    if (color !== probableTrump && colorCounts[color] === 0) strength += 8;
  }

  // Near-void bonus: +3 per singleton non-trump suit
  for (const color of COLORS) {
    if (color !== probableTrump && colorCounts[color] === 1) strength += 3;
  }

  return strength;
}

/**
 * Hand strength with noise scaled by (1 - accuracy) * 40.
 * accuracy=1 → perfect (no noise). accuracy=0 → ±40 random noise.
 */
export function estimateHandValueWithNoise(hand: CardId[], accuracy: number): number {
  const trueStrength = estimateHandValue(hand);
  if (accuracy >= 1.0) return trueStrength;
  const noiseRange = (1 - accuracy) * 40;
  const noise = (Math.random() - 0.5) * 2 * noiseRange;
  return Math.max(0, trueStrength + noise);
}

// ── Phase 2: Bid ceiling ──────────────────────────────────────────────────────

/**
 * Continuous linear interpolation between strength→bid anchors.
 * Returns 0 if strength < 40 (bot will not open).
 * Anchors: [40→100, 60→115, 75→130, 90→150, 110→175, 130→200]
 */
export function baseBidCeiling(strength: number): number {
  if (strength < 40) return 0;
  const anchors: [number, number][] = [
    [40, 100], [60, 115], [75, 130], [90, 150], [110, 175], [130, 200],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [s0, b0] = anchors[i]!;
    const [s1, b1] = anchors[i + 1]!;
    if (strength <= s1) {
      const t = (strength - s0) / (s1 - s0);
      return Math.round(b0 + t * (b1 - b0));
    }
  }
  // Strength above the last anchor — hard cap at 200
  return 200;
}

/**
 * Full bid ceiling: base ceiling × aggressiveness, adjusted by score context
 * and partner bid inference. Clamped to [minimumBid, maximumBid].
 */
export function computeBidCeiling(
  hand: CardId[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): number {
  const strength = estimateHandValueWithNoise(hand, profile.handValuationAccuracy);
  let ceiling = baseBidCeiling(strength);
  if (ceiling === 0) return 0;

  const rules = state.rules ?? DEFAULT_RULES;

  // Aggressiveness multiplier
  ceiling = Math.round(ceiling * profile.bidAggressiveness);

  // Score context: losing badly → bid more; winning big → bid less
  if (profile.scoreContextAwareness) {
    const myTeam = SEAT_TEAM[seat];
    const oppTeam = myTeam === "NS" ? "EW" : "NS";
    const delta = state.scores[oppTeam] - state.scores[myTeam]; // positive = we are behind
    if (delta > 100)       ceiling += 15;
    else if (delta > 50)   ceiling += 8;
    if (delta < -150)      ceiling -= 15;
    else if (delta < -80)  ceiling -= 8;

    // Partner bid inference: if partner already bid, raise ceiling slightly
    const partnerBid = state.bids[partnerOf(seat)];
    if (typeof partnerBid === "number" && partnerBid > 0) {
      ceiling += Math.max(0, Math.round((partnerBid - 100) * 0.3));
    }
  }

  return Math.max(rules.minimumBid, Math.min(ceiling, rules.maximumBid));
}

// ── Phase 2: Bluff resistance ─────────────────────────────────────────────────

/**
 * Decides whether to bid given the minimum next bid and the computed ceiling.
 * bluffResistance (0–1) adds up to 30 pts above the base ceiling.
 * The combined ceiling is snapped down to the nearest bid increment.
 */
function shouldBid(
  minNextBid: number,
  ceiling: number,
  profile: BotProfile,
  state: GameState,
): boolean {
  if (ceiling === 0) return false;
  const rules = state.rules ?? DEFAULT_RULES;
  const bluffBudget = Math.round(profile.bluffResistance * 30);
  const snappedCeiling =
    Math.floor((ceiling + bluffBudget) / rules.bidIncrement) * rules.bidIncrement;
  return minNextBid <= snappedCeiling;
}

// ── Phase 7: Contextual moon shoot ───────────────────────────────────────────

/**
 * Evaluate whether the bot should shoot the moon.
 * Contextual bots (level 5) adjust the threshold based on score context.
 */
function evaluateMoonShoot(
  hand: CardId[],
  state: GameState,
  seat: Seat,
  profile: BotProfile,
): boolean {
  if (!profile.canShootMoon) return false;
  if (state.moonShooters.includes(seat)) return false;

  const strength = estimateHandValue(hand); // true strength, no noise

  const myTeam = SEAT_TEAM[seat];
  const oppTeam = myTeam === "NS" ? "EW" : "NS";
  const winThreshold = state.rules.winThreshold;
  let threshold = profile.moonShootThreshold;

  if (profile.contextualMoonShoot) {
    // Opponents near winning: lower the bar (they're about to win anyway)
    if (state.scores[oppTeam] >= winThreshold - 150) threshold -= 20;
    // Own team in deep hole: desperation factor
    if (state.scores[myTeam] <= -200) threshold -= 10;
    // Winning comfortably: do not gamble
    if (
      state.scores[myTeam] >= winThreshold - 100 &&
      state.scores[myTeam] > state.scores[oppTeam] + 150
    ) {
      threshold += 20;
    }
  }

  return strength >= threshold;
}

// BotProfile fields active in current implementation:
//   Phase 2 (this file):   handValuationAccuracy, bidAggressiveness, bluffResistance,
//                          scoreContextAwareness, canShootMoon, moonShootThreshold,
//                          contextualMoonShoot
//   Phase 1 carry-overs:   playAccuracy, trackPlayedCards, sluffStrategy, trumpManagement
//   Phase 4:               roleAwareness
//   Phase 5:               voidExploitation
//   Phase 6:               endgameCardAwareness
//   Phase 7:               contextualMoonShoot (evaluateMoonShoot)

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
      const rules = state.rules ?? DEFAULT_RULES;
      const minNextBid = state.currentBid === 0
        ? rules.minimumBid
        : state.currentBid + rules.bidIncrement;

      // ── Level 1 (Beginner): 25% chance to open at minimum; never raises ──
      if (profile.difficulty === 1) {
        if (state.currentBid === 0 && Math.random() < 0.25) {
          const openCmd = legal.find(c => c.type === "PlaceBid" && c.amount === rules.minimumBid);
          if (openCmd) return openCmd;
        }
        return { type: "PassBid", seat };
      }

      // ── Level 2+ ──────────────────────────────────────────────────────────

      // ── Phase 7: Moon-shoot check (contextual for expert) ─────────────────
      if (evaluateMoonShoot(hand, state, seat, profile)) {
        const shootCmd = legal.find(c => c.type === "ShootMoon");
        if (shootCmd) return shootCmd;
      }

      // Compute ceiling and decide whether to bid
      const ceiling = computeBidCeiling(hand, state, seat, profile);
      if (shouldBid(minNextBid, ceiling, profile, state)) {
        const bidCmd = legal.find(c => c.type === "PlaceBid" && c.amount === minNextBid);
        if (bidCmd) return bidCmd;
      }
      return { type: "PassBid", seat };
    }

    case "nest": {
      // Check if we need to take nest or discard
      if (state.nest.length > 0) {
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

      // Normal+: discard lowest-point non-trump cards first; keep 1s, 14s, trump
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

// ── Phase 5: Discard strategy ─────────────────────────────────────────────────

function chooseBestDiscard(
  discardCommands: GameCommand[],
  state: GameState,
  _seat: Seat,
  profile: BotProfile,
): GameCommand {
  const trump = state.trump; // null at discard phase (trump not set yet)

  // ── Phase 5: Void exploitation ────────────────────────────────────────────
  // Identify probable trump using same weighted method as estimateHandValue
  const colorCounts: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
  const colorPointWeight: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };

  // Build counts from ALL cards currently in hand (cards available to discard + kept)
  // discardCommands only contains legal discards, but we need the full hand view.
  // Use state hands if available; fallback to deriving from discardCommands.
  // At discard phase, the hand has been merged with nest cards.
  // We can approximate from the discard commands plus trump color (trump=null here).
  for (const cmd of discardCommands) {
    if (cmd.type !== "DiscardCard") continue;
    const cardId = cmd.cardId;
    if (cardId === "ROOK") continue;
    const card = cardFromId(cardId);
    if (card.kind !== "regular") continue;
    colorCounts[card.color]++;
    colorPointWeight[card.color] += 1 + pointValue(cardId) * 0.1;
  }

  let probableTrump: Color = "Black";
  let bestWeight = -1;
  for (const color of COLORS) {
    if (colorPointWeight[color] > bestWeight) {
      bestWeight = colorPointWeight[color];
      probableTrump = color;
    }
  }

  // Determine void targets
  const voidTargets = new Set<Color>();
  if (profile.voidExploitation >= 0.5) {
    // Sort non-trump colors by count (ascending) to find shortest suits
    const nonTrumpColors = COLORS.filter(c => c !== probableTrump);
    const sorted = [...nonTrumpColors].sort(
      (a, b) => colorCounts[a] - colorCounts[b],
    );
    // >= 0.5: target one void (shortest non-trump color)
    if (sorted[0] !== undefined) voidTargets.add(sorted[0]);
    // >= 0.8: target two voids (two shortest non-trump colors)
    if (profile.voidExploitation >= 0.8 && sorted[1] !== undefined) {
      voidTargets.add(sorted[1]);
    }
  }

  // Score each card: lower score = better to discard
  const scored = discardCommands.map((cmd) => {
    if (cmd.type !== "DiscardCard") return { cmd, score: 0 };
    const cardId = cmd.cardId;
    const pts = pointValue(cardId);
    const isTrump = trump !== null && trumpRank(cardId, trump) >= 0;

    // ROOK: never discard
    if (cardId === "ROOK") return { cmd, score: 600 };

    // Probable trump: keep (score 400)
    const card = cardFromId(cardId);
    const cardColor = card.kind === "regular"
      ? (card as { kind: "regular"; color: Color }).color
      : null;
    const isProbableTrump = cardColor === probableTrump || isTrump;

    // Aces (value=1) and 14s (value=14): keep (score 500)
    if (card.kind === "regular" && (card.value === 1 || card.value === 14)) {
      return { cmd, score: 500 };
    }

    if (isProbableTrump) return { cmd, score: 400 };

    // Void exploitation scoring (only if voidExploitation >= 0.5)
    if (profile.voidExploitation >= 0.5 && cardColor !== null && voidTargets.has(cardColor)) {
      if (pts === 0) return { cmd, score: 0 };         // zero-point in void target: discard first
      return { cmd, score: pts };                        // point card in void target: discard after zero-point
    }

    // Non-trump, non-void-target
    if (pts === 0) return { cmd, score: 50 };
    if (pts <= 5)  return { cmd, score: 100 };
    return { cmd, score: 200 };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.cmd;
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
    // Most cards by color (count only)
    const colorCounts: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
    for (const cardId of hand) {
      if (cardId === "ROOK") continue;
      const card = cardFromId(cardId);
      if (card.kind === "regular") colorCounts[card.color]++;
    }
    let bestColor: Color = "Black";
    let bestCount = -1;
    for (const color of COLORS) {
      if (colorCounts[color] > bestCount) {
        bestCount = colorCounts[color];
        bestColor = color;
      }
    }
    const cmd = selectCommands.find((c) => c.type === "SelectTrump" && c.color === bestColor);
    return cmd ?? selectCommands[0]!;
  }

  // High trump management (>= 0.7): weight by point value
  const colorWeights: Record<Color, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
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
  const cmd = selectCommands.find((c) => c.type === "SelectTrump" && c.color === bestColor);
  return cmd ?? selectCommands[0]!;
}

// ── Phase 6: Endgame nest value ───────────────────────────────────────────────

function nestPointValue(state: GameState): number {
  return state.originalNest.reduce((sum, c) => sum + pointValue(c), 0);
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
  const isBiddingTeam = state.bidder !== null && SEAT_TEAM[seat] === SEAT_TEAM[state.bidder];

  // ── Phase 6: Endgame awareness ────────────────────────────────────────────
  if (profile.endgameCardAwareness >= 0.5 && state.tricksPlayed >= 7) {
    const nestVal = nestPointValue(state);
    if (nestVal > 15) {
      // Trick 10 (tricksPlayed >= 9): lead highest-value card
      if (state.tricksPlayed >= 9) {
        // Lead the highest-value card (point value first, then off-suit rank)
        return playCommands.reduce((best, cmd) => {
          if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
          const cmpPts = pointValue(cmd.cardId) - pointValue(best.cardId);
          if (cmpPts !== 0) return cmpPts > 0 ? cmd : best;
          return offSuitRank(cmd.cardId) > offSuitRank(best.cardId) ? cmd : best;
        });
      }

      // Tricks 7–8: preserve strong trump/ace for trick 10
      if (isBiddingTeam && state.tricksPlayed < 9) {
        // Prefer leading a non-trump, non-ace card to preserve the strong card
        const nonTrumpNonAce = playCommands.filter((c) => {
          if (c.type !== "PlayCard") return false;
          if (trump !== null && trumpRank(c.cardId, trump) >= 0) return false;
          const card = cardFromId(c.cardId);
          if (card.kind === "regular" && (card.value === 1 || card.value === 14)) return false;
          return true;
        });
        if (nonTrumpNonAce.length > 0) {
          // Lead lowest-ranked among these to preserve strong ones
          return nonTrumpNonAce.reduce((best, cmd) => {
            if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
            return offSuitRank(cmd.cardId) < offSuitRank(best.cardId) ? cmd : best;
          });
        }
        // No non-trump non-ace available — fall through to role logic
      }

      if (!isBiddingTeam && state.tricksPlayed < 9) {
        // Defending team: also save strong card for trick 10
        const nonTrumpNonAce = playCommands.filter((c) => {
          if (c.type !== "PlayCard") return false;
          if (trump !== null && trumpRank(c.cardId, trump) >= 0) return false;
          const card = cardFromId(c.cardId);
          if (card.kind === "regular" && (card.value === 1 || card.value === 14)) return false;
          return true;
        });
        if (nonTrumpNonAce.length > 0) {
          return nonTrumpNonAce.reduce((best, cmd) => {
            if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
            return offSuitRank(cmd.cardId) < offSuitRank(best.cardId) ? cmd : best;
          });
        }
      }
    }
  }

  // ── Phase 4: Role-aware leading ───────────────────────────────────────────
  if (profile.roleAwareness && trump !== null) {

    // Count played trump cards to determine if trump is "pulled"
    let trumpPlayedCount = 0;
    if (profile.trackPlayedCards) {
      for (const cardId of state.playedCards) {
        if (trumpRank(cardId, trump) >= 0) trumpPlayedCount++;
      }
    }
    const trumpPulled = trumpPlayedCount >= 9;

    // Partition hand into trump / non-trump
    const trumpCards = playCommands.filter((c) => {
      if (c.type !== "PlayCard") return false;
      return trumpRank(c.cardId, trump) >= 0;
    });
    const nonTrumpCards = playCommands.filter((c) => {
      if (c.type !== "PlayCard") return false;
      return trumpRank(c.cardId, trump) < 0;
    });

    if (isBiddingTeam) {
      // ── Bidding team: pull trump or lead high off-suit ──────────────────
      if (!trumpPulled && trumpCards.length > 0) {
        // Lead highest trump — but respect ROOK-management rule
        const nonRookTrump = trumpCards.filter(c => c.type === "PlayCard" && c.cardId !== "ROOK");
        const candidates = nonRookTrump.length > 0 ? nonRookTrump : trumpCards;
        return candidates.reduce((best, cmd) => {
          if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
          return trumpRank(cmd.cardId, trump) > trumpRank(best.cardId, trump) ? cmd : best;
        });
      }
      // Trump pulled or no trump — lead highest off-suit card
      const offSuitCandidates = nonTrumpCards.length > 0 ? nonTrumpCards : playCommands;
      return offSuitCandidates.reduce((best, cmd) => {
        if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
        return offSuitRank(cmd.cardId) > offSuitRank(best.cardId) ? cmd : best;
      });
    } else {
      // ── Defending team ──────────────────────────────────────────────────
      // Do not lead trump before trick 7 unless bot has ONLY trump cards
      const onlyHasTrump = nonTrumpCards.length === 0;
      const canLeadTrump = state.tricksPlayed >= 7 || onlyHasTrump;

      if (nonTrumpCards.length > 0) {
        // Lead from longest side suit (most cards in a single non-trump color)
        const colorGroups: Record<Color, GameCommand[]> = {
          Black: [], Red: [], Green: [], Yellow: [],
        };
        for (const cmd of nonTrumpCards) {
          if (cmd.type !== "PlayCard") continue;
          const card = cardFromId(cmd.cardId);
          if (card.kind === "regular") colorGroups[card.color].push(cmd);
        }
        let longestColor: Color = "Black";
        let longestCount = -1;
        for (const color of COLORS) {
          if (colorGroups[color].length > longestCount) {
            longestCount = colorGroups[color].length;
            longestColor = color;
          }
        }
        const suitCards = colorGroups[longestColor];
        if (suitCards.length > 0) {
          // Lead lowest in suit to exhaust (or highest — lead a strong card)
          return suitCards.reduce((best, cmd) => {
            if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
            return offSuitRank(cmd.cardId) > offSuitRank(best.cardId) ? cmd : best;
          });
        }
      }

      if (canLeadTrump && trumpCards.length > 0) {
        // Lead lowest trump
        return trumpCards.reduce((best, cmd) => {
          if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
          return trumpRank(cmd.cardId, trump) < trumpRank(best.cardId, trump) ? cmd : best;
        });
      }

      // Fallback: play any legal card
      if (nonTrumpCards.length > 0) {
        return nonTrumpCards.reduce((best, cmd) => {
          if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
          return offSuitRank(cmd.cardId) > offSuitRank(best.cardId) ? cmd : best;
        });
      }
    }
  }

  // ── Default lead logic (no role awareness or trump not set) ───────────────
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

  // No trump cards — play highest off-suit card
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

  const myTeam = SEAT_TEAM[seat];
  const partnerIsWinning = SEAT_TEAM[currentWinnerPlay.seat] === myTeam;

  // sluffStrategy + partner is winning: dump highest point card
  if (profile.sluffStrategy && partnerIsWinning) {
    return chooseHighestPointCard(playCommands);
  }

  // Find winning cards
  const winningCommands = playCommands.filter((c) => {
    if (c.type !== "PlayCard") return false;
    return compareTrickCards(c.cardId, currentWinnerPlay.cardId, leadColor, trump) > 0;
  });

  // ── Phase 4: ROOK burning avoidance (defending team, early game) ──────────
  if (profile.roleAwareness && profile.trumpManagement >= 0.7 && winningCommands.length > 0) {
    const isBiddingTeam =
      state.bidder !== null && SEAT_TEAM[seat] === SEAT_TEAM[state.bidder];
    if (!isBiddingTeam && state.tricksPlayed < 5) {
      // Check if ROOK is the only winning card
      const rookWins = winningCommands.some(c => c.type === "PlayCard" && c.cardId === "ROOK");
      const nonRookWins = winningCommands.filter(c => c.type === "PlayCard" && c.cardId !== "ROOK");
      if (rookWins && nonRookWins.length === 0) {
        // ROOK is the only winning card — prefer to lose the trick instead
        const losingCards = playCommands.filter((c) => {
          if (c.type !== "PlayCard") return false;
          return compareTrickCards(c.cardId, currentWinnerPlay.cardId, leadColor, trump) <= 0;
        });
        if (losingCards.length > 0) {
          return chooseLowestCard(losingCards);
        }
      }
    }
  }

  if (winningCommands.length > 0) {
    // Play the cheapest winning card
    return chooseLowestWinningCard(winningCommands, leadColor, trump);
  }

  // Cannot win — shed lowest-cost card
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
  return winningCommands.reduce((best, cmd) => {
    if (cmd.type !== "PlayCard" || best.type !== "PlayCard") return best;
    return compareTrickCards(cmd.cardId, best.cardId, leadColor, trump) < 0 ? cmd : best;
  });
}

function chooseLowestCard(playCommands: GameCommand[]): GameCommand {
  const nonPointCards = playCommands.filter((c) => {
    if (c.type !== "PlayCard") return false;
    return pointValue(c.cardId) === 0;
  });

  if (nonPointCards.length > 0) {
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
