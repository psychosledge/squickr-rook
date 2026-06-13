/**
 * simulate.ts — Deterministic bot-vs-bot simulation harness
 *
 * Runs N games at Expert difficulty (BOT_PRESETS[5]) and emits NDJSON output
 * where each line is a GameRecord as defined in types.ts.
 *
 * Usage:
 *   pnpm --filter engine simulate [--games N] [--seed N] [--out path]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { applyEvent, INITIAL_STATE } from "../src/reducer.js";
import { validateCommand } from "../src/validator.js";
import { botChooseCommand } from "../src/bot.js";
import { pointValue } from "../src/scoring.js";
import {
  BOT_PRESETS,
  DEFAULT_RULES,
  SEAT_ORDER,
} from "../src/types.js";
import type {
  GameRecord,
  GameState,
  HandScore,
  Seat,
  Team,
  TrickPlay,
  TrickSnapshot,
} from "../src/types.js";
import type { GameStarted } from "../src/events.js";

// ── Seeded PRNG (xorshift32) ──────────────────────────────────────────────────
//
// Bidding in bot.ts calls Math.random() for fraction-based opening bids and
// jump-raise decisions. To make the harness fully reproducible across process
// restarts we seed Math.random with a deterministic PRNG before each game.
// This only affects the simulation process — production code is unchanged.

function makeXorshift32(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 1; // xorshift32 must not have state 0
  return function (): number {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0; // keep as unsigned 32-bit
    return s / 0x1_0000_0000; // map to [0, 1)
  };
}

function seedMathRandom(gameSeed: number): void {
  const rng = makeXorshift32(gameSeed);
  // Replace Math.random for the duration of this game's simulation.
  // The harness is single-threaded, so this is safe.
  (Math as any).random = rng;
}

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs(): { games: number; seed: number; out: string } {
  const args = process.argv.slice(2);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const defaultOut = path.join(__dirname, "output", "simulation-results.ndjson");

  let games = 100;
  let seed = 12345;
  let out = defaultOut;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];
    if (flag === "--games" && next !== undefined) {
      games = parseInt(next, 10);
      i++;
    } else if (flag === "--seed" && next !== undefined) {
      seed = parseInt(next, 10);
      i++;
    } else if (flag === "--out" && next !== undefined) {
      // Resolve relative paths from the invoker's cwd, not the package root
      out = path.isAbsolute(next) ? next : path.resolve(process.cwd(), next);
      i++;
    }
  }

  if (!Number.isInteger(games) || games < 1) {
    console.error(`Error: --games must be a positive integer (got "${process.argv[process.argv.indexOf("--games") + 1]}")`);
    process.exit(1);
  }
  if (!Number.isInteger(seed)) {
    console.error(`Error: --seed must be an integer (got "${process.argv[process.argv.indexOf("--seed") + 1]}")`);
    process.exit(1);
  }

  return { games, seed, out };
}

// ── Point-value helpers ───────────────────────────────────────────────────────

function trickPoints(cardIds: string[]): number {
  return cardIds.reduce((sum, id) => sum + pointValue(id), 0);
}

function capturedPoints(capturedCards: Record<Team, string[]>): Record<Team, number> {
  return {
    NS: trickPoints(capturedCards.NS),
    EW: trickPoints(capturedCards.EW),
  };
}

// ── Single-game simulation ────────────────────────────────────────────────────

function simulateGame(gameIndex: number, dealSeed: number): GameRecord {
  const gameId = `game-${String(gameIndex).padStart(4, "0")}`;

  // Build 4-bot PlayerInfo array using Expert preset
  const expertProfile = BOT_PRESETS[5];
  const players = SEAT_ORDER.map((seat: Seat) => ({
    seat,
    name: `Bot-${seat}`,
    kind: "bot" as const,
    botProfile: expertProfile,
  }));

  // Initialise: dispatch GameStarted
  const startEvent: GameStarted = {
    type: "GameStarted",
    seed: dealSeed,
    dealer: "N",
    players,
    rules: DEFAULT_RULES,
    timestamp: 0,
  };

  let state: GameState = applyEvent(INITIAL_STATE, startEvent);

  // Trick-capture state
  const transcript: TrickSnapshot[] = [];

  // In-progress snapshot fields
  let currentTrickPlays: TrickPlay[] = [];
  let handsAtTrickStart: Record<Seat, string[]> | null = null;
  let prevTricksPlayed = state.tricksPlayed;

  // Track the last HandScore emitted by HandScored events
  let lastHandScore: HandScore | null = null;

  // ── Game loop ─────────────────────────────────────────────────────────────

  while (state.phase !== "finished") {
    const seat = state.activePlayer;
    if (seat === null) {
      throw new Error(`[simulate] activePlayer is null in phase "${state.phase}" (game ${gameId})`);
    }

    const command = botChooseCommand(state, seat, expertProfile);

    // Capture trick-start snapshot before the first card of each trick
    if (
      state.phase === "playing" &&
      command.type === "PlayCard" &&
      state.currentTrick.length === 0
    ) {
      // Deep-copy each hand so later mutations don't corrupt the snapshot
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

    // Record TrickPlay before applying events (hand still includes the card)
    if (state.phase === "playing" && command.type === "PlayCard" && handsAtTrickStart !== null) {
      const trickPlay: TrickPlay = {
        seat,
        cardId: command.cardId,
        handAtTrickStart: handsAtTrickStart[seat]!,
      };
      currentTrickPlays.push(trickPlay);
    }

    // Apply events
    for (const event of result.events) {
      state = applyEvent(state, event);

      // Capture HandScore when the hand is scored
      if (event.type === "HandScored") {
        lastHandScore = event.score;
      }
    }

    // Detect trick completion: tricksPlayed incremented
    if (state.tricksPlayed > prevTricksPlayed && handsAtTrickStart !== null) {
      const completedTrick = state.completedTricks[state.completedTricks.length - 1];
      if (completedTrick === undefined) {
        throw new Error(`[simulate] completedTricks empty after tricksPlayed increment (game ${gameId})`);
      }

      const pointsInTrick = trickPoints(completedTrick.plays.map((p) => p.cardId));
      const cumulativeScore = capturedPoints(state.capturedCards);

      // leadSeat is the seat that played the first card in the trick
      const leadSeat = completedTrick.plays[0]?.seat ?? seat;

      // trump is always set when playing phase is active
      const trump = state.trump!;

      const snapshot: TrickSnapshot = {
        trickNumber: state.tricksPlayed, // already incremented — equals 1-based trick index
        leadSeat,
        trump,
        handsAtTrickStart: handsAtTrickStart as Record<Seat, string[]>,
        plays: currentTrickPlays,
        winner: completedTrick.winner,
        pointsInTrick,
        cumulativeScore,
      };

      transcript.push(snapshot);

      // Reset for next trick
      handsAtTrickStart = null;
      currentTrickPlays = [];
      prevTricksPlayed = state.tricksPlayed;
    }
  }

  if (lastHandScore === null) {
    throw new Error(`[simulate] No HandScored event seen in game ${gameId}`);
  }

  return {
    gameId,
    dealSeed,
    handNumber: 0,
    transcript,
    outcome: lastHandScore,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const { games, seed: baseSeed, out } = parseArgs();

  // Ensure output directory exists
  const outDir = path.dirname(out);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(out, { encoding: "utf8" });

  let totalTricks = 0;
  let bidsMade = 0;
  let wentSet = 0;

  for (let k = 0; k < games; k++) {
    const dealSeed = baseSeed + k;
    // Seed Math.random before each game so bidding is also deterministic.
    // xorshift32 requires a non-zero seed; mix dealSeed with a constant to
    // avoid a zero-seed if dealSeed itself is 0.
    seedMathRandom(dealSeed ^ 0xdeadbeef);
    const record = simulateGame(k, dealSeed);

    writeStream.write(JSON.stringify(record) + "\n");

    totalTricks += record.transcript.length;

    const { outcome } = record;
    const bidderTeam: Team = outcome.bidder === "N" || outcome.bidder === "S" ? "NS" : "EW";
    const bidderTotal = bidderTeam === "NS" ? outcome.nsTotal : outcome.ewTotal;
    if (bidderTotal >= outcome.bidAmount) {
      bidsMade++;
    } else {
      wentSet++;
    }
  }

  writeStream.end();

  // Summary to stdout
  console.log(`Games completed:   ${games}`);
  console.log(`Total tricks:      ${totalTricks}`);
  console.log(`Bids made:         ${bidsMade}`);
  console.log(`Went set:          ${wentSet}`);
  console.log(`Output:            ${out}`);
}

main();
