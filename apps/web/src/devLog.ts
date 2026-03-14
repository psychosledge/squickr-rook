/**
 * DEV-ONLY full game logging system.
 *
 * This module is NEVER imported in production builds.
 * It is loaded exclusively via the `if (import.meta.env.DEV)` dynamic import
 * in main.tsx, which Vite tree-shakes out of production bundles entirely.
 *
 * Usage (browser DevTools console):
 *   window.__rookLog.getLog()      // returns full HandLogEntry[]
 *   window.__rookLog.clearLog()    // clears the log
 *   window.__rookLog.downloadLog() // downloads as JSON file
 */

import type {
  CardId,
  Color,
  GameState,
  Seat,
  BotDifficulty,
} from "@rook/engine";
import { pointValue, cardFromId } from "@rook/engine";
import { useGameStore } from "./store/gameStore";

// ── Annotation types ──────────────────────────────────────────────────────────

export type BiddingAnnotation = {
  phase: "bidding";
  seat: Seat;
  difficulty: BotDifficulty;
  trueHandValue: number;
  estimatedHandValue: number;
  ceiling: number;
  minNextBid: number;
  partnerBid: number | "pass" | null;
  partnerHoldsBid: boolean;
  partnerCeilingBonus: number;
  moonShootAttempted: boolean;
  decision: number | "pass";
};

export type DiscardAnnotation = {
  phase: "discard";
  seat: Seat;
  difficulty: BotDifficulty;
  probableTrump: Color;
  voidTargetSuits: Color[];
  cardDiscarded: CardId;
};

export type TrumpAnnotation = {
  phase: "trump";
  seat: Seat;
  difficulty: BotDifficulty;
  strategy: "count-only" | "weighted";
  chosenTrump: Color;
};

export type PlayReason =
  | "random"
  | "pull_trump"
  | "avoid_trump_lead"
  | "longest_suit"
  | "sluff_to_partner"
  | "rook_burn_avoided"
  | "endgame_lead"
  | "lowest_winning"
  | "lowest_losing"
  | "default_lead";

export type PlayAnnotation = {
  phase: "playing";
  seat: Seat;
  difficulty: BotDifficulty | null;
  trickIndex: number;
  leadOrFollow: "lead" | "follow";
  trumpPulled: boolean;
  isBiddingTeam: boolean;
  teamPointsCaptured: number;
  cardChosen: CardId;
  reasoning: PlayReason | "human";
};

export type BotDecisionAnnotation =
  | BiddingAnnotation
  | DiscardAnnotation
  | TrumpAnnotation
  | PlayAnnotation;

// ── Hand log types ────────────────────────────────────────────────────────────

export type TrickPlayLog = {
  seat: Seat;
  cardId: CardId;
  isHuman: boolean;
  annotation: PlayAnnotation | null;
};

export type TrickLog = {
  trickIndex: number;
  leadColor: Color | null;
  plays: TrickPlayLog[];
  winner: Seat;
  pointCards: CardId[];
};

export type BidSequenceEntry = {
  seat: Seat;
  bid: number | "pass" | "moon";
  isHuman: boolean;
  annotation: BiddingAnnotation | null;
};

export type BidAction = "place" | "pass" | "moon" | "forced";

export type BidEvent = {
  seat: Seat;
  isHuman: boolean;
  action: BidAction;
  amount: number | null;        // null for pass/forced-pass
  standingBid: number;          // the current high bid at the moment this action is recorded
  round: number;                // 1-based: increments when we wrap back to the dealer's seat
  annotation: BiddingAnnotation | null;  // null for human and forced bids
};

export type HandLogEntry = {
  handNumber: number;
  timestamp: string;
  dealer: Seat;
  trump: Color;
  botDifficulties: Partial<Record<Seat, BotDifficulty>>;
  auctionEvents: BidEvent[];         // chronological real-time events
  auctionRounds: number;             // derived from auctionEvents
  bidSummary: BidSequenceEntry[];    // renamed from bidSequence
  finalBidder: Seat;
  finalBidAmount: number;
  moonAttempted: boolean;
  moonMade: boolean;
  nestCards: CardId[];
  bidWinnerDiscards: CardId[];
  startingHands: Record<Seat, CardId[]>;
  discardAnnotations: DiscardAnnotation[];
  trumpAnnotation: TrumpAnnotation | null;
  tricks: TrickLog[];
  score: import("@rook/engine").HandScore;
  scoresAfter: { NS: number; EW: number };
  scoresBefore: { NS: number; EW: number };  // cumulative scores at hand start
  durationMs: number;
};

// ── Difficulty label map ──────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  1: "Beginner",
  2: "Easy",
  3: "Normal",
  4: "Hard",
  5: "Expert",
};

const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];

// ── GameLogger class ──────────────────────────────────────────────────────────

export class GameLogger {
  private log: HandLogEntry[] = [];
  private pendingAnnotations: BotDecisionAnnotation[] = [];
  private handStartedAt: number = Date.now();
  private startingHands: Record<Seat, CardId[]> = { N: [], E: [], S: [], W: [] };
  private pendingBidEvents: BidEvent[] = [];
  private scoresBefore: { NS: number; EW: number } = { NS: 0, EW: 0 };
  private bidRound: number = 1;
  private firstBidderThisRound: Seat | null = null;

  onHandStart(timestamp: number, gameState: GameState): void {
    this.handStartedAt = timestamp;
    this.pendingAnnotations = [];
    this.pendingBidEvents = [];
    this.bidRound = 1;
    this.firstBidderThisRound = null;
    this.scoresBefore = { NS: gameState.scores.NS, EW: gameState.scores.EW };
    // Deep-copy all 4 players' starting hands at deal time
    this.startingHands = {
      N: [...(gameState.hands.N ?? [])],
      E: [...(gameState.hands.E ?? [])],
      S: [...(gameState.hands.S ?? [])],
      W: [...(gameState.hands.W ?? [])],
    };
  }

  onBotDecision(annotation: BotDecisionAnnotation): void {
    this.pendingAnnotations.push(annotation);
  }

  onBidEvent(event: BidEvent): void {
    // Round tracking: increment when the first bidder's seat repeats
    if (this.firstBidderThisRound === null) {
      this.firstBidderThisRound = event.seat;
    } else if (event.seat === this.firstBidderThisRound) {
      this.bidRound++;
    }
    // Override round on the event before pushing
    const withRound: BidEvent = { ...event, round: this.bidRound };
    this.pendingBidEvents.push(withRound);
  }

  onHandComplete(gameState: GameState): void {
    const entry = this._buildHandLogEntry(gameState);
    this._printHandSummary(entry);
    this.log.push(entry);
    this.pendingAnnotations = [];
    this.pendingBidEvents = [];
  }

  getLog(): HandLogEntry[] {
    return JSON.parse(JSON.stringify(this.log)) as HandLogEntry[];
  }

  clearLog(): void {
    this.log = [];
    this.pendingAnnotations = [];
    this.pendingBidEvents = [];
    this.bidRound = 1;
    this.firstBidderThisRound = null;
  }

  downloadLog(): void {
    const json = JSON.stringify(this.log, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rook-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _buildHandLogEntry(gameState: GameState): HandLogEntry {
    const score = gameState.handHistory[gameState.handHistory.length - 1]!;
    const durationMs = Date.now() - this.handStartedAt;

    // Build tricks
    const tricks: TrickLog[] = gameState.completedTricks.map((trick, idx) => {
      const plays: TrickPlayLog[] = trick.plays.map((play) => {
        const isHuman = gameState.players.find((p) => p.seat === play.seat)?.kind === "human";
        const annotation = this.pendingAnnotations.find(
          (a): a is PlayAnnotation =>
            a.phase === "playing" &&
            a.seat === play.seat &&
            a.trickIndex === idx,
        ) ?? null;
        return {
          seat: play.seat,
          cardId: play.cardId,
          isHuman: isHuman ?? false,
          annotation: isHuman ? null : annotation,
        };
      });

      const pointCards = trick.plays
        .map((p) => p.cardId)
        .filter((cId) => pointValue(cId) > 0);

      return {
        trickIndex: idx,
        leadColor: trick.leadColor,
        plays,
        winner: trick.winner,
        pointCards,
      };
    });

    // Build bid summary
    const bidSummary: BidSequenceEntry[] = [];
    for (const seat of SEAT_ORDER) {
      const bid = gameState.bids[seat];
      if (bid === null) continue;
      const isHuman = gameState.players.find((p) => p.seat === seat)?.kind === "human";
      const isMoon = gameState.moonShooters.includes(seat);
      const bidValue: number | "pass" | "moon" =
        isMoon ? "moon" : bid === "pass" ? "pass" : bid;
      const annotation = this.pendingAnnotations.find(
        (a): a is BiddingAnnotation => a.phase === "bidding" && a.seat === seat,
      ) ?? null;
      bidSummary.push({
        seat,
        bid: bidValue,
        isHuman: isHuman ?? false,
        annotation: isHuman ? null : annotation,
      });
    }

    // Pull discard annotations
    const discardAnnotations = this.pendingAnnotations.filter(
      (a): a is DiscardAnnotation => a.phase === "discard",
    );

    // Pull trump annotation
    const trumpAnnotation = this.pendingAnnotations.find(
      (a): a is TrumpAnnotation => a.phase === "trump",
    ) ?? null;

    // Bot difficulties
    const botDifficulties: Partial<Record<Seat, BotDifficulty>> = {};
    for (const player of gameState.players) {
      if (player.kind === "bot" && player.botProfile) {
        botDifficulties[player.seat] = player.botProfile.difficulty;
      }
    }

    return {
      handNumber: gameState.handNumber,
      timestamp: new Date(this.handStartedAt).toISOString(),
      dealer: gameState.dealer,
      trump: gameState.trump ?? "Black",
      botDifficulties,
      auctionEvents: this.pendingBidEvents,
      auctionRounds: this.pendingBidEvents.length > 0
        ? Math.max(...this.pendingBidEvents.map((e) => e.round))
        : 0,
      bidSummary,
      finalBidder: score.bidder,
      finalBidAmount: score.bidAmount,
      moonAttempted: score.shotMoon,
      moonMade: score.shotMoon && !score.moonShooterWentSet,
      nestCards: score.nestCards,
      bidWinnerDiscards: score.discarded,
      startingHands: { ...this.startingHands },
      discardAnnotations,
      trumpAnnotation,
      tricks,
      score,
      scoresAfter: { NS: gameState.scores.NS, EW: gameState.scores.EW },
      scoresBefore: { ...this.scoresBefore },
      durationMs,
    };
  }

  private _printHandSummary(entry: HandLogEntry): void {
    const { handNumber, dealer, trump, bidSummary, tricks, score, scoresAfter, durationMs } = entry;

    const isTrumpCard = (cardId: CardId): boolean => {
      if (cardId === "ROOK") return true;
      const c = cardFromId(cardId);
      return c.kind === "regular" && c.color === trump;
    };
    const isPointCard = (cardId: CardId): boolean => pointValue(cardId) > 0;

    const formatCard = (cardId: CardId): string => {
      const t = isTrumpCard(cardId) ? "†" : "";
      const p = isPointCard(cardId) ? "★" : "";
      return `${t}${cardId}${p}`;
    };

    // Bidding line
    const bidParts = bidSummary.map((bidEntry) => {
      const seatLabel = `${bidEntry.seat}`;
      const diffLabel = bidEntry.isHuman
        ? ""
        : bidEntry.annotation
          ? `(${DIFFICULTY_LABELS[bidEntry.annotation.difficulty]})`
          : "";
      const label = bidEntry.isHuman ? `${seatLabel}(you)` : `${seatLabel}${diffLabel}`;
      const bidStr = bidEntry.bid === "moon" ? "MOON" : bidEntry.bid === "pass" ? "pass" : String(bidEntry.bid);

      if (bidEntry.isHuman || !bidEntry.annotation) {
        return `${label}: ${bidStr}`;
      }
      const ann = bidEntry.annotation;
      const bonusStr = ann.partnerCeilingBonus > 0 ? ` +${ann.partnerCeilingBonus}` : " +0";
      return `${label}: ${bidStr} [est:${Math.round(ann.estimatedHandValue)} ceil:${ann.ceiling}${bonusStr}]`;
    });

    // Trump annotation line
    const trumpLine = entry.trumpAnnotation
      ? `${entry.trumpAnnotation.seat} trump: ${trump} (${entry.trumpAnnotation.strategy})`
      : `trump: ${trump}`;

    // Nest/discard line
    const nestStr = entry.nestCards.join(" ");
    const discardStr = entry.bidWinnerDiscards.join(" ");

    // Tricks lines
    const trickLines = tricks.map((trick) => {
      const playsStr = trick.plays.map((play) => {
        const card = formatCard(play.cardId);
        if (play.isHuman) {
          return `${play.seat}:${card}[you]`;
        }
        const reason = play.annotation?.reasoning ?? "?";
        return `${play.seat}:${card}[${reason}]`;
      }).join("  ");
      return `  #${trick.trickIndex + 1}  ${playsStr}  → ${trick.winner}`;
    });

    // Score lines
    const nsWasScore = entry.scoresBefore.NS;
    const ewWasScore = entry.scoresBefore.EW;
    const nsSet = score.nsDelta < 0;
    const ewSet = score.ewDelta < 0;
    const nsDeltaStr = nsSet
      ? `SET ${score.nsDelta}`
      : `+${score.nsDelta}`;
    const ewDeltaStr = ewSet
      ? `SET ${score.ewDelta}`
      : `+${score.ewDelta}`;

    const nsScoreLine = `NS  pts:${score.nsTotal}  bid:${score.bidder === "N" || score.bidder === "S" ? score.bidAmount : "-"}  → ${nsDeltaStr}   (was ${nsWasScore} → now ${scoresAfter.NS})`;
    const ewScoreLine = `EW  pts:${score.ewTotal}  bid:${score.bidder === "E" || score.bidder === "W" ? score.bidAmount : "-"}  → ${ewDeltaStr}   (was ${ewWasScore} → now ${scoresAfter.EW})`;

    const durSec = (durationMs / 1000).toFixed(1);

    console.groupCollapsed(
      `%c[rookLog] Hand ${handNumber} — Dealer: ${dealer} — Trump: ${trump}`,
      "color: #34d399; font-weight: bold",
    );
    console.log(`  Bidding:  ${bidParts.join("  |  ")}`);
    console.log(`            → ${entry.finalBidder} bid ${entry.finalBidAmount}${entry.moonAttempted ? " (MOON)" : ""}`);
    console.log(`  Auction: ${entry.auctionRounds} round(s), ${entry.auctionEvents.length} actions`);
    console.log(`  Scores before: NS ${entry.scoresBefore.NS}  EW ${entry.scoresBefore.EW}`);

    // Starting hands section
    const startingHandsLines = SEAT_ORDER.map((seat) => {
      const cards = entry.startingHands[seat] ?? [];
      const handStr = cards.map(formatCard).join(" ");
      return `    ${seat}: ${handStr}`;
    }).join("\n");
    console.log(`\n  Starting Hands:\n${startingHandsLines}`);

    console.log(`\n  Nest: ${nestStr}    Discarded: ${discardStr}`);
    console.log(`  ${trumpLine}`);
    console.log(`\n  Tricks:`);
    trickLines.forEach((line) => console.log(line));
    console.log(`\n  Score:`);
    console.log(`    ${nsScoreLine}`);
    console.log(`    ${ewScoreLine}`);
    console.log(`  Duration: ${durSec}s`);
    console.groupEnd();
  }
}

export const gameLogger = new GameLogger();

type RookLogAPI = {
  getLog(): HandLogEntry[];
  clearLog(): void;
  downloadLog(): void;
};

export function registerLogger(): void {
  useGameStore.getState()._setLoggerCallbacks({
    onBotDecision: (a) => gameLogger.onBotDecision(a),
    onHandComplete: (gs) => gameLogger.onHandComplete(gs),
    onHandStart: (ts, gs) => gameLogger.onHandStart(ts, gs),
    onBidEvent: (e) => gameLogger.onBidEvent(e),
  });
  (window as Window & { __rookLog?: RookLogAPI }).__rookLog = {
    getLog: () => gameLogger.getLog(),
    clearLog: () => gameLogger.clearLog(),
    downloadLog: () => gameLogger.downloadLog(),
  };
  console.info(
    "%c[rookLog] registered",
    "color: #34d399",
    "→ window.__rookLog  { getLog(), clearLog(), downloadLog() }",
  );
}
