import { create } from "zustand";
import type { AppStore } from "./gameStore.types";
import {
  INITIAL_STATE,
  DEFAULT_RULES,
  BOT_PRESETS,
  applyEvent,
  validateCommand,
  botChooseCommand,
} from "@rook/engine";
import type { GameEvent, GameState, GameRules, Seat } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";

const HUMAN_SEAT: Seat = "N";

/**
 * Returns an announcement string for events that warrant one, or null otherwise.
 * Pure function — safe to test independently.
 */
function buildAnnouncementFromEvent(ev: GameEvent, _rules: GameRules): string | null {
  if (ev.type === "BiddingComplete") {
    const label = getSeatLabel(ev.winner);
    const moon = ev.shotMoon ? " — SHOOT THE MOON!" : "";
    return `${label} won the bid at ${ev.amount}${moon}`;
  }
  if (ev.type === "TrumpSelected") {
    return `${getSeatLabel(ev.seat)} chose ${ev.color} as trump`;
  }
  return null;
}

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

    const newState = applyEvent(INITIAL_STATE, gameStartedEvent);

    set({
      gameState: newState,
      eventLog: [gameStartedEvent],
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
        if (ev.type === "HandScored") pendingHandScore = ev.score;
        if (ev.type === "GameFinished") gameOverReason = ev.reason;
        const next = buildAnnouncementFromEvent(ev, gs.rules);
        if (next !== null) announcement = next;
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

    const command = botChooseCommand(gameState, seat, player.botProfile);
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
}));
