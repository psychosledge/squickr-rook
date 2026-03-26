import { create } from "zustand";
import type { AppStore } from "./gameStore.types";
import {
  INITIAL_STATE,
  DEFAULT_RULES,
  BOT_PRESETS,
  applyEvent,
  validateCommand,
  botChooseCommand,
  estimateHandValue,
  estimateHandValueWithNoise,
  computeBidCeiling,
  SEAT_TEAM,
  pointValue,
  cardFromId,
} from "@rook/engine";
import type { GameCommand, GameEvent, GameState, GameRules, Seat, BotProfile, CardId } from "@rook/engine";
import type { BotDecisionAnnotation, BiddingAnnotation, DiscardAnnotation, TrumpAnnotation, PlayAnnotation, PlayReason, BidAction, BidEvent } from "../devLog";
import { getSeatLabel } from "@/utils/seatLabel";

const HUMAN_SEAT: Seat = "N";

/** Returns the partner seat (opposite in N↔S, E↔W). */
function partnerOf(seat: Seat): Seat {
  switch (seat) {
    case "N": return "S";
    case "S": return "N";
    case "E": return "W";
    case "W": return "E";
  }
}

/**
 * Returns an announcement string for events that warrant one, or null otherwise.
 * Pure function — safe to test independently.
 */
function buildAnnouncementFromEvent(ev: GameEvent, _rules: GameRules): string | null {
  if (ev.type === "BiddingComplete") {
    const label = ev.winner === HUMAN_SEAT ? "You" : getSeatLabel(ev.winner);
    const moon = ev.shotMoon ? " — SHOOT THE MOON!" : "";
    return `${label} won the bid at ${ev.amount}${moon}`;
  }
  if (ev.type === "TrumpSelected") {
    const label = ev.seat === HUMAN_SEAT ? "You" : getSeatLabel(ev.seat);
    return `${label} chose ${ev.color} as trump`;
  }
  return null;
}

// ── Dev logging helpers ───────────────────────────────────────────────────────

/**
 * Infer the reasoning code for a bot's play decision (best-effort approximation).
 */
function _inferReasoning(
  state: GameState,
  seat: Seat,
  profile: BotProfile,
  cardId: CardId,
  isLeading: boolean,
  trumpPulled: boolean,
  isBiddingTeam: boolean,
): PlayReason {
  const trump = state.trump;
  const isTrump = (cId: CardId): boolean => {
    if (cId === "ROOK") return true;
    const c = cardFromId(cId);
    return c.kind === "regular" && trump !== null && c.color === trump;
  };

  if (isLeading) {
    if (profile.endgameCardAwareness >= 0.5 && state.tricksPlayed >= 7)
      return "endgame_lead";
    if (profile.roleAwareness && trump !== null) {
      if (isBiddingTeam && !trumpPulled && isTrump(cardId))
        return "pull_trump";
      if (!isBiddingTeam && !isTrump(cardId) && state.tricksPlayed < 7)
        return "avoid_trump_lead";
      if (!isBiddingTeam && state.tricksPlayed >= 7)
        return "longest_suit";
    }
    return "default_lead";
  } else {
    // Following
    const partnerSeat = partnerOf(seat);
    const partnerPlay = state.currentTrick.find((p) => p.seat === partnerSeat);
    if (profile.sluffStrategy && partnerPlay) {
      return "sluff_to_partner";
    }
    return isTrump(cardId) ? "lowest_winning" : "lowest_losing";
  }
}

/**
 * Build a BotDecisionAnnotation for the given command, or null if not applicable.
 */
function _buildAnnotation(
  state: GameState,
  seat: Seat,
  profile: BotProfile,
  command: GameCommand,
): BotDecisionAnnotation | null {
  switch (state.phase) {
    case "bidding": {
      const hand = state.hands[seat] ?? [];
      const rules = state.rules ?? DEFAULT_RULES;
      const minNextBid = state.currentBid === 0
        ? rules.minimumBid
        : state.currentBid + rules.bidIncrement;
      const partnerSeat = partnerOf(seat);
      const partnerBid = state.bids[partnerSeat];
      const partnerHoldsBid = state.bidder === partnerSeat;
      const trueVal = estimateHandValue(hand);
      const estVal = estimateHandValueWithNoise(hand, profile.handValuationAccuracy);
      const ceil = computeBidCeiling(hand, state, seat, profile);
      const partnerCeilingBonus = (!partnerHoldsBid && typeof partnerBid === "number" && partnerBid > 0)
        ? Math.max(0, Math.round((partnerBid - 100) * 0.3))
        : 0;
      return {
        phase: "bidding",
        seat,
        difficulty: profile.difficulty,
        trueHandValue: trueVal,
        estimatedHandValue: estVal,
        ceiling: ceil,
        minNextBid,
        partnerBid: partnerBid ?? null,
        partnerHoldsBid,
        partnerCeilingBonus,
        moonShootAttempted: command.type === "ShootMoon",
        decision: command.type === "PlaceBid" ? command.amount
          : command.type === "ShootMoon" ? "pass"
            : "pass",
      } satisfies BiddingAnnotation;
    }

    case "nest": {
      if (command.type !== "DiscardCard") return null;
      const hand = state.hands[seat] ?? [];
      const colorCounts: Record<string, number> = { Black: 0, Red: 0, Green: 0, Yellow: 0 };
      for (const cId of hand) {
        if (cId === "ROOK") continue;
        const c = cardFromId(cId);
        if (c.kind === "regular") colorCounts[c.color]++;
      }
      const sorted = (Object.entries(colorCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1]);
      const probableTrump = (sorted[0]?.[0] ?? "Black") as import("@rook/engine").Color;
      const voidTargets: import("@rook/engine").Color[] = [];
      const nonTrump = sorted.filter(([c]) => c !== probableTrump);
      if (nonTrump.length > 0 && profile.voidExploitation >= 0.5)
        voidTargets.push((nonTrump[nonTrump.length - 1]?.[0] ?? "Red") as import("@rook/engine").Color);
      if (nonTrump.length > 1 && profile.voidExploitation >= 0.8)
        voidTargets.push((nonTrump[nonTrump.length - 2]?.[0] ?? "Green") as import("@rook/engine").Color);
      return {
        phase: "discard",
        seat,
        difficulty: profile.difficulty,
        probableTrump,
        voidTargetSuits: voidTargets,
        cardDiscarded: command.cardId,
      } satisfies DiscardAnnotation;
    }

    case "trump": {
      if (command.type !== "SelectTrump") return null;
      return {
        phase: "trump",
        seat,
        difficulty: profile.difficulty,
        strategy: profile.trumpManagement >= 0.7 ? "weighted" : "count-only",
        chosenTrump: command.color,
      } satisfies TrumpAnnotation;
    }

    case "playing": {
      if (command.type !== "PlayCard") return null;
      const trump = state.trump;
      const trumpPlayedCount = trump !== null
        ? state.playedCards.filter((cId) => {
            if (cId === "ROOK") return true;
            const c = cardFromId(cId);
            return c.kind === "regular" && c.color === trump;
          }).length
        : 0;
      const trumpPulled = trumpPlayedCount >= 9;
      const isBiddingTeam = state.bidder !== null &&
        SEAT_TEAM[seat] === SEAT_TEAM[state.bidder];
      const myTeam = SEAT_TEAM[seat];
      const teamPointsCaptured = state.capturedCards[myTeam]
        .reduce((sum, cId) => sum + pointValue(cId), 0);
      const isLeading = state.currentTrick.length === 0;
      const reasoning = _inferReasoning(state, seat, profile, command.cardId, isLeading, trumpPulled, isBiddingTeam);
      return {
        phase: "playing",
        seat,
        difficulty: profile.difficulty,
        trickIndex: state.tricksPlayed,
        leadOrFollow: isLeading ? "lead" : "follow",
        trumpPulled,
        isBiddingTeam,
        teamPointsCaptured,
        cardChosen: command.cardId,
        reasoning,
      } satisfies PlayAnnotation;
    }

    default:
      return null;
  }
}

/**
 * Wrapper around botChooseCommand that fires a dev-log annotation callback
 * (if registered) without affecting the command itself.
 */
function _botChooseCommandWithLog(
  state: GameState,
  seat: Seat,
  profile: BotProfile,
  storeState: AppStore,
): GameCommand {
  const command = botChooseCommand(state, seat, profile);
  const cb = storeState._devOnBotDecision;

  const annotation = _buildAnnotation(state, seat, profile, command);
  if (cb && annotation) cb(annotation);

  // Fire bid event for bidding-phase commands
  const bidCb = storeState._devOnBidEvent;
  if (bidCb && state.phase === "bidding") {
    const action: BidAction =
      command.type === "PlaceBid" ? "place"
      : command.type === "ShootMoon" ? "moon"
      : "pass";
    const amount = command.type === "PlaceBid" ? command.amount : null;
    const bidEvent: BidEvent = {
      seat,
      isHuman: false,
      action,
      amount,
      standingBid: state.currentBid,
      round: 1, // placeholder — GameLogger.onBidEvent will override
      annotation: annotation?.phase === "bidding" ? annotation : null,
    };
    bidCb(bidEvent);
  }

  return command;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGameStore = create<AppStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  gameState: null,
  eventLog: [],
  overlay: "none",
  pendingDiscards: [],
  pendingHandScore: null,
  botTimeoutId: null,
  botDifficulties: { E: 3, S: 3, W: 3 },
  announcement: null,
  gameOverReason: null,
  historyModalOpen: false,
  biddingThinkingSeat: null,
  _devOnBotDecision: undefined,
  _devOnHandComplete: undefined,
  _devOnHandStart: undefined,
  _devOnBidEvent: undefined,

  // ── Actions ────────────────────────────────────────────────────────────────

  startGame: (difficulties) => {
    const { botTimeoutId } = get();
    if (botTimeoutId !== null) clearTimeout(botTimeoutId);

    const seed = Math.floor(Math.random() * 2 ** 31);

    const gameStartedEvent: GameEvent = {
      type: "GameStarted",
      seed,
      dealer: "N",
      players: [
        { seat: "N", name: "You",   kind: "human" },
        { seat: "E", name: "P2", kind: "bot", botProfile: BOT_PRESETS[difficulties.E] },
        { seat: "S", name: "P3", kind: "bot", botProfile: BOT_PRESETS[difficulties.S] },
        { seat: "W", name: "P4", kind: "bot", botProfile: BOT_PRESETS[difficulties.W] },
      ],
      rules: DEFAULT_RULES,
      timestamp: Date.now(),
    };

    // Reset all non-gameState fields first. gameState is set to null so that
    // _applyEvents picks up INITIAL_STATE as its base (via the ?? fallback).
    // eventLog is cleared here so _applyEvents doesn't append to stale history.
    set({
      gameState: null,
      eventLog: [],
      overlay: "none",
      pendingDiscards: [],
      pendingHandScore: null,
      botTimeoutId: null,
      botDifficulties: difficulties,
      announcement: null,
      gameOverReason: null,
      historyModalOpen: false,
      biddingThinkingSeat: null,
    });

    // Route through _applyEvents so all dev callbacks (including _devOnHandStart
    // for Hand 0) fire via the same path as every subsequent hand.
    get()._applyEvents([gameStartedEvent]);

    get()._scheduleNextTurn();
  },

  resetGame: () => {
    const { botTimeoutId } = get();
    if (botTimeoutId !== null) clearTimeout(botTimeoutId);
    set({
      gameState: null,
      eventLog: [],
      overlay: "none",
      pendingDiscards: [],
      pendingHandScore: null,
      botTimeoutId: null,
      announcement: null,
      gameOverReason: null,
      historyModalOpen: false,
      biddingThinkingSeat: null,
    });
  },

  _applyEvents: (events) => {
    set((s) => {
      let gs: GameState = s.gameState ?? INITIAL_STATE;
      let pendingHandScore = s.pendingHandScore;
      let announcement = s.announcement;
      let gameOverReason = s.gameOverReason;
      for (const ev of events) {
        gs = applyEvent(gs, ev);
        if (ev.type === "GameStarted") {
          s._devOnHandStart?.(ev.timestamp, gs);
        }
        if (ev.type === "HandStarted") {
          s._devOnHandStart?.(ev.timestamp, gs);
        }
        if (ev.type === "HandScored") {
          pendingHandScore = ev.score;
          s._devOnHandComplete?.(gs);
        }
        if (ev.type === "BiddingComplete" && ev.forced && s._devOnBidEvent) {
          const forcedBidEvent: BidEvent = {
            seat: ev.winner,
            isHuman: gs.players.find((p) => p.seat === ev.winner)?.kind === "human",
            action: "forced",
            amount: ev.amount,
            standingBid: ev.amount,
            round: 1, // placeholder — GameLogger.onBidEvent will override
            annotation: null,
          };
          s._devOnBidEvent(forcedBidEvent);
        }
        if (ev.type === "GameFinished") gameOverReason = ev.reason;
        const next = buildAnnouncementFromEvent(ev, gs.rules);
        if (next !== null) announcement = next;
        // Log human card plays
        if (ev.type === "CardPlayed") {
          const player = gs.players.find((p) => p.seat === ev.seat);
          if (player?.kind === "human" && s._devOnBotDecision) {
            const trump = gs.trump;
            const trumpPlayedCount = trump !== null
              ? gs.playedCards.filter((cId) => {
                  if (cId === "ROOK") return true;
                  const c = cardFromId(cId);
                  return c.kind === "regular" && c.color === trump;
                }).length
              : 0;
            const trumpPulled = trumpPlayedCount >= 9;
            const isBiddingTeam = gs.bidder !== null &&
              SEAT_TEAM[ev.seat] === SEAT_TEAM[gs.bidder];
            const myTeam = SEAT_TEAM[ev.seat];
            const teamPointsCaptured = gs.capturedCards[myTeam]
              .reduce((sum, cId) => sum + pointValue(cId), 0);
            // trickIndex: the current trick index at the time of play
            // After applyEvent, if card was played, we use the completed tricks count
            // or tricksPlayed. Before the trick completes, tricksPlayed hasn't incremented.
            const trickIndex = gs.tricksPlayed;
            const isLeading = ev.trickIndex === 0 ||
              (gs.currentTrick.length === 0 && gs.completedTricks.length === trickIndex);
            const humanAnnotation: PlayAnnotation = {
              phase: "playing",
              seat: ev.seat,
              difficulty: null,
              trickIndex: ev.trickIndex,
              leadOrFollow: isLeading ? "lead" : "follow",
              trumpPulled,
              isBiddingTeam,
              teamPointsCaptured,
              cardChosen: ev.cardId,
              reasoning: "human",
            };
            s._devOnBotDecision(humanAnnotation);
          }
        }
      }
      return { gameState: gs, eventLog: [...s.eventLog, ...events], pendingHandScore, announcement, gameOverReason };
    });
  },

  _scheduleNextTurn: () => {
    const { gameState, pendingHandScore } = get();
    if (!gameState) return;

    // Hand just scored — show result overlay before continuing (even if the game just ended)
    if (pendingHandScore !== null) {
      set({ overlay: "hand-result" });
      return;
    }

    // Game finished (and no pending hand score)
    if (gameState.phase === "finished") {
      set({ overlay: "game-over" });
      return;
    }

    const { activePlayer, phase } = gameState;

    // Human's turn
    if (activePlayer === HUMAN_SEAT) {
      if (phase === "bidding") {
        set({ overlay: "bidding", biddingThinkingSeat: null });
      } else if (phase === "nest") {
        // Issue TakeNest immediately so the hand has all 15 cards before overlay opens
        const gs = get().gameState;
        if (gs) {
          const takeResult = validateCommand(gs, { type: "TakeNest", seat: HUMAN_SEAT }, gs.rules);
          if (!takeResult.ok) {
            console.error("Unexpected TakeNest failure:", takeResult.error);
            return;
          }
          get()._applyEvents(takeResult.events);
        }
        set({ overlay: "nest" });
      } else if (phase === "trump") {
        set({ overlay: "trump" });
      } else {
        set({ overlay: "none" }); // playing phase — cards are clickable
      }
      return;
    }

    // Bot's turn — keep overlay open during bidding, set thinking seat
    if (phase === "bidding") {
      set({ overlay: "bidding", biddingThinkingSeat: activePlayer });
    }
    const delay = (phase === "playing" || phase === "bidding")
      ? (gameState.rules.botDelayMs ?? 1000)
      : 0;
    const id = setTimeout(() => get()._dispatchBotTurn(), delay);
    set({ botTimeoutId: id });
  },

  _dispatchBotTurn: () => {
    const { gameState } = get();
    if (!gameState) return;

    const seat = gameState.activePlayer;
    if (!seat) return;

    // Safety: if somehow it's the human's turn, stop
    if (seat === HUMAN_SEAT) return;

    const player = gameState.players.find((p) => p.seat === seat);
    if (!player || player.kind !== "bot" || !player.botProfile) return;

    const command = _botChooseCommandWithLog(gameState, seat, player.botProfile, get());
    const result = validateCommand(gameState, command, gameState.rules);

    if (!result.ok) {
      console.error("Bot generated illegal command:", result.error, command);
      return;
    }

    const trickCompletedIdx = result.events.findIndex((e) => e.type === "TrickCompleted");

    if (trickCompletedIdx !== -1) {
      // Split: apply up to and including CardPlayed first, then after a delay apply the rest
      const preEvents = result.events.slice(0, trickCompletedIdx);
      const postEvents = result.events.slice(trickCompletedIdx);
      get()._applyEvents(preEvents);
      set({ botTimeoutId: null });
      const delay = get().gameState?.rules.botDelayMs ?? 1000;
      const id = setTimeout(() => {
        get()._applyEvents(postEvents);
        set({ botTimeoutId: null, biddingThinkingSeat: null });
        get()._scheduleNextTurn();
      }, delay);
      set({ botTimeoutId: id });
    } else {
      get()._applyEvents(result.events);
      set({ botTimeoutId: null, biddingThinkingSeat: null });
      get()._scheduleNextTurn();
    }
  },

  humanPlayCard: (cardId) => {
    const { gameState, botTimeoutId } = get();
    if (!gameState) return;

    // Guard against the split-animation race window: when a bot has just played
    // the trick-completing card, botTimeoutId is non-null while TrickCompleted is
    // pending. activePlayer may temporarily read as "N" during this window.
    // Reject the click to prevent injecting a card into an already-full trick.
    if (botTimeoutId !== null) {
      return;
    }

    const result = validateCommand(
      gameState,
      { type: "PlayCard", seat: HUMAN_SEAT, cardId },
      gameState.rules,
    );

    if (!result.ok) {
      console.warn("Illegal play attempt:", result.error);
      return;
    }

    const trickCompletedIdx = result.events.findIndex((e) => e.type === "TrickCompleted");

    if (trickCompletedIdx !== -1) {
      // Apply pre-trick events immediately (shows 4th card), then rest after delay
      const preEvents = result.events.slice(0, trickCompletedIdx);
      const postEvents = result.events.slice(trickCompletedIdx);
      get()._applyEvents(preEvents);
      const delay = get().gameState?.rules.botDelayMs ?? 1000;
      const id = setTimeout(() => {
        get()._applyEvents(postEvents);
        set({ botTimeoutId: null });
        get()._scheduleNextTurn();
      }, delay);
      set({ botTimeoutId: id });
    } else {
      get()._applyEvents(result.events);
      get()._scheduleNextTurn();
    }
  },

  humanPlaceBid: (amount) => {
    const { gameState } = get();
    if (!gameState) return;
    const result = validateCommand(
      gameState,
      { type: "PlaceBid", seat: HUMAN_SEAT, amount },
      gameState.rules,
    );
    if (!result.ok) {
      console.warn("Illegal PlaceBid:", result.error);
      return;
    }
    const bidCb = get()._devOnBidEvent;
    if (bidCb) {
      const bidEvent: BidEvent = {
        seat: HUMAN_SEAT,
        isHuman: true,
        action: "place",
        amount,
        standingBid: gameState.currentBid,
        round: 1, // placeholder — GameLogger.onBidEvent will override
        annotation: null,
      };
      bidCb(bidEvent);
    }
    get()._applyEvents(result.events);
    set({ biddingThinkingSeat: null });
    get()._scheduleNextTurn();
  },

  humanPassBid: () => {
    const { gameState } = get();
    if (!gameState) return;
    const result = validateCommand(
      gameState,
      { type: "PassBid", seat: HUMAN_SEAT },
      gameState.rules,
    );
    if (!result.ok) {
      console.warn("Illegal PassBid:", result.error);
      return;
    }
    const bidCb = get()._devOnBidEvent;
    if (bidCb) {
      const bidEvent: BidEvent = {
        seat: HUMAN_SEAT,
        isHuman: true,
        action: "pass",
        amount: null,
        standingBid: gameState.currentBid,
        round: 1, // placeholder — GameLogger.onBidEvent will override
        annotation: null,
      };
      bidCb(bidEvent);
    }
    get()._applyEvents(result.events);
    set({ biddingThinkingSeat: null });
    get()._scheduleNextTurn();
  },

  humanShootMoon: () => {
    const { gameState } = get();
    if (!gameState) return;
    const result = validateCommand(
      gameState,
      { type: "ShootMoon", seat: HUMAN_SEAT },
      gameState.rules,
    );
    if (!result.ok) {
      console.warn("Illegal ShootMoon:", result.error);
      return;
    }
    const bidCb = get()._devOnBidEvent;
    if (bidCb) {
      const bidEvent: BidEvent = {
        seat: HUMAN_SEAT,
        isHuman: true,
        action: "moon",
        amount: null,
        standingBid: gameState.currentBid,
        round: 1, // placeholder — GameLogger.onBidEvent will override
        annotation: null,
      };
      bidCb(bidEvent);
    }
    get()._applyEvents(result.events);
    set({ biddingThinkingSeat: null });
    get()._scheduleNextTurn();
  },

  toggleDiscard: (cardId) => {
    set((s) => {
      const already = s.pendingDiscards.includes(cardId);
      if (already) {
        return { pendingDiscards: s.pendingDiscards.filter((c) => c !== cardId) };
      }
      if (s.pendingDiscards.length >= 5) return s; // already at max
      return { pendingDiscards: [...s.pendingDiscards, cardId] };
    });
  },

  confirmDiscards: () => {
    const { gameState, pendingDiscards } = get();
    if (!gameState || pendingDiscards.length !== 5) return;

    let gs = gameState;
    const allEvents: GameEvent[] = [];

    if (gs.nest.length > 0) {
      console.error("confirmDiscards: nest should already be empty (TakeNest should have been issued in _scheduleNextTurn)");
      return;
    }

    for (const cardId of pendingDiscards) {
      const result = validateCommand(
        gs,
        { type: "DiscardCard", seat: HUMAN_SEAT, cardId },
        gs.rules,
      );
      if (!result.ok) {
        console.error("Discard failed:", result.error);
        return;
      }
      for (const ev of result.events) {
        gs = applyEvent(gs, ev);
      }
      allEvents.push(...result.events);
    }

    set((s) => ({
      gameState: gs,
      eventLog: [...s.eventLog, ...allEvents],
      pendingDiscards: [],
      overlay: "trump",
    }));
  },

  humanSelectTrump: (color) => {
    const { gameState } = get();
    if (!gameState) return;

    const result = validateCommand(
      gameState,
      { type: "SelectTrump", seat: HUMAN_SEAT, color },
      gameState.rules,
    );

    if (!result.ok) {
      console.error("SelectTrump failed:", result.error);
      return;
    }

    get()._applyEvents(result.events);
    set({ overlay: "none" });
    get()._scheduleNextTurn();
  },

  acknowledgeHandResult: () => {
    set({ pendingHandScore: null });
    const { gameState } = get();
    if (gameState?.phase === "finished") {
      set({ overlay: "game-over" });
    } else {
      set({ overlay: "none" });
      get()._scheduleNextTurn();
    }
  },

  setAllBotDifficulty: (difficulty) =>
    set({ botDifficulties: { E: difficulty, S: difficulty, W: difficulty } }),

  setBotDifficultySeat: (seat, difficulty) =>
    set((s) => ({ botDifficulties: { ...s.botDifficulties, [seat]: difficulty } })),

  clearAnnouncement: () => set({ announcement: null }),

  openHistoryModal: () => set({ historyModalOpen: true }),
  closeHistoryModal: () => set({ historyModalOpen: false }),

  _setLoggerCallbacks: (callbacks) => set({
    _devOnBotDecision: callbacks.onBotDecision,
    _devOnHandComplete: callbacks.onHandComplete,
    _devOnHandStart: callbacks.onHandStart,
    _devOnBidEvent: callbacks.onBidEvent,
  }),
}));
