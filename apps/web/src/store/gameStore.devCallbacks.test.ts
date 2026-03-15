/**
 * Tests for the dev-logging callbacks wired into _applyEvents.
 *
 * Regression coverage for the Hand 0 bug:
 *   Hand 0 is dealt by the GameStarted event (no HandStarted event is emitted
 *   for it), so _devOnHandStart must also fire on GameStarted — otherwise the
 *   very first hand is never reported to the logger and startingHands stays
 *   empty in the log.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGameStore } from "./gameStore";
import { INITIAL_STATE, DEFAULT_RULES, BOT_PRESETS, applyEvent } from "@rook/engine";
import type { GameEvent } from "@rook/engine";

function resetStore() {
  useGameStore.setState({
    gameState: null,
    eventLog: [],
    overlay: "none",
    pendingDiscards: [],
    pendingHandScore: null,
    botTimeoutId: null,
    botDifficulties: { E: 3, S: 3, W: 3 },
    announcement: null,
    gameOverReason: null,
    _devOnHandStart: undefined,
    _devOnHandComplete: undefined,
    _devOnBidEvent: undefined,
    _devOnBotDecision: undefined,
  });
}

const GAME_STARTED_EVENT: GameEvent = {
  type: "GameStarted",
  seed: 42,
  dealer: "N",
  players: [
    { seat: "N", name: "You",  kind: "human" },
    { seat: "E", name: "P2", kind: "bot", botProfile: BOT_PRESETS[3] },
    { seat: "S", name: "P3", kind: "bot", botProfile: BOT_PRESETS[3] },
    { seat: "W", name: "P4", kind: "bot", botProfile: BOT_PRESETS[3] },
  ],
  rules: DEFAULT_RULES,
  timestamp: 1000,
};

const HAND_STARTED_EVENT: GameEvent = {
  type: "HandStarted",
  handNumber: 1,
  dealer: "E",
  timestamp: 5000,
};

describe("gameStore _applyEvents — _devOnHandStart callback", () => {
  beforeEach(() => {
    resetStore();
  });

  it("fires _devOnHandStart when a HandStarted event is processed", () => {
    // Arrange: pre-seed a game state so HandStarted can be applied
    const stateAfterGame = applyEvent(INITIAL_STATE, GAME_STARTED_EVENT);
    useGameStore.setState({ gameState: stateAfterGame });

    const callback = vi.fn();
    useGameStore.setState({ _devOnHandStart: callback });

    // Act
    useGameStore.getState()._applyEvents([HAND_STARTED_EVENT]);

    // Assert
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      HAND_STARTED_EVENT.timestamp,
      expect.objectContaining({ phase: "bidding" }),
    );
  });

  it("fires _devOnHandStart when a GameStarted event is processed (Hand 0 regression)", () => {
    // Arrange: the very first event of a game is GameStarted — there is NO
    // preceding HandStarted for hand 0, so _devOnHandStart must fire here too.
    const callback = vi.fn();
    useGameStore.setState({ _devOnHandStart: callback });

    // Act: process the GameStarted event through _applyEvents, simulating
    // the event being processed by the store.
    useGameStore.getState()._applyEvents([GAME_STARTED_EVENT]);

    // Assert: the callback should have been called exactly once, with the
    // timestamp from the GameStarted event and the resulting GameState.
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      GAME_STARTED_EVENT.timestamp,
      expect.objectContaining({ phase: "bidding" }),
    );
  });

  it("does not fire _devOnHandStart when _devOnHandStart is undefined", () => {
    // Sanity check: no error is thrown when the callback is not registered.
    useGameStore.setState({ _devOnHandStart: undefined });
    expect(() => {
      useGameStore.getState()._applyEvents([GAME_STARTED_EVENT]);
    }).not.toThrow();
  });

  it("fires _devOnHandStart when startGame() is called (production path)", () => {
    // Arrange: register the callback before starting a game.
    // This is the real production path — startGame() must route through
    // _applyEvents so the callback fires for Hand 0.
    const callback = vi.fn();
    useGameStore.setState({ _devOnHandStart: callback });

    // Act
    useGameStore.getState().startGame({ E: 3, S: 3, W: 3 });

    // Assert: callback fired exactly once with (timestamp: number, gameState)
    expect(callback).toHaveBeenCalledOnce();
    const [timestamp, gameState] = callback.mock.calls[0]!;
    expect(typeof timestamp).toBe("number");
    expect(gameState).toMatchObject({ phase: "bidding" });
  });
});
