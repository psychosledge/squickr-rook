import { applyEvent, INITIAL_STATE } from "../src/reducer.js";
import { validateCommand } from "../src/validator.js";
import { botChooseCommand } from "../src/bot.js";
import { pointValue } from "../src/scoring.js";
import { makeXorshift32, type Rng } from "../src/rng.js";
import {
  BOT_PRESETS,
  DEFAULT_RULES,
  SEAT_ORDER,
} from "../src/types.js";
import type {
  BidEntry,
  GameRecord,
  GameState,
  HandScore,
  Seat,
  Team,
  TrickPlay,
  TrickSnapshot,
} from "../src/types.js";
import type { GameStarted } from "../src/events.js";

function trickPoints(cardIds: string[]): number {
  return cardIds.reduce((sum, id) => sum + pointValue(id), 0);
}

function capturedPoints(capturedCards: Record<Team, string[]>): Record<Team, number> {
  return {
    NS: trickPoints(capturedCards.NS),
    EW: trickPoints(capturedCards.EW),
  };
}

export function simulateGame(gameIndex: number, dealSeed: number, rng: Rng): GameRecord {
  const gameId = `game-${String(gameIndex).padStart(4, "0")}`;

  const expertProfile = BOT_PRESETS[5];
  const players = SEAT_ORDER.map((seat: Seat) => ({
    seat,
    name: `Bot-${seat}`,
    kind: "bot" as const,
    botProfile: expertProfile,
  }));

  const startEvent: GameStarted = {
    type: "GameStarted",
    seed: dealSeed,
    dealer: "N",
    players,
    rules: DEFAULT_RULES,
    timestamp: 0,
  };

  let state: GameState = applyEvent(INITIAL_STATE, startEvent);

  const bidHistory: BidEntry[] = [];
  const transcript: TrickSnapshot[] = [];
  let currentTrickPlays: TrickPlay[] = [];
  let handsAtTrickStart: Record<Seat, string[]> | null = null;
  let lastHandScore: HandScore | null = null;

  while (lastHandScore === null) {
    const seat = state.activePlayer;
    if (seat === null) {
      throw new Error(`[simulate] activePlayer is null in phase "${state.phase}" (game ${gameId})`);
    }

    const command = botChooseCommand(state, seat, expertProfile, rng);

    if (
      state.phase === "playing" &&
      command.type === "PlayCard" &&
      state.currentTrick.length === 0
    ) {
      handsAtTrickStart = {
        N: [...state.hands.N],
        E: [...state.hands.E],
        S: [...state.hands.S],
        W: [...state.hands.W],
      };
      currentTrickPlays = [];
    }

    const result = validateCommand(state, command, state.rules);
    if (!result.ok) {
      throw new Error(
        `[simulate] Invalid bot command in game ${gameId}, phase "${state.phase}", seat ${seat}: ${result.error}`,
      );
    }

    if (state.phase === "playing" && command.type === "PlayCard" && handsAtTrickStart !== null) {
      const trickPlay: TrickPlay = {
        seat,
        cardId: command.cardId,
        handAtTrickStart: handsAtTrickStart[seat]!,
      };
      currentTrickPlays.push(trickPlay);
    }

    for (const event of result.events) {
      state = applyEvent(state, event);

      if (event.type === "BidPlaced") {
        bidHistory.push({ seat: event.seat, bid: event.amount });
      } else if (event.type === "BidPassed") {
        bidHistory.push({ seat: event.seat, bid: "pass" });
      } else if (event.type === "MoonDeclared") {
        bidHistory.push({ seat: event.seat, bid: event.amount });
      } else if (event.type === "TrickCompleted" && handsAtTrickStart !== null) {
        const completedTrick = state.completedTricks[state.completedTricks.length - 1];
        if (completedTrick === undefined) {
          throw new Error(`[simulate] completedTricks empty after TrickCompleted (game ${gameId})`);
        }

        const pointsInTrick = trickPoints(completedTrick.plays.map((p) => p.cardId));
        const cumulativeScore = capturedPoints(state.capturedCards);
        const leadSeat = completedTrick.plays[0]?.seat ?? seat;
        const trump = state.trump!;

        const snapshot: TrickSnapshot = {
          trickNumber: state.tricksPlayed,
          leadSeat,
          trump,
          handsAtTrickStart: handsAtTrickStart as Record<Seat, string[]>,
          plays: currentTrickPlays,
          winner: completedTrick.winner,
          pointsInTrick,
          cumulativeScore,
        };

        transcript.push(snapshot);
        handsAtTrickStart = null;
        currentTrickPlays = [];
      } else if (event.type === "HandScored") {
        lastHandScore = event.score;
      }
    }
  }

  return {
    gameId,
    dealSeed,
    handNumber: state.handNumber,
    bidHistory,
    transcript,
    outcome: lastHandScore,
  };
}

export function botRngFor(dealSeed: number): Rng {
  return makeXorshift32(dealSeed ^ 0xdeadbeef);
}

export function simulateGames(games: number, baseSeed: number): GameRecord[] {
  const records: GameRecord[] = [];
  for (let k = 0; k < games; k++) {
    const dealSeed = baseSeed + k;
    records.push(simulateGame(k, dealSeed, botRngFor(dealSeed)));
  }
  return records;
}

export function toNdjsonLine(record: GameRecord): string {
  return JSON.stringify(record) + "\n";
}
