import { describe, it, expect, beforeEach } from "vitest";
import RookRoom from "./room.js";
import type { Seat } from "@rook/engine";

// ── Minimal PartyKit mocks ───────────────────────────────────────────────────

type MockConnState = {
  playerId: string;
  displayName: string;
  seat: Seat | null;
};

/** Create a mock PartyKit Connection */
function makeMockConn(id: string) {
  let _state: MockConnState | null = null;
  const sent: string[] = [];

  const conn = {
    id,
    get state() { return _state as MockConnState | null; },
    setState(s: MockConnState | null) { _state = s; return _state; },
    send(msg: string) { sent.push(msg); },
    _sent: sent,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return conn as any as import("partykit/server").Connection<MockConnState> & { _sent: string[] };
}

type MockConn = ReturnType<typeof makeMockConn>;

/** Build a minimal mock Room */
function makeMockRoom(id = "ROOM1") {
  const connections = new Map<string, MockConn>();

  const room = {
    id,
    getConnection(connId: string) {
      return connections.get(connId);
    },
    getConnections() {
      return connections.values();
    },
    _connections: connections,
    addConn(conn: MockConn) {
      connections.set(conn.id, conn);
    },
    removeConn(connId: string) {
      connections.delete(connId);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return room as any as import("partykit/server").Room & {
    addConn(c: MockConn): void;
    removeConn(id: string): void;
  };
}

type MockRoom = ReturnType<typeof makeMockRoom>;

/** Helper: send JoinRoom message */
async function sendJoinRoom(
  rookRoom: RookRoom,
  conn: MockConn,
  playerId: string,
  displayName: string,
) {
  await rookRoom.onMessage(
    JSON.stringify({ type: "JoinRoom", playerId, displayName, seat: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn as any,
  );
}

/** Helper: send ClaimSeat message */
async function sendClaimSeat(rookRoom: RookRoom, conn: MockConn, seat: Seat) {
  await rookRoom.onMessage(
    JSON.stringify({ type: "ClaimSeat", seat }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn as any,
  );
}

/** Helper: start the game */
async function sendStartGame(rookRoom: RookRoom, conn: MockConn) {
  await rookRoom.onMessage(
    JSON.stringify({ type: "StartGame" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn as any,
  );
}

/** Helper: get parsed messages from a connection */
function getMessages(conn: MockConn) {
  return conn._sent.map((s) => JSON.parse(s) as { type: string; [k: string]: unknown });
}

/** Set up 4 players seated (N/E/S/W) and return their connections */
async function setupFourPlayerLobby(rookRoom: RookRoom, room: MockRoom) {
  const conns: Record<Seat, MockConn> = {
    N: makeMockConn("conn-N"),
    E: makeMockConn("conn-E"),
    S: makeMockConn("conn-S"),
    W: makeMockConn("conn-W"),
  };

  const players: Record<Seat, { id: string; name: string }> = {
    N: { id: "player-N", name: "Alice" },
    E: { id: "player-E", name: "Bob" },
    S: { id: "player-S", name: "Carol" },
    W: { id: "player-W", name: "Dave" },
  };

  for (const seat of ["N", "E", "S", "W"] as Seat[]) {
    room.addConn(conns[seat]);
    await sendJoinRoom(rookRoom, conns[seat], players[seat].id, players[seat].name);
    await sendClaimSeat(rookRoom, conns[seat], seat);
  }

  return conns;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RookRoom — reconnect race condition fixes", () => {
  let room: MockRoom;
  let rookRoom: RookRoom;

  beforeEach(() => {
    room = makeMockRoom();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rookRoom = new RookRoom(room as any);
  });

  // ── Change A: onClose stale guard (lobby) ─────────────────────────────────

  describe("onClose stale guard (lobby): does not evict seat of player who reconnected", () => {
    it("keeps seat in seatedPlayers when new conn joined before old conn onClose fires", async () => {
      const oldConn = makeMockConn("old-conn");
      const newConn = makeMockConn("new-conn");

      room.addConn(oldConn);
      await sendJoinRoom(rookRoom, oldConn, "player1", "Alice");
      await sendClaimSeat(rookRoom, oldConn, "N");

      // New conn joins for same player (reconnect before old close)
      room.addConn(newConn);
      await sendJoinRoom(rookRoom, newConn, "player1", "Alice");

      // Old conn closes — stale guard should prevent evicting N seat
      room.removeConn("old-conn");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(oldConn as any);

      // After stale close, new conn should get a LobbyUpdated showing N still occupied
      const msgs = getMessages(newConn);
      const lobbyUpdates = msgs.filter((m) => m.type === "LobbyUpdated") as Array<{
        type: string;
        seats: Array<{ seat: Seat; playerId: string | null }>;
      }>;

      expect(lobbyUpdates.length).toBeGreaterThan(0);
      const lastUpdate = lobbyUpdates[lobbyUpdates.length - 1]!;
      const seatN = lastUpdate.seats.find((s) => s.seat === "N");
      expect(seatN?.playerId).toBe("player1");
    });

    it("without the stale guard, old behavior would incorrectly evict — confirms guard is needed", async () => {
      // This test verifies the guard fires: old conn closing BEFORE new conn joins
      // should still evict the seat (normal disconnect).
      const oldConn = makeMockConn("old-conn-solo");

      room.addConn(oldConn);
      await sendJoinRoom(rookRoom, oldConn, "player-solo", "Solo");
      await sendClaimSeat(rookRoom, oldConn, "E");

      // Remove conn, then fire onClose (no reconnect happened — this is a real disconnect)
      room.removeConn("old-conn-solo");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(oldConn as any);

      // The seat should now be empty — normal disconnect
      // Connect a new observing conn to see the lobby state
      const observer = makeMockConn("observer");
      room.addConn(observer);
      await sendJoinRoom(rookRoom, observer, "observer-id", "Observer");

      const msgs = getMessages(observer);
      const welcome = msgs.find((m) => m.type === "Welcome") as {
        type: string;
        seats: Array<{ seat: Seat; playerId: string | null }>;
      } | undefined;
      expect(welcome).toBeDefined();
      const seatE = welcome?.seats.find((s) => s.seat === "E");
      // E should be empty (real disconnect)
      expect(seatE?.playerId).toBeNull();
    });
  });

  // ── Change B: onClose stale guard (playing) ───────────────────────────────

  describe("onClose stale guard (playing): does not send PlayerDisconnected for reconnected player", () => {
    it("suppresses PlayerDisconnected when stale close fires after player reconnected", async () => {
      const conns = await setupFourPlayerLobby(rookRoom, room);

      // Start the game
      await sendStartGame(rookRoom, conns.N);

      // Simulate reconnect race: new conn for N joins BEFORE old conn onClose fires
      const newConnN = makeMockConn("new-conn-N");
      room.addConn(newConnN);
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // Track messages to other connections after this point
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // Old conn fires onClose (stale close — player already reconnected)
      room.removeConn("conn-N");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(conns.N as any);

      // No PlayerDisconnected should be sent to other players
      const msgsE = getMessages(conns.E);
      const msgsS = getMessages(conns.S);
      const msgsW = getMessages(conns.W);

      expect(msgsE.filter((m) => m.type === "PlayerDisconnected")).toHaveLength(0);
      expect(msgsS.filter((m) => m.type === "PlayerDisconnected")).toHaveLength(0);
      expect(msgsW.filter((m) => m.type === "PlayerDisconnected")).toHaveLength(0);
    });

    it("still sends PlayerDisconnected for genuine disconnect (no reconnect)", async () => {
      const conns = await setupFourPlayerLobby(rookRoom, room);

      // Start the game
      await sendStartGame(rookRoom, conns.N);

      // Track messages after game starts
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // N genuinely disconnects (no new conn)
      room.removeConn("conn-N");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(conns.N as any);

      // PlayerDisconnected SHOULD be sent
      const msgsE = getMessages(conns.E);
      expect(msgsE.filter((m) => m.type === "PlayerDisconnected")).toHaveLength(1);
    });
  });

  // ── Change C: handleJoinRoom updates hostConnId ───────────────────────────

  describe("handleJoinRoom updates hostConnId when reconnecting host", () => {
    it("updates hostConnId so new host conn gets correct hostId in Welcome", async () => {
      const conns = await setupFourPlayerLobby(rookRoom, room);

      // Start the game
      await sendStartGame(rookRoom, conns.N);

      // Reconnect race: new conn for N (the host) joins
      const hostNewConn = makeMockConn("host-new-conn");
      room.addConn(hostNewConn);
      await sendJoinRoom(rookRoom, hostNewConn, "player-N", "Alice");

      // The Welcome sent to the new conn should show N as the host
      const msgs = getMessages(hostNewConn);
      const welcome = msgs.find((m) => m.type === "Welcome") as {
        type: string;
        hostId: string | null;
      } | undefined;

      expect(welcome).toBeDefined();
      // hostId should be player-N (i.e. the reconnected host's playerId)
      expect(welcome?.hostId).toBe("player-N");
    });

    it("reconnected host can still perform host actions after stale close fires", async () => {
      // In lobby: host disconnects and reconnects before old conn's onClose fires.
      // After new conn claims host status, old conn's stale close should not disrupt.
      const hostOldConn = makeMockConn("host-old");
      const conn2 = makeMockConn("conn-2");
      const conn3 = makeMockConn("conn-3");
      const conn4 = makeMockConn("conn-4");

      room.addConn(hostOldConn);
      room.addConn(conn2);
      room.addConn(conn3);
      room.addConn(conn4);

      await sendJoinRoom(rookRoom, hostOldConn, "host-player", "HostAlice");
      await sendJoinRoom(rookRoom, conn2, "player2", "Bob");
      await sendJoinRoom(rookRoom, conn3, "player3", "Carol");
      await sendJoinRoom(rookRoom, conn4, "player4", "Dave");

      await sendClaimSeat(rookRoom, hostOldConn, "N");
      await sendClaimSeat(rookRoom, conn2, "E");
      await sendClaimSeat(rookRoom, conn3, "S");
      await sendClaimSeat(rookRoom, conn4, "W");

      // Reconnect in lobby: new host conn joins BEFORE old conn's close
      const hostNewConn = makeMockConn("host-new");
      room.addConn(hostNewConn);
      await sendJoinRoom(rookRoom, hostNewConn, "host-player", "HostAlice");

      // Stale close of old host conn fires
      room.removeConn("host-old");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(hostOldConn as any);

      // New host conn should be able to start the game
      await sendStartGame(rookRoom, hostNewConn);

      const msgs = getMessages(hostNewConn);
      const errors = msgs.filter((m) => m.type === "CommandError");
      const batches = msgs.filter((m) => m.type === "EventBatch");

      expect(errors).toHaveLength(0);
      expect(batches.length).toBeGreaterThan(0);
    });
  });
});
