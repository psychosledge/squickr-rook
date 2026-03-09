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

export type HandLogEntry = {
  handNumber: number;
  timestamp: string;
  dealer: Seat;
  trump: Color;
  botDifficulties: Partial<Record<Seat, BotDifficulty>>;
  bidSequence: BidSequenceEntry[];
  finalBidder: Seat;
  finalBidAmount: number;
  moonAttempted: boolean;
  moonMade: boolean;
  nestCards: CardId[];
  discardedCards: CardId[];
  discardAnnotations: DiscardAnnotation[];
  trumpAnnotation: TrumpAnnotation | null;
  tricks: TrickLog[];
  score: import("@rook/engine").HandScore;
  scoresAfter: { NS: number; EW: number };
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

  onHandStart(timestamp: number): void {
    this.handStartedAt = timestamp;
    this.pendingAnnotations = [];
  }

  onBotDecision(annotation: BotDecisionAnnotation): void {
    this.pendingAnnotations.push(annotation);
  }

  onHandComplete(gameState: GameState): void {
    const entry = this._buildHandLogEntry(gameState);
    this._printHandSummary(entry);
    this.log.push(entry);
    this.pendingAnnotations = [];
  }

  getLog(): HandLogEntry[] {
    return JSON.parse(JSON.stringify(this.log)) as HandLogEntry[];
  }

  clearLog(): void {
    this.log = [];
    this.pendingAnnotations = [];
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

    // Build bid sequence
    const bidSequence: BidSequenceEntry[] = [];
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
      bidSequence.push({
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
      bidSequence,
      finalBidder: score.bidder,
      finalBidAmount: score.bidAmount,
      moonAttempted: score.shotMoon,
      moonMade: score.shotMoon && !score.moonShooterWentSet,
      nestCards: score.nestCards,
      discardedCards: score.discarded,
      discardAnnotations,
      trumpAnnotation,
      tricks,
      score,
      scoresAfter: { NS: gameState.scores.NS, EW: gameState.scores.EW },
      durationMs,
    };
  }

  private _printHandSummary(entry: HandLogEntry): void {
    const { handNumber, dealer, trump, bidSequence, tricks, score, scoresAfter, durationMs } = entry;

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
    const bidParts = bidSequence.map((entry) => {
      const seatLabel = `${entry.seat}`;
      const diffLabel = entry.isHuman
        ? ""
        : entry.annotation
          ? `(${DIFFICULTY_LABELS[entry.annotation.difficulty]})`
          : "";
      const label = entry.isHuman ? `${seatLabel}(you)` : `${seatLabel}${diffLabel}`;
      const bidStr = entry.bid === "moon" ? "MOON" : entry.bid === "pass" ? "pass" : String(entry.bid);

      if (entry.isHuman || !entry.annotation) {
        return `${label}: ${bidStr}`;
      }
      const ann = entry.annotation;
      const bonusStr = ann.partnerCeilingBonus > 0 ? ` +${ann.partnerCeilingBonus}` : " +0";
      return `${label}: ${bidStr} [est:${Math.round(ann.estimatedHandValue)} ceil:${ann.ceiling}${bonusStr}]`;
    });

    // Trump annotation line
    const trumpLine = entry.trumpAnnotation
      ? `${entry.trumpAnnotation.seat} trump: ${trump} (${entry.trumpAnnotation.strategy})`
      : `trump: ${trump}`;

    // Nest/discard line
    const nestStr = entry.nestCards.join(" ");
    const discardStr = entry.discardedCards.join(" ");

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
    const nsWasScore = scoresAfter.NS - score.nsDelta;
    const ewWasScore = scoresAfter.EW - score.ewDelta;
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
    onHandStart: (ts) => gameLogger.onHandStart(ts),
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
