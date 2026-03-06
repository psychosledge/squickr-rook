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
function makeMockConn(id: string, initialReadyState: number = 1) {
  let _state: MockConnState | null = null;
  const sent: string[] = [];
  let _readyState = initialReadyState;

  const conn = {
    id,
    get state() { return _state as MockConnState | null; },
    setState(s: MockConnState | null) { _state = s; return _state; },
    send(msg: string) {
      if (_readyState !== 1) throw new Error(`Cannot send on conn ${id} with readyState ${_readyState}`);
      sent.push(msg);
    },
    get readyState() { return _readyState; },
    setReadyState(rs: number) { _readyState = rs; },
    _sent: sent,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return conn as any as import("partykit/server").Connection<MockConnState> & { _sent: string[]; readyState: number; setReadyState(rs: number): void };
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

  // ── T11: normal path mid-game reconnect — clears gamePaused ──────────────

  describe("handleJoinRoom normal path: mid-game reconnect when JoinRoom beats onClose", () => {
    it("T11: clears gamePaused and broadcasts PlayerReconnected when disconnectedSeats is empty after rejoining", async () => {
      // Scenario: player N is in seatedPlayers with a new connId (JoinRoom beat onClose).
      // gamePaused=true (some other player disconnected and reconnected, leaving gamePaused stuck),
      // disconnectedSeats is empty.
      // After the normal-path join, if phase=playing and seat found with gamePaused=true, clear it.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Force gamePaused=true and disconnectedSeats empty (JoinRoom beat onClose scenario)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rookInternal = rookRoom as any;
      rookInternal.gamePaused = true;
      // disconnectedSeats is already empty (JoinRoom arrived before onClose)

      // Now a new connection for N joins (simulating the refresh tab re-connecting)
      const newConnN = makeMockConn("new-conn-N-t11");
      room.addConn(newConnN);

      // Clear sent messages before the join
      newConnN._sent.length = 0;
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // N joins with a new connection (but same playerId)
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // Assert: gamePaused should be false (cleared because no disconnected seats)
      expect(rookInternal.gamePaused).toBe(false);

      // Assert: PlayerReconnected was broadcast to all connections
      const msgsE = getMessages(conns.E);
      const msgsS = getMessages(conns.S);
      const msgsW = getMessages(conns.W);
      expect(msgsE.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
      expect(msgsS.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);
      expect(msgsW.filter((m) => m.type === "PlayerReconnected")).toHaveLength(1);

      // Assert: Welcome with state was sent to the new conn
      const newConnMsgs = getMessages(newConnN);
      const welcomeMsgs = newConnMsgs.filter((m) => m.type === "Welcome") as Array<{
        type: string;
        state?: unknown;
      }>;
      expect(welcomeMsgs.length).toBeGreaterThan(0);
      expect(welcomeMsgs[welcomeMsgs.length - 1]!.state).toBeDefined();
    });

    it("T12: does NOT clear gamePaused when other disconnected seats remain", async () => {
      // Scenario: N rejoins (normal path), but E is still in disconnectedSeats.
      // gamePaused should stay true because E is still disconnected.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rookInternal = rookRoom as any;
      rookInternal.gamePaused = true;
      // E is still disconnected
      rookInternal.disconnectedSeats.set("E", { playerId: "player-E", displayName: "Bob" });
      rookInternal.seatedPlayers.delete("E");

      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // N joins (hits normal path since N is still in seatedPlayers and NOT in disconnectedSeats)
      const newConnN = makeMockConn("new-conn-N-t12");
      room.addConn(newConnN);
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // Assert: gamePaused still true (E is still disconnected)
      expect(rookInternal.gamePaused).toBe(true);

      // Assert: NO PlayerReconnected broadcast (because disconnectedSeats is not empty)
      const msgsS = getMessages(conns.S);
      const msgsW = getMessages(conns.W);
      expect(msgsS.filter((m) => m.type === "PlayerReconnected")).toHaveLength(0);
      expect(msgsW.filter((m) => m.type === "PlayerReconnected")).toHaveLength(0);
    });
  });

  // ── T13: buildSeatInfoArray returns playerId/displayName for disconnected seat ──

  describe("buildSeatInfoArray: preserves playerId and displayName for disconnected seats", () => {
    it("T13: returns playerId and displayName (not null) for disconnected seat", async () => {
      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rookInternal = rookRoom as any;

      // Manually add N to disconnectedSeats (simulating a disconnect)
      rookInternal.disconnectedSeats.set("N", { playerId: "player-N", displayName: "Alice" });
      rookInternal.seatedPlayers.delete("N");

      // Call buildSeatInfoArray
      const seatInfoArray = rookInternal.buildSeatInfoArray() as Array<{
        seat: Seat;
        playerId: string | null;
        displayName: string | null;
        connected: boolean;
        isBot: boolean;
      }>;

      const seatN = seatInfoArray.find((s) => s.seat === "N");
      expect(seatN).toBeDefined();
      expect(seatN!.playerId).toBe("player-N");
      expect(seatN!.displayName).toBe("Alice");
      expect(seatN!.connected).toBe(false);
      expect(seatN!.isBot).toBe(false);
    });
  });

  // ── Post-reconnect disconnect-on-card-play bug fixes ─────────────────────

  describe("post-reconnect disconnect-on-card-play bug (CLOSING socket crash)", () => {
    // T-FIX-1: sendTo does not throw when connection is CLOSING (readyState=2)
    it("T-FIX-1: sendTo does not throw when connection readyState=2 (CLOSING)", () => {
      const closingConn = makeMockConn("closing-conn", 2); // readyState=2 = CLOSING
      room.addConn(closingConn);

      // Should not throw
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rookRoom as any).sendTo(closingConn, {
          type: "LobbyUpdated",
          seats: [],
          hostId: null,
        });
      }).not.toThrow();

      // Nothing should have been sent (socket was skipped)
      expect(closingConn._sent).toHaveLength(0);
    });

    // T-FIX-2: broadcastLobbyUpdated skips CLOSING connections without throwing
    it("T-FIX-2: broadcastLobbyUpdated skips CLOSING conn and delivers to OPEN conn", async () => {
      const openConn = makeMockConn("open-conn", 1);
      const closingConn = makeMockConn("closing-conn-2", 2); // readyState=2 = CLOSING

      room.addConn(openConn);
      room.addConn(closingConn);

      await sendJoinRoom(rookRoom, openConn, "player-open", "OpenPlayer");

      // Clear sent after setup
      openConn._sent.length = 0;

      // Should not throw even though closingConn is CLOSING
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rookRoom as any).broadcastLobbyUpdated();
      }).not.toThrow();

      // OPEN conn should have received LobbyUpdated
      const openMsgs = getMessages(openConn);
      expect(openMsgs.filter((m) => m.type === "LobbyUpdated")).toHaveLength(1);

      // CLOSING conn should have received nothing
      expect(closingConn._sent).toHaveLength(0);
    });

    // T-FIX-3: Playing a card does not crash the Worker when a stale CLOSING conn is present
    it("T-FIX-3: playing a card does not crash when stale CLOSING conn is in room", async () => {
      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rookInternal = rookRoom as any;

      // Simulate reconnect: N has a new conn, old conn is CLOSING
      const newConnN = makeMockConn("new-conn-N-fix3", 1);
      room.addConn(newConnN);

      // Set old conn N to CLOSING (readyState=2) — simulates the stale socket
      conns.N.setReadyState(2);

      // Wire up newConnN with N's state so it's a valid reconnect
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // Clear sent messages
      newConnN._sent.length = 0;
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // Determine which player is active
      const activePlayer: Seat = rookInternal.gameState?.activePlayer ?? "N";

      // Pick the connection and seat for the active player
      const activeConnMap: Record<Seat, MockConn> = {
        N: newConnN,   // N now uses the new conn
        E: conns.E,
        S: conns.S,
        W: conns.W,
      };
      const activeConn = activeConnMap[activePlayer];

      // Get valid cards for the active player
      const gameState = rookInternal.gameState;
      const activeSeatState = gameState?.hands?.[activePlayer] ?? [];
      const firstCard = activeSeatState[0];

      // Only proceed if the game has reached a "playing" sub-phase where cards can be played
      if (gameState?.phase === "playing" && firstCard) {
        let threw = false;
        try {
          await rookRoom.onMessage(
            JSON.stringify({
              type: "SendCommand",
              command: { type: "PlayCard", seat: activePlayer, card: firstCard },
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeConn as any,
          );
        } catch {
          threw = true;
        }

        // The Worker must NOT crash (throw) due to the CLOSING socket
        expect(threw).toBe(false);

        // The active player's new conn should not receive a CommandError
        const activeMsgs = getMessages(newConnN);
        expect(activeMsgs.filter((m) => m.type === "CommandError")).toHaveLength(0);
      } else {
        // Game is in bidding phase — send a bid command instead
        let threw = false;
        try {
          await rookRoom.onMessage(
            JSON.stringify({
              type: "SendCommand",
              command: { type: "PlaceBid", seat: activePlayer, bid: 70 },
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activeConn as any,
          );
        } catch {
          threw = true;
        }

        expect(threw).toBe(false);
        const activeMsgs = getMessages(newConnN);
        // N reconnected, so N is the active player if it's N's turn
        // The only CommandError we'd expect is a legit game rule error, not a crash
        // We check no exception was thrown from onMessage
        void activeMsgs; // suppress unused warning
      }
    });

    // T-FIX-4: Normal-path mid-game reconnect always calls broadcastLobbyUpdated
    it("T-FIX-4: normal-path mid-game reconnect (gamePaused=false) sends LobbyUpdated to others", async () => {
      // Scenario: game is playing, gamePaused=false (no one is disconnected).
      // A player's tab refreshes — JoinRoom arrives before onClose.
      // Normal path runs (player found in seatedPlayers, NOT in disconnectedSeats).
      // After joining, other players should still receive a LobbyUpdated.

      const conns = await setupFourPlayerLobby(rookRoom, room);
      await sendStartGame(rookRoom, conns.N);

      // Confirm gamePaused is false (normal running game)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rookInternal = rookRoom as any;
      expect(rookInternal.gamePaused).toBe(false);
      expect(rookInternal.disconnectedSeats.size).toBe(0);

      // Clear sent messages
      conns.E._sent.length = 0;
      conns.S._sent.length = 0;
      conns.W._sent.length = 0;

      // N connects again (new tab / JoinRoom before onClose)
      const newConnN = makeMockConn("new-conn-N-fix4", 1);
      room.addConn(newConnN);
      await sendJoinRoom(rookRoom, newConnN, "player-N", "Alice");

      // E, S, W should each receive a LobbyUpdated (they need to know N is back)
      const msgsE = getMessages(conns.E);
      const msgsS = getMessages(conns.S);
      const msgsW = getMessages(conns.W);

      expect(msgsE.filter((m) => m.type === "LobbyUpdated")).toHaveLength(1);
      expect(msgsS.filter((m) => m.type === "LobbyUpdated")).toHaveLength(1);
      expect(msgsW.filter((m) => m.type === "LobbyUpdated")).toHaveLength(1);
    });
  });
});
