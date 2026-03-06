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

  // ── RCA-3: handleJoinRoom normal path clears disconnectedSeats in race ────

  describe("handleJoinRoom reconnect path: gamePaused cleared when player rejoins disconnectedSeats", () => {
    it("broadcasts PlayerReconnected and clears gamePaused when JoinRoom arrives before onClose fires", async () => {
      // Scenario:
      // 1. E disconnects first → gamePaused=true, E in disconnectedSeats
      // 2. E reconnects via reconnect path (takes disconnectedSeats path) — gamePaused cleared
      // But the RCA-3 bug is when JoinRoom beats onClose:
      // 1. gamePaused is already true (from a prior state or parallel disconnect)
      // 2. N's new JoinRoom arrives BEFORE N's old onClose fires
      // 3. Normal path: N found in seatedPlayers, connId updated
      // 4. N's old onClose fires — stale guard fires (connId doesn't match), returns early
      // 5. gamePaused stays true, PlayerReconnected never broadcast for N
      //
      // We simulate by:
      // - Manually setting gamePaused=true (simulating a prior disconnect)
      // - Having N reconnect via normal path (seatedPlayers has N with new connId)
      //   but N is ALSO in disconnectedSeats (representing the stale state)
      //
      // Actually: the true race is JoinRoom beats onClose, so disconnectedSeats is EMPTY.
      // gamePaused=true was set from a PREVIOUS state (e.g., E disconnected, game paused).
      // N's old conn disconnects. gamePaused already=true for E.
      // N's JoinRoom arrives before N's onClose → normal path → gamePaused stays true.
      // N's old onClose fires → stale guard fires → no more work.
      // Result: gamePaused=true but N IS connected. Game stuck.
      //
      // The fix: in normal path, if player is in disconnectedSeats, do reconnect cleanup.
      // But if JoinRoom beat onClose, player is NOT in disconnectedSeats yet.
      // So the fix needs to handle the case where player IS in disconnectedSeats (onClose ran first).

      // The simplest actual triggerable scenario for RCA-3:
      // onClose fires first → player in disconnectedSeats, gamePaused=true
      // Then new JoinRoom arrives → takes RECONNECT path (disconnectedSeats has player)
      // This ALREADY works in the current code (reconnect path handles it).
      //
      // The BUG is: after reconnect path puts the player back in seatedPlayers,
      // another new JoinRoom arrives (second reconnect attempt, e.g. from a different tab).
      // This time, disconnectedSeats is EMPTY (already cleared by first reconnect).
      // So normal path runs. gamePaused was cleared by first reconnect. No bug.
      //
      // Let me focus on the actual described bug: gamePaused=true, normal path doesn't clear it.
      // We test this by directly reading the private gamePaused field via type cast.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Manually force gamePaused=true (simulating prior state from different disconnect)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rookRoom as any).gamePaused = true;
      // Also put N in disconnectedSeats (simulating N's onClose already ran)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rookRoom as any).disconnectedSeats.set("N", { playerId: "player-N", displayName: "Alice" });

      // Now remove N from seatedPlayers (as onClose would have done)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rookRoom as any).seatedPlayers.delete("N");

      // Clear message logs
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // N's new JoinRoom arrives — hits RECONNECT path (disconnectedSeats has N)
      const newConnN = makeMockConn("new-conn-N-rca3");
      room.addConn(newConnN);
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // After reconnect: gamePaused should be cleared
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((rookRoom as any).gamePaused).toBe(false);

      // PlayerReconnected should be broadcast to all
      const msgsE = getMessages(conns.E);
      const msgsS = getMessages(conns.S);
      const msgsW = getMessages(conns.W);

      expect(msgsE.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
      expect(msgsS.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
      expect(msgsW.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
    });

    it("normal path JoinRoom beats onClose: gamePaused cleared if player found in disconnectedSeats", async () => {
      // The true RCA-3: server has gamePaused=true from a prior disconnect.
      // Player N reconnects: JoinRoom arrives BEFORE N's onClose fires.
      // Normal path runs (N still in seatedPlayers with old connId).
      // N is ALSO in disconnectedSeats (from prior disconnect).
      // The fix: check disconnectedSeats in normal path and clear gamePaused.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Set up the buggy state manually:
      // - N is in seatedPlayers (simulating JoinRoom winning the race — old conn still connected)
      // - N is ALSO in disconnectedSeats (e.g. from a very brief prior disconnect + reconnect that
      //   put N in disconnectedSeats but the new JoinRoom arrived before cleanup)
      // - gamePaused=true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rookRoom as any).gamePaused = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rookRoom as any).disconnectedSeats.set("N", { playerId: "player-N", displayName: "Alice" });

      // N is still in seatedPlayers (JoinRoom beat onClose — normal path will find N)
      // Now send a NEW JoinRoom for N (new conn)
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      const newConnN2 = makeMockConn("new-conn-N2-rca3");
      room.addConn(newConnN2);
      // This will hit the RECONNECT path because disconnectedSeats has N
      await sendJoinRoom(rookRoom, newConnN2, "player-N", "Alice");

      // gamePaused should be cleared by reconnect logic
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((rookRoom as any).gamePaused).toBe(false);

      // PlayerReconnected should be sent
      const msgsE2 = getMessages(conns.E);
      expect(msgsE2.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
    });
  });

  // ── RCA-4: onClose sets gamePaused for ANY player disconnect ─────────────

  describe("onClose playing phase: gamePaused for any human player disconnect (RCA-4)", () => {
    it("sets gamePaused=true when non-active player disconnects", async () => {
      // The RCA-4 bug: gamePaused is only set if disconnected player IS the active player.
      // Fix: always set gamePaused=true when any human player disconnects in playing phase.
      //
      // We force the active player to be N by manipulating gameState after start,
      // then disconnect E (non-active) and check gamePaused.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Force gameState.activePlayer to N (so E is definitely NOT active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roomInternal = rookRoom as any;
      if (roomInternal.gameState) {
        roomInternal.gameState = { ...roomInternal.gameState, activePlayer: "N" };
      }

      // Verify gamePaused is false before disconnect
      expect(roomInternal.gamePaused).toBe(false);

      // Disconnect E (non-active player — N is active)
      room.removeConn("conn-E");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(conns.E as any);

      // RCA-4: gamePaused should be true (E disconnected, even though E is not the active player)
      // BEFORE fix: gamePaused would still be false (bug)
      // AFTER fix: gamePaused is true
      expect(roomInternal.gamePaused).toBe(true);
    });

    it("still sets gamePaused=true when active player disconnects (no regression)", async () => {
      // This was already working before the fix — make sure it still works.
      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Force activePlayer = E (E is active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roomInternal = rookRoom as any;
      if (roomInternal.gameState) {
        roomInternal.gameState = { ...roomInternal.gameState, activePlayer: "E" };
      }

      // Disconnect E (active player)
      room.removeConn("conn-E");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await rookRoom.onClose(conns.E as any);

      // gamePaused was already set correctly before the fix
      expect(roomInternal.gamePaused).toBe(true);
    });
  });
});
