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
import type { GameEvent, GameState, Seat } from "@rook/engine";

const HUMAN_SEAT: Seat = "N";

export const useGameStore = create<AppStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  gameState: null,
  eventLog: [],
  overlay: "none",
  pendingDiscards: [],
  pendingHandScore: null,
  botTimeoutId: null,
  botDifficulty: "normal",

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
        { seat: "E", name: "East",  kind: "bot", botProfile: profiles },
        { seat: "S", name: "South", kind: "bot", botProfile: profiles },
        { seat: "W", name: "West",  kind: "bot", botProfile: profiles },
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
      botDifficulty: difficulty,
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
    });
  },

  _applyEvents: (events) => {
    set((s) => {
      let gs: GameState = s.gameState ?? INITIAL_STATE;
      let pendingHandScore = s.pendingHandScore;
      for (const ev of events) {
        gs = applyEvent(gs, ev);
        if (ev.type === "HandScored") pendingHandScore = ev.score;
      }
      return { gameState: gs, eventLog: [...s.eventLog, ...events], pendingHandScore };
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
          if (takeResult.ok) {
            get()._applyEvents(takeResult.events);
          }
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
    const delay = phase === "playing" ? (gameState.rules.botDelayMs ?? 500) : 0;
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
      const delay = get().gameState?.rules.botDelayMs ?? 800;
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
      const delay = get().gameState?.rules.botDelayMs ?? 800;
      setTimeout(() => {
        get()._applyEvents(postEvents);
        get()._scheduleNextTurn();
      }, delay);
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

    // First, issue TakeNest if nest is still available
    let gs = gameState;
    const allEvents: GameEvent[] = [];

    if (gs.nest.length > 0) {
      const takeResult = validateCommand(
        gs,
        { type: "TakeNest", seat: HUMAN_SEAT },
        gs.rules,
      );
      if (!takeResult.ok) {
        console.error("TakeNest failed:", takeResult.error);
        return;
      }
      for (const ev of takeResult.events) {
        gs = applyEvent(gs, ev);
      }
      allEvents.push(...takeResult.events);
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
}));
