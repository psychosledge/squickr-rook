import type * as Party from "partykit/server";
import {
  applyEvent,
  botChooseCommand,
  BOT_PRESETS,
  DEFAULT_RULES,
  filterEvent,
  INITIAL_STATE,
  maskState,
  SEAT_ORDER,
  validateCommand,
} from "@rook/engine";
import type {
  BotDifficulty,
  GameCommand,
  GameEvent,
  GameState,
  PlayerInfo,
  Seat,
} from "@rook/engine";

// ── Client → Server message types ────────────────────────────────────────────

type JoinRoom = {
  type: "JoinRoom";
  playerId: string;
  displayName: string;
  seat: Seat | null;
};

type ClaimSeat = {
  type: "ClaimSeat";
  seat: Seat;
};

type LeaveSeat = {
  type: "LeaveSeat";
};

type StartGame = {
  type: "StartGame";
};

type SendCommand = {
  type: "SendCommand";
  command: GameCommand;
};

type UpdateName = {
  type: "UpdateName";
  displayName: string;
};

type ReplaceWithBot = {
  type: "ReplaceWithBot";
  seat: Seat;
};

type SetBotDifficulty = {
  type: "SetBotDifficulty";
  seat: Seat;
  difficulty: BotDifficulty;
};

type ClientMessage = JoinRoom | ClaimSeat | LeaveSeat | StartGame | SendCommand | UpdateName | ReplaceWithBot | SetBotDifficulty;

// ── Server → Client message types ────────────────────────────────────────────

type SeatInfo = {
  seat: Seat;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
};

type ConnectionState = {
  playerId: string;
  displayName: string;
  seat: Seat | null;
};

type Welcome = {
  type: "Welcome";
  roomCode: string;
  hostId: string | null;
  seats: SeatInfo[];
  phase: "lobby" | "playing";
  state?: GameState;
};

type LobbyUpdated = {
  type: "LobbyUpdated";
  seats: SeatInfo[];
  hostId: string | null;
};

type EventBatch = {
  type: "EventBatch";
  events: GameEvent[];
};

type CommandError = {
  type: "CommandError";
  reason: string;
};

type PlayerDisconnected = {
  type: "PlayerDisconnected";
  seat: Seat;
  displayName: string;
};

type PlayerReconnected = {
  type: "PlayerReconnected";
  seat: Seat;
  displayName: string;
};

type ServerMessage = Welcome | LobbyUpdated | EventBatch | CommandError | PlayerDisconnected | PlayerReconnected;

// Typed connection alias for convenience
type Conn = Party.Connection<ConnectionState>;

function getState(conn: Party.Connection): ConnectionState | null {
  return (conn as Conn).state;
}

function setState(conn: Party.Connection, state: ConnectionState): void {
  (conn as Conn).setState(state);
}

// ── RookRoom ──────────────────────────────────────────────────────────────────

export default class RookRoom implements Party.Server {
  private phase: "lobby" | "playing" = "lobby";
  private hostConnId: string | null = null;
  private joinOrder: string[] = [];
  private seatedPlayers: Map<Seat, { playerId: string; displayName: string; connId: string }> =
    new Map();
  private gameState: GameState | null = null;
  private disconnectedSeats: Map<Seat, { playerId: string; displayName: string }> = new Map();
  private gamePaused = false;
  private botDifficulties: Map<Seat, BotDifficulty> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, _ctx: Party.ConnectionContext): Promise<void> {
    console.log(`[RookRoom] connection ${conn.id} opened`);
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === "string" ? message : "") as ClientMessage;
    } catch {
      this.sendError(sender, "Malformed JSON");
      return;
    }

    switch (msg.type) {
      case "JoinRoom":
        await this.handleJoinRoom(msg, sender);
        break;
      case "ClaimSeat":
        await this.handleClaimSeat(msg, sender);
        break;
      case "LeaveSeat":
        await this.handleLeaveSeat(msg, sender);
        break;
      case "StartGame":
        await this.handleStartGame(msg, sender);
        break;
      case "SendCommand":
        await this.handleSendCommand(msg, sender);
        break;
      case "UpdateName":
        await this.handleUpdateName(msg, sender);
        break;
      case "ReplaceWithBot":
        await this.handleReplaceWithBot(msg, sender);
        break;
      case "SetBotDifficulty":
        await this.handleSetBotDifficulty(msg, sender);
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        this.sendError(sender, "Unknown message type");
      }
    }
  }

  async onClose(conn: Party.Connection): Promise<void> {
    const state = getState(conn);

    // Remove from join order
    this.joinOrder = this.joinOrder.filter((id) => id !== conn.id);

    if (this.phase === "lobby") {
      // Always clean up seat even if room becomes empty (so future joiners see correct state)
      if (state?.seat != null) {
        // Only evict if this connection still owns the seat (stale-close guard)
        const entry = this.seatedPlayers.get(state.seat);
        if (entry?.connId === conn.id) {
          this.seatedPlayers.delete(state.seat);
        }
      }

      // If room empty, nothing more to do
      if (this.joinOrder.length === 0) {
        return;
      }

      // Promote new host if needed
      if (conn.id === this.hostConnId) {
        this.promoteNewHost();
      }

      this.broadcastLobbyUpdated();
    } else {
      // phase === "playing"

      // If room empty, nothing more to do
      if (this.joinOrder.length === 0) {
        return;
      }

      // Promote new host if needed.
      // NOTE: if the reconnecting player was the host, handleJoinRoom already
      // updated hostConnId to the new connection's id — so this guard only
      // fires for genuine disconnects, not stale closes from a reconnect.
      if (conn.id === this.hostConnId) {
        this.promoteNewHost();
      }

      const seat = state?.seat ?? null;
      if (seat != null && this.gameState !== null) {
        // Stale-connection guard: if player already reconnected on a new connection,
        // seatedPlayers has the new connId — skip disconnect logic for this old socket.
        if (this.seatedPlayers.get(seat)?.connId !== conn.id) {
          return;
        }
        const displayName = state?.displayName ?? "Player";
        // Track disconnection — do not convert to bot yet
        if (!state?.playerId) return; // connection closed before JoinRoom — nothing to clean up
        this.disconnectedSeats.set(seat, { playerId: state.playerId, displayName });
        // Remove from seatedPlayers so buildSeatInfoArray sees it as disconnected
        this.seatedPlayers.delete(seat);
        // Broadcast disconnection notification
        for (const c of this.room.getConnections()) {
          this.sendTo(c, {
            type: "PlayerDisconnected",
            seat,
            displayName,
          } satisfies PlayerDisconnected);
        }
        this.broadcastLobbyUpdated();
        // Always pause when any human player disconnects mid-game
        this.gamePaused = true;
      }
    }
  }

  // ── Private handlers ────────────────────────────────────────────────────────

  private async handleJoinRoom(msg: JoinRoom, conn: Party.Connection): Promise<void> {
    // ── Reconnect path ────────────────────────────────────────────────────────
    // Check if this player was disconnected mid-game and is rejoining.
    const reconnectEntry = [...this.disconnectedSeats.entries()]
      .find(([, entry]) => entry.playerId === msg.playerId);

    if (reconnectEntry !== undefined) {
      const [disconnectedSeat, entry] = reconnectEntry;

      // Restore the player to seatedPlayers with the new connId
      this.disconnectedSeats.delete(disconnectedSeat);
      this.seatedPlayers.set(disconnectedSeat, {
        playerId: msg.playerId,
        displayName: entry.displayName,
        connId: conn.id,
      });

      // Update connection state so future onClose can identify this player
      setState(conn, {
        playerId: msg.playerId,
        displayName: entry.displayName,
        seat: disconnectedSeat,
      });

      // Add to join order if not already present
      if (!this.joinOrder.includes(conn.id)) {
        this.joinOrder.push(conn.id);
      }

      // Assign host if none exists
      if (this.hostConnId === null) {
        this.hostConnId = conn.id;
      }

      // Send Welcome to the reconnecting player with their masked game state.
      // NOTE: disconnectedSeats is only ever populated during phase === "playing",
      // so gameState is guaranteed non-null here.
      const reconnectWelcome = {
        type: "Welcome",
        roomCode: this.room.id,
        hostId: this.getHostPlayerId(),
        phase: "playing",
        seats: this.buildSeatInfoArray(),
        state: maskState(this.gameState!, disconnectedSeat),
      } satisfies Welcome;
      this.sendTo(conn, reconnectWelcome);

      // Clear gamePaused if no more disconnected seats remain
      if (this.disconnectedSeats.size === 0) {
        this.gamePaused = false;
      }

      // Broadcast PlayerReconnected to all connections (including the rejoining player)
      for (const c of this.room.getConnections<ConnectionState>()) {
        this.sendTo(c, {
          type: "PlayerReconnected",
          seat: disconnectedSeat,
          displayName: entry.displayName,
        } satisfies PlayerReconnected);
      }

      // Refresh lobby state for everyone
      this.broadcastLobbyUpdated();

      // Resume bot turns if the game can proceed
      await this.processBotTurns();
      return;
    }

    // ── Normal join path ──────────────────────────────────────────────────────
    // Resolve seat BEFORE calling setState so the Welcome snapshot is correct
    const seat = this.getSeatForPlayerId(msg.playerId);

    setState(conn, {
      playerId: msg.playerId,
      displayName: msg.displayName,
      seat,
    });

    // Update the seatedPlayers entry's connId so future routing is correct
    if (seat !== null) {
      const entry = this.seatedPlayers.get(seat);
      if (entry) {
        this.seatedPlayers.set(seat, { ...entry, connId: conn.id });
        // If this player was the host, update hostConnId to their new connection
        if (entry.connId === this.hostConnId) {
          this.hostConnId = conn.id;
        }
      }
    }

    if (!this.joinOrder.includes(conn.id)) {
      this.joinOrder.push(conn.id);
    }

    if (this.hostConnId === null) {
      this.hostConnId = conn.id;
    }

    // Build Welcome for this connection
    const welcome: Welcome = {
      type: "Welcome",
      roomCode: this.room.id,
      hostId: this.getHostPlayerId(),
      seats: this.buildSeatInfoArray(),
      phase: this.phase,
      ...(this.phase === "playing" && this.gameState !== null && seat !== null
        ? { state: maskState(this.gameState, seat) }
        : {}),
    };
    this.sendTo(conn, welcome);

    // Normal-path mid-game reconnect: if the game is playing and this player has a seat,
    // always refresh lobby state. Additionally, if the game was paused and there are no
    // remaining disconnected seats, clear gamePaused and broadcast PlayerReconnected
    // (handles the case where JoinRoom arrives before onClose, so the player never
    // entered disconnectedSeats).
    if (this.phase === "playing" && seat !== null && this.gameState !== null) {
      if (this.gamePaused && this.disconnectedSeats.size === 0) {
        this.gamePaused = false;
        const seatEntry = this.seatedPlayers.get(seat);
        const displayName = seatEntry?.displayName ?? msg.displayName;
        for (const c of this.room.getConnections<ConnectionState>()) {
          this.sendTo(c, {
            type: "PlayerReconnected",
            seat,
            displayName,
          } satisfies PlayerReconnected);
        }
      }
      // Always refresh lobby state for any mid-game seated join
      this.broadcastLobbyUpdated();
      await this.processBotTurns();
      return;
    }

    // Broadcast lobby updated to everyone else (if in lobby)
    if (this.phase === "lobby") {
      for (const c of this.room.getConnections()) {
        if (c.id !== conn.id) {
          this.sendTo(c, {
            type: "LobbyUpdated",
            seats: this.buildSeatInfoArray(),
            hostId: this.getHostPlayerId(),
          } satisfies LobbyUpdated);
        }
      }
    }
  }

  private async handleClaimSeat(msg: ClaimSeat, conn: Party.Connection): Promise<void> {
    if (this.phase !== "lobby") {
      this.sendError(conn, "Cannot claim seat: game already started");
      return;
    }

    const state = getState(conn);
    if (!state) {
      this.sendError(conn, "Must join room before claiming a seat");
      return;
    }

    // Check if seat is occupied by another connection
    const existing = this.seatedPlayers.get(msg.seat);
    if (existing !== undefined && existing.connId !== conn.id) {
      this.sendError(conn, `Seat ${msg.seat} is already occupied`);
      return;
    }

    // Remove from any previous seat
    if (state.seat !== null) {
      this.seatedPlayers.delete(state.seat);
    }

    this.seatedPlayers.set(msg.seat, {
      playerId: state.playerId,
      displayName: state.displayName,
      connId: conn.id,
    });

    setState(conn, { ...state, seat: msg.seat });
    this.broadcastLobbyUpdated();
  }

  private async handleLeaveSeat(_msg: LeaveSeat, conn: Party.Connection): Promise<void> {
    if (this.phase !== "lobby") {
      this.sendError(conn, "Cannot leave seat: game already started");
      return;
    }

    const state = getState(conn);
    if (!state || state.seat === null) {
      this.sendError(conn, "Not currently seated");
      return;
    }

    this.seatedPlayers.delete(state.seat);
    setState(conn, { ...state, seat: null });
    this.broadcastLobbyUpdated();
  }

  private async handleStartGame(_msg: StartGame, conn: Party.Connection): Promise<void> {
    if (this.phase !== "lobby") {
      this.sendError(conn, "Game already started");
      return;
    }

    if (conn.id !== this.hostConnId) {
      this.sendError(conn, "Only the host can start the game");
      return;
    }

    if (this.seatedPlayers.size < 1) {
      this.sendError(conn, "At least 1 human must be seated to start");
      return;
    }

    // Build PlayerInfo[] for all 4 seats
    const players: PlayerInfo[] = SEAT_ORDER.map((seat): PlayerInfo => {
      const human = this.seatedPlayers.get(seat);
      if (human !== undefined) {
        return { seat, name: human.displayName, kind: "human" };
      }
      const difficulty = this.botDifficulties.get(seat) ?? 3;
      return { seat, name: "Bot", kind: "bot", botProfile: BOT_PRESETS[difficulty] };
    });

    const seed = Math.floor(Math.random() * 2 ** 31);
    const dealer = SEAT_ORDER[seed % 4] as Seat;

    const gameStartedEvent = {
      type: "GameStarted" as const,
      seed,
      dealer,
      players,
      rules: DEFAULT_RULES,
      timestamp: Date.now(),
    };

    this.gameState = applyEvent(INITIAL_STATE, gameStartedEvent);
    this.phase = "playing";

    const batch: EventBatch = { type: "EventBatch", events: [gameStartedEvent] };
    for (const c of this.room.getConnections()) {
      this.sendTo(c, batch);
    }

    this.processBotTurns();
  }

  private async handleUpdateName(msg: UpdateName, conn: Party.Connection): Promise<void> {
    const trimmed = msg.displayName.trim();
    if (!trimmed) return;

    const state = getState(conn);
    if (!state) return;

    setState(conn, { ...state, displayName: trimmed });

    // Update seatedPlayers entry if this player is seated
    if (state.seat !== null) {
      const entry = this.seatedPlayers.get(state.seat);
      if (entry) {
        this.seatedPlayers.set(state.seat, { ...entry, displayName: trimmed });
      }
    }

    this.broadcastLobbyUpdated();
  }

  private async handleSendCommand(msg: SendCommand, conn: Party.Connection): Promise<void> {
    if (this.phase !== "playing") {
      this.sendError(conn, "Game is not in progress");
      return;
    }

    const state = getState(conn);
    if (!state || state.seat === null) {
      this.sendError(conn, "You are not seated");
      return;
    }

    if (msg.command.seat !== state.seat) {
      this.sendError(
        conn,
        `Command seat ${msg.command.seat} does not match your seat ${state.seat}`,
      );
      return;
    }

    const result = validateCommand(this.gameState!, msg.command, this.gameState!.rules);
    if (!result.ok) {
      this.sendError(conn, result.error);
      return;
    }

    for (const event of result.events) {
      this.gameState = applyEvent(this.gameState!, event);
    }

    this.broadcastEvents(result.events);
    this.processBotTurns();
  }

  private async handleReplaceWithBot(msg: ReplaceWithBot, conn: Party.Connection): Promise<void> {
    const state = getState(conn);
    if (state?.playerId !== this.getHostPlayerId()) {
      this.sendError(conn, "Only the host can replace a player with a bot");
      return;
    }
    if (this.phase !== "playing" || !this.gameState) return;
    if (!this.disconnectedSeats.has(msg.seat)) return;

    // Convert the disconnected seat to a bot in the engine's players array
    const difficulty = this.botDifficulties.get(msg.seat) ?? 3;
    this.gameState = {
      ...this.gameState,
      players: this.gameState.players.map((p): PlayerInfo => {
        if (p.seat === msg.seat) {
          return {
            seat: msg.seat,
            name: p.name,
            kind: "bot",
            botProfile: BOT_PRESETS[difficulty],
          };
        }
        return p;
      }),
    };

    this.disconnectedSeats.delete(msg.seat);
    this.gamePaused = false;
    this.broadcastLobbyUpdated();
    await this.processBotTurns();
  }

  private async handleSetBotDifficulty(msg: SetBotDifficulty, conn: Party.Connection): Promise<void> {
    if (this.phase !== "lobby") {
      this.sendError(conn, "Cannot change bot difficulty: game already started");
      return;
    }

    const state = getState(conn);
    if (state?.playerId !== this.getHostPlayerId()) {
      this.sendError(conn, "Only the host can set bot difficulty");
      return;
    }

    if (![1, 2, 3, 4, 5].includes(msg.difficulty as number)) {
      this.sendError(conn, "Invalid difficulty: must be 1–5");
      return;
    }

    this.botDifficulties.set(msg.seat, msg.difficulty);
    this.broadcastLobbyUpdated();
  }

  // ── Bot turns ───────────────────────────────────────────────────────────────

  private botTurnInProgress = false;

  private async processBotTurns(): Promise<void> {
    if (this.botTurnInProgress) return;
    this.botTurnInProgress = true;
    try {
      while (this.gameState !== null && this.phase === "playing" && !this.gamePaused) {
        if (this.gameState.phase === "finished") break;

        const activePlayer = this.gameState.activePlayer;
        if (activePlayer === null) break;

        const playerInfo = this.gameState.players.find((p) => p.seat === activePlayer);
        if (!playerInfo || playerInfo.kind !== "bot") break;

        // Delay FIRST — pause before the bot acts (read phase before any mutation)
        const delayMs =
          this.gameState.phase === "playing" || this.gameState.phase === "bidding"
            ? (this.gameState.rules.botDelayMs ?? 1000)
            : 0;
        if (delayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, delayMs));
        }

        const profile = playerInfo.botProfile ?? BOT_PRESETS[3];
        const command = botChooseCommand(this.gameState, activePlayer, profile);
        const result = validateCommand(this.gameState, command, this.gameState.rules);

        if (!result.ok) {
          console.error(
            `[RookRoom] Bot command invalid for seat ${activePlayer}: ${result.error}`,
          );
          break;
        }

        for (const event of result.events) {
          this.gameState = applyEvent(this.gameState!, event);
        }

        this.broadcastEvents(result.events);

        if (this.gameState.phase === "finished") break;
      }
    } finally {
      this.botTurnInProgress = false;
    }
  }

  // ── Broadcast helpers ───────────────────────────────────────────────────────

  private broadcastEvents(events: GameEvent[]): void {
    for (const conn of this.room.getConnections()) {
      const state = getState(conn);
      if (!state?.seat) continue;

      const filtered = events.map((e) =>
        filterEvent(e, state.seat!, this.gameState!.bidder),
      );

      this.sendTo(conn, { type: "EventBatch", events: filtered } satisfies EventBatch);
    }
  }

  private broadcastLobbyUpdated(): void {
    const msg: LobbyUpdated = {
      type: "LobbyUpdated",
      seats: this.buildSeatInfoArray(),
      hostId: this.getHostPlayerId(),
    };
    for (const conn of this.room.getConnections()) {
      this.sendTo(conn, msg);
    }
  }

  private sendError(conn: Party.Connection, reason: string): void {
    this.sendTo(conn, { type: "CommandError", reason } satisfies CommandError);
  }

  private sendTo(conn: Party.Connection, msg: ServerMessage): void {
    // Party.Connection doesn't expose readyState in its TS interface; cast to access the underlying WS property
    if ((conn as any).readyState !== 1 /* WebSocket.OPEN */) return;
    try {
      conn.send(JSON.stringify(msg));
    } catch (err) {
      console.warn(`[RookRoom] sendTo ${conn.id} failed, skipping:`, err);
    }
  }

  // ── State helpers ───────────────────────────────────────────────────────────

  private buildSeatInfoArray(): SeatInfo[] {
    return SEAT_ORDER.map((seat): SeatInfo => {
      const human = this.seatedPlayers.get(seat);

      if (human === undefined) {
        // Empty seat or bot (during playing phase)
        if (this.phase === "playing" && this.gameState !== null) {
          // Check if this is a disconnected human seat
          const disconnectedEntry = this.disconnectedSeats.get(seat);
          if (disconnectedEntry !== undefined) {
            return { seat, playerId: disconnectedEntry.playerId, displayName: disconnectedEntry.displayName, connected: false, isBot: false };
          }
          const playerInfo = this.gameState.players.find((p) => p.seat === seat);
          if (playerInfo !== undefined) {
            return {
              seat,
              playerId: null,
              displayName: playerInfo.name,
              connected: false,
              isBot: true,
            };
          }
        }
        // Lobby empty seat or lobby bot seat
        const difficulty = this.botDifficulties.get(seat);
        return { seat, playerId: null, displayName: null, connected: false, isBot: false, ...(difficulty !== undefined ? { botDifficulty: difficulty } : {}) };
      }

      // Human seated
      const conn = this.connForSeat(seat);
      return {
        seat,
        playerId: human.playerId,
        displayName: human.displayName,
        connected: conn !== undefined,
        isBot: false,
      };
    });
  }

  /** Returns the seat for a given playerId by scanning seatedPlayers, or null. */
  private getSeatForPlayerId(playerId: string): Seat | null {
    for (const [seat, entry] of this.seatedPlayers.entries()) {
      if (entry.playerId === playerId) return seat;
    }
    return null;
  }

  /** Returns the live connection for a given seat, or undefined if not connected. */
  private connForSeat(seat: Seat): Party.Connection | undefined {
    const entry = this.seatedPlayers.get(seat);
    if (entry === undefined) return undefined;
    return this.room.getConnection(entry.connId);
  }

  private getHostPlayerId(): string | null {
    if (this.hostConnId === null) return null;
    const conn = this.room.getConnection(this.hostConnId);
    if (!conn) return null;
    return getState(conn)?.playerId ?? null;
  }

  private promoteNewHost(): void {
    for (const connId of this.joinOrder) {
      if (this.room.getConnection(connId) !== undefined) {
        this.hostConnId = connId;
        return;
      }
    }
    this.hostConnId = null;
  }
}
