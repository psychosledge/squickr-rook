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

type ClientMessage = JoinRoom | ClaimSeat | LeaveSeat | StartGame | SendCommand;

// ── Server → Client message types ────────────────────────────────────────────

type SeatInfo = {
  seat: Seat;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  isBot: boolean;
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

type ServerMessage = Welcome | LobbyUpdated | EventBatch | CommandError;

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

    // If room empty, nothing to do
    if (this.joinOrder.length === 0) {
      return;
    }

    // Promote new host if needed
    if (conn.id === this.hostConnId) {
      this.promoteNewHost();
    }

    if (this.phase === "lobby") {
      if (state?.seat != null) {
        this.seatedPlayers.delete(state.seat);
      }
      this.broadcastLobbyUpdated();
    } else {
      // phase === "playing"
      const seat = state?.seat ?? null;
      if (seat != null && this.gameState !== null) {
        const displayName = state?.displayName ?? "Bot";
        // Replace disconnected human with a bot
        this.gameState = {
          ...this.gameState,
          players: this.gameState.players.map((p): PlayerInfo => {
            if (p.seat === seat) {
              return {
                seat,
                name: displayName,
                kind: "bot",
                botProfile: BOT_PRESETS["normal"],
              };
            }
            return p;
          }),
        };
        // Remove from seatedPlayers so the seat shows as bot
        this.seatedPlayers.delete(seat);
        this.broadcastLobbyUpdated();
        this.processBotTurns();
      }
    }
  }

  // ── Private handlers ────────────────────────────────────────────────────────

  private async handleJoinRoom(msg: JoinRoom, conn: Party.Connection): Promise<void> {
    setState(conn, {
      playerId: msg.playerId,
      displayName: msg.displayName,
      seat: null,
    });

    if (!this.joinOrder.includes(conn.id)) {
      this.joinOrder.push(conn.id);
    }

    if (this.hostConnId === null) {
      this.hostConnId = conn.id;
    }

    // Build Welcome for this connection
    const seat = this.getSeatForConn(conn);
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
      return { seat, name: "Bot", kind: "bot", botProfile: BOT_PRESETS["normal"] };
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

  // ── Bot turns ───────────────────────────────────────────────────────────────

  private processBotTurns(): void {
    if (this.gameState === null || this.phase !== "playing") return;
    if (this.gameState.phase === "finished") return;

    const MAX_ITERATIONS = 50;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const activePlayer = this.gameState.activePlayer;
      if (activePlayer === null) return;

      const playerInfo = this.gameState.players.find((p) => p.seat === activePlayer);
      if (!playerInfo || playerInfo.kind !== "bot") return;

      const profile = playerInfo.botProfile ?? BOT_PRESETS["normal"];
      const command = botChooseCommand(this.gameState, activePlayer, profile);
      const result = validateCommand(this.gameState, command);

      if (!result.ok) {
        console.error(
          `[RookRoom] Bot command invalid for seat ${activePlayer}: ${result.error}`,
        );
        return;
      }

      for (const event of result.events) {
        this.gameState = applyEvent(this.gameState!, event);
      }

      this.broadcastEvents(result.events);

      if (this.gameState.phase === "finished") return;
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
    conn.send(JSON.stringify(msg));
  }

  // ── State helpers ───────────────────────────────────────────────────────────

  private buildSeatInfoArray(): SeatInfo[] {
    return SEAT_ORDER.map((seat): SeatInfo => {
      const human = this.seatedPlayers.get(seat);

      if (human === undefined) {
        // Empty seat or bot (during playing phase)
        if (this.phase === "playing" && this.gameState !== null) {
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
        // Lobby empty seat
        return { seat, playerId: null, displayName: null, connected: false, isBot: false };
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

  private getSeatForConn(conn: Party.Connection): Seat | null {
    return getState(conn)?.seat ?? null;
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
