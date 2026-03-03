import { create } from "zustand";
import type { AppStore } from "./gameStore.types";
import {
  INITIAL_STATE,
  DEFAULT_RULES,
  BOT_PRESETS,
  applyEvent,
  validateCommand,
  botChooseCommand,
  leftOf,
} from "@rook/engine";
import type { GameEvent, GameState, GameRules, Seat } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";

const HUMAN_SEAT: Seat = "N";

/**
 * Returns an announcement string for events that warrant one, or null otherwise.
 * Pure function — safe to test independently.
 */
function buildAnnouncementFromEvent(ev: GameEvent, rules: GameRules): string | null {
  if (ev.type === "GameStarted" || ev.type === "HandStarted") {
    const bidderSeat: Seat = leftOf(ev.dealer);
    return `${getSeatLabel(bidderSeat)} won the bid at ${rules.autoBidAmount}`;
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
  botDifficulty: "normal",
  announcement: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  startGame: (difficulty) => {
    const { botTimeoutId } = get();
    if (botTimeoutId !== null) clearTimeout(botTimeoutId);

    const seed = Math.floor(Math.random() * 2 ** 31);
    const profiles = BOT_PRESETS[difficulty];

    const gameStartedEvent: GameEvent = {
      type: "GameStarted",
      seed,
      dealer: "N",
      players: [
        { seat: "N", name: "You",   kind: "human" },
        { seat: "E", name: "P2", kind: "bot", botProfile: profiles },
        { seat: "S", name: "P3", kind: "bot", botProfile: profiles },
        { seat: "W", name: "P4", kind: "bot", botProfile: profiles },
      ],
      rules: DEFAULT_RULES,
      timestamp: Date.now(),
    };

    const newState = applyEvent(INITIAL_STATE, gameStartedEvent);
    const announcement = buildAnnouncementFromEvent(gameStartedEvent, DEFAULT_RULES);

    set({
      gameState: newState,
      eventLog: [gameStartedEvent],
      overlay: "none",
      pendingDiscards: [],
      pendingHandScore: null,
      botTimeoutId: null,
      botDifficulty: difficulty,
      announcement,
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
    });
  },

  _applyEvents: (events) => {
    set((s) => {
      let gs: GameState = s.gameState ?? INITIAL_STATE;
      let pendingHandScore = s.pendingHandScore;
      let announcement = s.announcement;
      for (const ev of events) {
        gs = applyEvent(gs, ev);
        if (ev.type === "HandScored") pendingHandScore = ev.score;
        const next = buildAnnouncementFromEvent(ev, gs.rules);
        if (next !== null) announcement = next;
      }
      return { gameState: gs, eventLog: [...s.eventLog, ...events], pendingHandScore, announcement };
    });
  },

  _scheduleNextTurn: () => {
    const { gameState, pendingHandScore } = get();
    if (!gameState) return;

    // Game finished
    if (gameState.phase === "finished") {
      set({ overlay: "game-over" });
      return;
    }

    // Hand just scored — show result overlay before continuing
    if (pendingHandScore !== null) {
      set({ overlay: "hand-result" });
      return;
    }

    const { activePlayer, phase } = gameState;

    // Human's turn
    if (activePlayer === HUMAN_SEAT) {
      if (phase === "nest") {
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

    // Bot's turn — schedule with delay only for playing phase
    const delay = phase === "playing" ? (gameState.rules.botDelayMs ?? 1000) : 0;
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
        set({ botTimeoutId: null });
        get()._scheduleNextTurn();
      }, delay);
      set({ botTimeoutId: id });
    } else {
      get()._applyEvents(result.events);
      set({ botTimeoutId: null });
      get()._scheduleNextTurn();
    }
  },

  humanPlayCard: (cardId) => {
    const { gameState } = get();
    if (!gameState) return;

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
    set({ overlay: "none", pendingHandScore: null });
    get()._scheduleNextTurn();
  },

  setBotDifficulty: (difficulty) => set({ botDifficulty: difficulty }),

  clearAnnouncement: () => set({ announcement: null }),
}));
