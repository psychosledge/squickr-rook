import { create } from "zustand";
import { nanoid } from "nanoid";
import { INITIAL_STATE, applyEvent } from "@rook/engine";
import type { GameEvent, GameRules, Seat } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import type {
  OnlineStore,
  OnlineStoreState,
  ServerMessage,
  ClientMessage,
} from "./onlineGameStore.types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** sessionStorage key used to persist the active room code across page refreshes mid-game. */
export const MID_GAME_ROOM_KEY = "rookMidGameRoom";

// ─── Pure helper ────────────────────────────────────────────────────────────

/**
 * Returns an announcement string for events that warrant one, or null otherwise.
 * Pure function — safe to test independently.
 */
function buildAnnouncementFromEvent(
  ev: GameEvent,
  _rules: GameRules,
  seatNames?: Partial<Record<Seat, string>>,
): string | null {
  const nameOf = (seat: Seat) => seatNames?.[seat] ?? getSeatLabel(seat);
  if (ev.type === "BiddingComplete") {
    const label = nameOf(ev.winner);
    const moon = ev.shotMoon ? " — SHOOT THE MOON!" : "";
    return `${label} won the bid at ${ev.amount}${moon}`;
  }
  if (ev.type === "TrumpSelected") {
    return `${nameOf(ev.seat)} chose ${ev.color} as trump`;
  }
  return null;
}

// ─── Initial state ───────────────────────────────────────────────────────────

export const INITIAL_ONLINE_STATE: OnlineStoreState = {
  myPlayerId: "",
  myDisplayName: "",
  roomCode: null,
  lobbyPhase: "idle",
  connectionError: null,
  seats: [],
  hostId: null,
  mySeat: null,
  gameState: null,
  overlay: "none",
  pendingDiscards: [],
  pendingHandScore: null,
  announcement: null,
  gameOverReason: null,
  historyModalOpen: false,
  biddingThinkingSeat: null,
  disconnectedAlert: null,
  gamePaused: false,
  isReconnecting: false,
  _socket: null,
  _pendingBatch: [],
  _deferredEventQueue: null,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useOnlineGameStore = create<OnlineStore>((set, get) => ({
  ...INITIAL_ONLINE_STATE,

  // ── Connection ────────────────────────────────────────────────────────────

  connect: (roomCode) => {
    // Resolve/persist playerId using sessionStorage (tab-scoped) so that two
    // browser tabs on the same origin get distinct player IDs, preventing the
    // server from assigning them the same seat and sending a mis-masked state.
    // displayName stays in localStorage so it persists across sessions.
    let playerId = sessionStorage.getItem("rookPlayerId");
    if (!playerId) {
      playerId = nanoid();
      sessionStorage.setItem("rookPlayerId", playerId);
    }

    // Resolve display name
    const myDisplayName = localStorage.getItem("rookDisplayName") ?? "Player";

    // Close existing socket if present
    const existing = get()._socket;
    if (existing) {
      existing.close();
    }

    // If we're reconnecting mid-game (gameState is non-null), preserve the
    // current game state, seat, and lobby info so that the OnlineGamePage
    // navigation useEffect doesn't redirect back to the lobby on reconnect.
    const { gameState, mySeat, seats } = get();
    const isInMemoryReconnect = gameState !== null;
    const isCrossRefreshReconnect =
      !isInMemoryReconnect &&
      globalThis.sessionStorage?.getItem(MID_GAME_ROOM_KEY) === roomCode;

    const preservedGame: Partial<OnlineStoreState> =
      isInMemoryReconnect
        ? { gameState, mySeat, seats, isReconnecting: true } // seats is stale until Welcome arrives
        : isCrossRefreshReconnect
          ? { isReconnecting: true }
          : {};

    // Reset state (preserve game fields if reconnecting)
    set({
      ...INITIAL_ONLINE_STATE,
      ...preservedGame,
      roomCode,
      lobbyPhase: "connecting",
      myPlayerId: playerId,
      myDisplayName,
      connectionError: null,
      _pendingBatch: [],
    });

    // Determine WebSocket protocol
    const host = import.meta.env.VITE_PARTYKIT_HOST ?? "localhost:1999";
    const proto = host.startsWith("localhost") ? "ws" : "wss";
    const url = `${proto}://${host}/party/${roomCode}`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      get()._sendRaw({
        type: "JoinRoom",
        playerId: get().myPlayerId,
        displayName: get().myDisplayName,
        seat: null,
      });
    };

    ws.onmessage = (e) => {
      if (get()._socket !== ws) return; // stale socket guard
      get()._handleMessage(JSON.parse(e.data as string) as ServerMessage);
    };

    ws.onerror = () => {
      // Only act if this is still the current socket
      if (get()._socket !== ws) return;
      set({ connectionError: "WebSocket error" });
    };

    ws.onclose = () => {
      // Only act if this is still the current socket.
      // If connect() was called again it closed this socket itself — ignore the stale close.
      if (get()._socket !== ws) return;
      const { lobbyPhase } = get();
      if (lobbyPhase === "playing") {
        set({ connectionError: "Disconnected from server.", _socket: null });
      } else if (lobbyPhase === "connecting" || lobbyPhase === "lobby") {
        set({ connectionError: "Could not connect to room.", _socket: null });
      }
      // lobbyPhase === "idle" → no-op (clean disconnect)
    };

    set({ _socket: ws });
  },

  disconnect: () => {
    globalThis.sessionStorage?.removeItem(MID_GAME_ROOM_KEY);
    get()._socket?.close();
    set({ ...INITIAL_ONLINE_STATE });
  },

  // ── Lobby actions ─────────────────────────────────────────────────────────

  claimSeat: (seat) => {
    get()._sendRaw({ type: "ClaimSeat", seat });
  },

  leaveSeat: () => {
    get()._sendRaw({ type: "LeaveSeat" });
  },

  startGame: () => {
    get()._sendRaw({ type: "StartGame" });
  },

  updateDisplayName: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { _socket } = get();
    if (!_socket) return;
    localStorage.setItem("rookDisplayName", trimmed);
    set({ myDisplayName: trimmed });
    get()._sendRaw({ type: "UpdateName", displayName: trimmed });
  },

  // ── Human game actions ────────────────────────────────────────────────────

  humanPlayCard: (cardId) => {
    const { mySeat } = get();
    if (!mySeat) return;
    get()._sendCommand({ type: "PlayCard", seat: mySeat, cardId });
  },

  humanPlaceBid: (amount) => {
    const { mySeat } = get();
    if (!mySeat) return;
    set({ biddingThinkingSeat: null });
    get()._sendCommand({ type: "PlaceBid", seat: mySeat, amount });
  },

  humanPassBid: () => {
    const { mySeat } = get();
    if (!mySeat) return;
    set({ biddingThinkingSeat: null });
    get()._sendCommand({ type: "PassBid", seat: mySeat });
  },

  humanShootMoon: () => {
    const { mySeat } = get();
    if (!mySeat) return;
    set({ biddingThinkingSeat: null });
    get()._sendCommand({ type: "ShootMoon", seat: mySeat });
  },

  toggleDiscard: (cardId) => {
    set((s) => {
      const already = s.pendingDiscards.includes(cardId);
      if (already) {
        return { pendingDiscards: s.pendingDiscards.filter((c) => c !== cardId) };
      }
      if (s.pendingDiscards.length >= 5) return s;
      return { pendingDiscards: [...s.pendingDiscards, cardId] };
    });
  },

  confirmDiscards: () => {
    const { mySeat, pendingDiscards } = get();
    if (!mySeat) return;
    if (pendingDiscards.length !== 5) return;

    for (const cardId of pendingDiscards) {
      get()._sendCommand({ type: "DiscardCard", seat: mySeat, cardId });
    }

    set({ pendingDiscards: [], overlay: "none" });
  },

  humanSelectTrump: (color) => {
    const { mySeat } = get();
    if (!mySeat) return;
    get()._sendCommand({ type: "SelectTrump", seat: mySeat, color });
  },

  acknowledgeHandResult: () => {
    set({ pendingHandScore: null });
    const { gameState } = get();
    if (gameState?.phase === "finished") {
      set({ overlay: "game-over" });
    } else {
      get()._updateOverlayAfterBatch();
    }
    // Drain any events that arrived while waiting for hand result acknowledgement.
    // Always close the queue first (even if empty) to prevent it staying open.
    const queued = get()._deferredEventQueue ?? [];
    set({ _deferredEventQueue: null });
    for (const batch of queued) {
      get()._applyIncomingEvents(batch);
    }
  },

  clearAnnouncement: () => set({ announcement: null }),
  openHistoryModal: () => set({ historyModalOpen: true }),
  closeHistoryModal: () => set({ historyModalOpen: false }),

  replaceWithBot: (seat) => {
    const { hostId, myPlayerId, _socket } = get();
    if (!_socket || myPlayerId !== hostId) return;
    get()._sendRaw({ type: "ReplaceWithBot", seat });
  },

  dismissDisconnectAlert: () => {
    set({ disconnectedAlert: null, gamePaused: false });
    get()._updateOverlayAfterBatch();
  },

  // ── Internal message handling ─────────────────────────────────────────────

  _handleMessage: (msg) => {
    // Guard: drop messages when idle
    if (get().lobbyPhase === "idle") return;

    switch (msg.type) {
      case "Welcome": {
        const { myPlayerId } = get();
        const mySeat = msg.seats.find((s) => s.playerId === myPlayerId)?.seat ?? null;

        if (msg.state) {
          globalThis.sessionStorage?.setItem(MID_GAME_ROOM_KEY, msg.roomCode);
        } else {
          globalThis.sessionStorage?.removeItem(MID_GAME_ROOM_KEY);
        }

        set({
          // If server says "playing" but sent no state snapshot, fall back to "lobby"
          // to prevent OnlineGamePage from looping on a null gameState.
          lobbyPhase: msg.state
            ? "playing"
            : msg.phase === "playing"
              ? "lobby"   // redirect-loop prevention
              : msg.phase,
          seats: msg.seats,
          hostId: msg.hostId,
          mySeat,
          roomCode: msg.roomCode,
          connectionError: null,
          isReconnecting: false,
          ...(msg.state ? { gameState: msg.state } : {}),
        });

        if (msg.state) {
          get()._updateOverlayAfterBatch();
        }

        // Drain pending batch (events that arrived before Welcome)
        const pending = get()._pendingBatch;
        if (pending.length > 0) {
          set({ _pendingBatch: [] });
          get()._applyIncomingEvents(pending);
        }
        break;
      }

      case "LobbyUpdated": {
        const { myPlayerId } = get();
        const mySeat = msg.seats.find((s) => s.playerId === myPlayerId)?.seat ?? null;
        set({ seats: msg.seats, hostId: msg.hostId, mySeat });
        break;
      }

      case "EventBatch": {
        if (get().lobbyPhase === "connecting") {
          // Buffer events while still connecting (Welcome hasn't arrived yet)
          set((s) => ({ _pendingBatch: [...s._pendingBatch, ...msg.events] }));
        } else {
          get()._applyIncomingEvents(msg.events);
        }
        break;
      }

      case "CommandError": {
        console.error("CommandError from server:", msg.reason);
        set({ connectionError: msg.reason });
        break;
      }

      case "PlayerDisconnected": {
        set({ disconnectedAlert: { seat: msg.seat, displayName: msg.displayName }, gamePaused: true });
        break;
      }

      case "PlayerReconnected": {
        set({ disconnectedAlert: null, gamePaused: false });
        get()._updateOverlayAfterBatch();
        break;
      }
    }
  },

  _applyIncomingEvents: (events) => {
    // If a deferred TrickCompleted is in flight, buffer all incoming events
    if (get()._deferredEventQueue !== null) {
      set((s) => ({
        _deferredEventQueue: [...(s._deferredEventQueue ?? []), events],
      }));
      return;
    }

    const trickIdx = events.findIndex((e) => e.type === "TrickCompleted");

    if (trickIdx !== -1) {
      const preEvents = events.slice(0, trickIdx);

      // Apply pre-events synchronously (CardPlayed cards that led to the trick)
      if (preEvents.length > 0) {
        set((s) => {
          let gs = s.gameState ?? INITIAL_STATE;
          let pendingHandScore = s.pendingHandScore;
          let announcement = s.announcement;
          let gameOverReason = s.gameOverReason;
          let lobbyPhase = s.lobbyPhase;
          const sn = Object.fromEntries(
            s.seats.filter((si) => si.displayName !== null).map((si) => [si.seat, si.displayName!]),
          );
          for (const ev of preEvents) {
            gs = applyEvent(gs, ev);
            if (ev.type === "HandScored") pendingHandScore = ev.score;
            if (ev.type === "GameFinished") gameOverReason = ev.reason;
            if (ev.type === "GameStarted") {
              lobbyPhase = "playing";
              const rc = get().roomCode;
              if (rc) globalThis.sessionStorage?.setItem(MID_GAME_ROOM_KEY, rc);
            }
            const next = buildAnnouncementFromEvent(ev, gs.rules, sn);
            if (next !== null) announcement = next;
          }
          return { gameState: gs, lobbyPhase, pendingHandScore, announcement, gameOverReason };
        });
      }

      // Open the deferred queue — subsequent batches will buffer here
      set({ _deferredEventQueue: [] });

      const trickEvent = events[trickIdx];
      const afterTrickEvents = events.slice(trickIdx + 1);
      const delay = get().gameState?.rules.botDelayMs ?? 1000;

      const finalize = () => {
        // Drain the queue (events that arrived during the delay)
        const queued = get()._deferredEventQueue ?? [];
        set({ _deferredEventQueue: null }); // close the buffer FIRST
        for (const batch of queued) {
          get()._applyIncomingEvents(batch); // may re-open buffer if batch has TrickCompleted
        }
        get()._updateOverlayAfterBatch();
      };

      setTimeout(() => {
        // Apply TrickCompleted
        set((s) => {
          let gs = s.gameState ?? INITIAL_STATE;
          let pendingHandScore = s.pendingHandScore;
          let announcement = s.announcement;
          let gameOverReason = s.gameOverReason;
          let lobbyPhase = s.lobbyPhase;
          const sn = Object.fromEntries(
            s.seats.filter((si) => si.displayName !== null).map((si) => [si.seat, si.displayName!]),
          );
          gs = applyEvent(gs, trickEvent);
          const next = buildAnnouncementFromEvent(trickEvent, gs.rules, sn);
          if (next !== null) announcement = next;
          return { gameState: gs, lobbyPhase, pendingHandScore, announcement, gameOverReason };
        });

        if (afterTrickEvents.length > 0) {
          // Apply after-trick events (e.g. HandScored) in a microtask, then finalize
          setTimeout(() => {
            // Apply afterTrickEvents directly (don't use _applyIncomingEvents — would re-check queue)
            set((s) => {
              let gs = s.gameState ?? INITIAL_STATE;
              let pendingHandScore = s.pendingHandScore;
              let announcement = s.announcement;
              let gameOverReason = s.gameOverReason;
              let lobbyPhase = s.lobbyPhase;
              const sn = Object.fromEntries(
                s.seats.filter((si) => si.displayName !== null).map((si) => [si.seat, si.displayName!]),
              );
              for (const ev of afterTrickEvents) {
                gs = applyEvent(gs, ev);
                if (ev.type === "HandScored") pendingHandScore = ev.score;
                if (ev.type === "GameFinished") gameOverReason = ev.reason;
                 if (ev.type === "GameStarted") {
                   lobbyPhase = "playing";
                   const rc = get().roomCode;
                   if (rc) globalThis.sessionStorage?.setItem(MID_GAME_ROOM_KEY, rc);
                 }
                const next = buildAnnouncementFromEvent(ev, gs.rules, sn);
                if (next !== null) announcement = next;
              }
              return { gameState: gs, lobbyPhase, pendingHandScore, announcement, gameOverReason };
            });
            finalize();
          }, 0);
        } else {
          finalize();
        }
      }, delay);

      return;
    }

    // No TrickCompleted — original behaviour
    set((s) => {
      const prevActive = s.gameState?.activePlayer ?? null;
      let gs = s.gameState ?? INITIAL_STATE;
      let pendingHandScore = s.pendingHandScore;
      let announcement = s.announcement;
      let gameOverReason = s.gameOverReason;
      let lobbyPhase = s.lobbyPhase;
      const sn = Object.fromEntries(
        s.seats.filter((si) => si.displayName !== null).map((si) => [si.seat, si.displayName!]),
      );

      for (const ev of events) {
        gs = applyEvent(gs, ev);
        if (ev.type === "HandScored") pendingHandScore = ev.score;
        if (ev.type === "GameFinished") gameOverReason = ev.reason;
        if (ev.type === "GameStarted") {
          lobbyPhase = "playing";
          const rc = get().roomCode;
          if (rc) globalThis.sessionStorage?.setItem(MID_GAME_ROOM_KEY, rc);
        }
        const next = buildAnnouncementFromEvent(ev, gs.rules, sn);
        if (next !== null) announcement = next;
      }

      const nextActive = gs.activePlayer ?? null;
      const shouldAnnounceYourTurn =
        s.mySeat !== null &&
        nextActive === s.mySeat &&
        prevActive !== s.mySeat &&
        gs.phase === "playing" &&
        !announcement;
      if (shouldAnnounceYourTurn) announcement = "Your Turn!";

      return { gameState: gs, lobbyPhase, pendingHandScore, announcement, gameOverReason };
    });

    get()._updateOverlayAfterBatch();
  },

  _updateOverlayAfterBatch: () => {
    const { gameState, pendingHandScore, mySeat } = get();
    if (!gameState) return;

    if (pendingHandScore !== null) {
      set({ overlay: "hand-result", biddingThinkingSeat: null });
      return;
    }

    if (gameState.phase === "finished") {
      set({ overlay: "game-over", biddingThinkingSeat: null });
      return;
    }

    // gamePaused short-circuit: if the active player disconnected, suppress overlays
    const { gamePaused, disconnectedAlert } = get();
    if (gamePaused && disconnectedAlert !== null && gameState.activePlayer === disconnectedAlert.seat) {
      set({ overlay: "none", biddingThinkingSeat: null });
      return;
    }

    const { activePlayer, phase } = gameState;

    if (phase === "bidding") {
      if (activePlayer === mySeat) {
        set({ overlay: "bidding", biddingThinkingSeat: null });
      } else {
        set({ overlay: "bidding", biddingThinkingSeat: activePlayer });
      }
      return;
    }

    if (phase === "nest") {
      if (mySeat !== null && activePlayer === mySeat) {
        if (gameState.originalNest.length > 0) {
          // Nest already taken — show discard modal (hand has 15 cards)
          set({ overlay: "nest", biddingThinkingSeat: null });
        } else {
          // Nest not yet taken — send TakeNest first; server will reply with NestTaken event
          // which will re-trigger _updateOverlayAfterBatch with originalNest populated
          get()._sendCommand({ type: "TakeNest", seat: mySeat });
          set({ overlay: "none", biddingThinkingSeat: null });
        }
      } else {
        set({ overlay: "none", biddingThinkingSeat: null });
      }
      return;
    }

    if (phase === "trump") {
      if (activePlayer === mySeat) {
        set({ overlay: "trump", biddingThinkingSeat: null });
      } else {
        set({ overlay: "none", biddingThinkingSeat: null });
      }
      return;
    }

    // All other phases (playing, scoring, etc.)
    set({ overlay: "none", biddingThinkingSeat: null });
  },

  _sendRaw: (msg: ClientMessage) => {
    const { _socket } = get();
    if (_socket?.readyState !== WebSocket.OPEN) {
      console.warn("_sendRaw: socket not open, dropping message", msg);
      return;
    }
    _socket.send(JSON.stringify(msg));
  },

  _sendCommand: (command) => {
    get()._sendRaw({ type: "SendCommand", command });
  },
}));
