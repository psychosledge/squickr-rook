import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { GameState } from "@rook/engine";
import { DEFAULT_RULES, BOT_PRESETS } from "@rook/engine";
import { OnlineGamePageView, buildPlayAgainHandler, buildLeaveGameHandler, shouldShowReconnecting } from "./OnlineGamePage";
import type { OnlineGamePageViewProps } from "./OnlineGamePage";

// Mock CSS modules
vi.mock("./OnlineGamePage.module.css", () => ({
  default: { page: "page" },
}));

// Mock all child components — they stay as function-type elements in the tree
vi.mock("@/components/ScoreBar/ScoreBar", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/AnnouncementBanner/AnnouncementBanner", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/BiddingOverlay/BiddingOverlay", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/NestOverlay/NestOverlay", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/TrumpPicker/TrumpPicker", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/HandResultOverlay/HandResultOverlay", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/GameOverScreen/GameOverScreen", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/GameTable/GameTable", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/HandHistoryModal/HandHistoryModal", () => ({
  default: (_props: unknown) => null,
}));

vi.mock("@/components/DisconnectAlert/DisconnectAlert", () => ({
  DisconnectAlert: (_props: unknown) => null,
}));

vi.mock("@/utils/sortHand", () => ({
  sortHand: (hand: unknown[]) => hand,
}));

vi.mock("@/utils/handHistory", () => ({
  buildHandHistoryRows: (h: unknown[]) => h,
}));

// ---------------------------------------------------------------------------
// Import mocked modules to get function references for comparison
// ---------------------------------------------------------------------------

import ScoreBar from "@/components/ScoreBar/ScoreBar";
import AnnouncementBanner from "@/components/AnnouncementBanner/AnnouncementBanner";
import BiddingOverlay from "@/components/BiddingOverlay/BiddingOverlay";
import NestOverlay from "@/components/NestOverlay/NestOverlay";
import TrumpPicker from "@/components/TrumpPicker/TrumpPicker";
import HandResultOverlay from "@/components/HandResultOverlay/HandResultOverlay";
import GameOverScreen from "@/components/GameOverScreen/GameOverScreen";
import GameTable from "@/components/GameTable/GameTable";
import HandHistoryModal from "@/components/HandHistoryModal/HandHistoryModal";
import { DisconnectAlert } from "@/components/DisconnectAlert/DisconnectAlert";

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function flattenElements(node: React.ReactNode): React.ReactElement[] {
  if (node == null || typeof node !== "object") return [];
  if (!React.isValidElement(node)) return [];
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return [el, ...childNodes.flatMap(flattenElements)];
}

/** Find elements whose React element type equals the given component function */
function findByType(
  elements: React.ReactElement[],
  // eslint-disable-next-line @typescript-eslint/ban-types
  componentType: Function,
): React.ReactElement[] {
  return elements.filter((el) => el.type === componentType);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    phase: "bidding",
    rules: DEFAULT_RULES,
    players: [
      { seat: "N", name: "You", kind: "human" },
      { seat: "E", name: "P2", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "S", name: "P3", kind: "bot", botProfile: BOT_PRESETS[3] },
      { seat: "W", name: "P4", kind: "bot", botProfile: BOT_PRESETS[3] },
    ],
    handNumber: 1,
    dealer: "W",
    seed: 42,
    activePlayer: "N",
    hands: { N: [], E: [], S: [], W: [] },
    nest: [],
    originalNest: [],
    discarded: [],
    trump: null,
    currentTrick: [],
    tricksPlayed: 0,
    completedTricks: [],
    capturedCards: { NS: [], EW: [] },
    scores: { NS: 0, EW: 0 },
    handHistory: [],
    winner: null,
    playedCards: [],
    bids: { N: null, E: null, S: null, W: null },
    moonShooters: [],
    currentBid: 0,
    bidder: null,
    bidAmount: 0,
    shotMoon: false,
    ...overrides,
  };
}

function makeHandScore() {
  return {
    hand: 1,
    bidder: "N" as const,
    bidAmount: 120,
    nestCards: [] as string[],
    discarded: [] as string[],
    nsPointCards: 120,
    ewPointCards: 0,
    nsMostCardsBonus: 0,
    ewMostCardsBonus: 0,
    nsNestBonus: 0,
    ewNestBonus: 0,
    nsWonLastTrick: false,
    ewWonLastTrick: false,
    nsTotal: 120,
    ewTotal: 0,
    nsDelta: 120,
    ewDelta: -120,
    shotMoon: false,
    moonShooterWentSet: false,
  };
}

function makeProps(overrides: Partial<OnlineGamePageViewProps> = {}): OnlineGamePageViewProps {
  return {
    gameState: makeGameState(),
    overlay: "none",
    pendingDiscards: [],
    pendingHandScore: null,
    mySeat: "N",
    announcement: null,
    gameOverReason: null,
    historyModalOpen: false,
    biddingThinkingSeat: null,
    humanTeam: "NS",
    disconnectedAlert: null,
    isHost: false,
    onReplaceWithBot: vi.fn(),
    onDismissDisconnectAlert: vi.fn(),
    onPlayCard: vi.fn(),
    onToggleDiscard: vi.fn(),
    onConfirmDiscards: vi.fn(),
    onSelectTrump: vi.fn(),
    onAcknowledgeHandResult: vi.fn(),
    onPlaceBid: vi.fn(),
    onPassBid: vi.fn(),
    onShootMoon: vi.fn(),
    clearAnnouncement: vi.fn(),
    openHistoryModal: vi.fn(),
    closeHistoryModal: vi.fn(),
    onPlayAgain: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OnlineGamePageView", () => {

  it("1. renders ScoreBar", () => {
    const tree = OnlineGamePageView(makeProps());
    const all = flattenElements(tree);
    expect(findByType(all, ScoreBar)).toHaveLength(1);
  });

  it("2. renders AnnouncementBanner with announcement + clearAnnouncement props", () => {
    const clearAnnouncement = vi.fn();
    const tree = OnlineGamePageView(makeProps({ announcement: "Hello!", clearAnnouncement }));
    const all = flattenElements(tree);
    const banners = findByType(all, AnnouncementBanner);
    expect(banners).toHaveLength(1);
    const p = banners[0].props as Record<string, unknown>;
    expect(p.announcement).toBe("Hello!");
    expect(p.clearAnnouncement).toBe(clearAnnouncement);
  });

  it("3. renders BiddingOverlay when overlay='bidding'", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "bidding" }));
    const all = flattenElements(tree);
    expect(findByType(all, BiddingOverlay)).toHaveLength(1);
  });

  it("4. does NOT render BiddingOverlay when overlay='none'", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "none" }));
    const all = flattenElements(tree);
    expect(findByType(all, BiddingOverlay)).toHaveLength(0);
  });

  it("5. BiddingOverlay gets humanSeat='E' when mySeat='E'", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "bidding", mySeat: "E" }));
    const all = flattenElements(tree);
    const overlays = findByType(all, BiddingOverlay);
    expect(overlays).toHaveLength(1);
    const p = overlays[0].props as Record<string, unknown>;
    expect(p.humanSeat).toBe("E");
  });

  it("6. BiddingOverlay gets humanSeat='N' when mySeat=null", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "bidding", mySeat: null }));
    const all = flattenElements(tree);
    const overlays = findByType(all, BiddingOverlay);
    expect(overlays).toHaveLength(1);
    const p = overlays[0].props as Record<string, unknown>;
    expect(p.humanSeat).toBe("N");
  });

  it("7. renders NestOverlay when overlay='nest'", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "nest" }));
    const all = flattenElements(tree);
    expect(findByType(all, NestOverlay)).toHaveLength(1);
  });

  it("8. NestOverlay.hand uses mySeat's hand (not hardcoded 'N')", () => {
    const eHand = ["E1", "E2", "E3"] as unknown as import("@rook/engine").CardId[];
    const gameState = makeGameState({
      hands: { N: [], E: eHand, S: [], W: [] },
    });
    const tree = OnlineGamePageView(makeProps({ overlay: "nest", gameState, mySeat: "E" }));
    const all = flattenElements(tree);
    const nestOverlays = findByType(all, NestOverlay);
    expect(nestOverlays).toHaveLength(1);
    const p = nestOverlays[0].props as Record<string, unknown>;
    // sortHand is mocked to return its input, filter removes "ROOK"
    expect(p.hand).toEqual(eHand);
  });

  it("9. NestOverlay is NOT rendered when overlay='nest' but mySeat=null", () => {
    const nHand = ["N1", "N2"] as unknown as import("@rook/engine").CardId[];
    const gameState = makeGameState({
      hands: { N: nHand, E: [], S: [], W: [] },
    });
    const tree = OnlineGamePageView(makeProps({ overlay: "nest", gameState, mySeat: null }));
    const all = flattenElements(tree);
    const nestOverlays = findByType(all, NestOverlay);
    expect(nestOverlays).toHaveLength(0);
  });

  it("10. renders TrumpPicker when overlay='trump'", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "trump" }));
    const all = flattenElements(tree);
    expect(findByType(all, TrumpPicker)).toHaveLength(1);
  });

  it("11. renders HandResultOverlay when overlay='hand-result' AND pendingHandScore non-null", () => {
    const tree = OnlineGamePageView(
      makeProps({ overlay: "hand-result", pendingHandScore: makeHandScore() }),
    );
    const all = flattenElements(tree);
    expect(findByType(all, HandResultOverlay)).toHaveLength(1);
  });

  it("12. HandResultOverlay NOT rendered when pendingHandScore is null", () => {
    const tree = OnlineGamePageView(
      makeProps({ overlay: "hand-result", pendingHandScore: null }),
    );
    const all = flattenElements(tree);
    expect(findByType(all, HandResultOverlay)).toHaveLength(0);
  });

  it("13. renders GameOverScreen when overlay='game-over' AND gameState.winner set", () => {
    const gameState = makeGameState({ winner: "NS", phase: "finished" });
    const tree = OnlineGamePageView(
      makeProps({ overlay: "game-over", gameState }),
    );
    const all = flattenElements(tree);
    expect(findByType(all, GameOverScreen)).toHaveLength(1);
  });

  it("14. GameOverScreen NOT rendered when winner is null", () => {
    const gameState = makeGameState({ winner: null });
    const tree = OnlineGamePageView(
      makeProps({ overlay: "game-over", gameState }),
    );
    const all = flattenElements(tree);
    expect(findByType(all, GameOverScreen)).toHaveLength(0);
  });

  it("15. renders HandHistoryModal when historyModalOpen=true", () => {
    const tree = OnlineGamePageView(makeProps({ historyModalOpen: true }));
    const all = flattenElements(tree);
    expect(findByType(all, HandHistoryModal)).toHaveLength(1);
  });

  it("16. HandHistoryModal NOT rendered when historyModalOpen=false", () => {
    const tree = OnlineGamePageView(makeProps({ historyModalOpen: false }));
    const all = flattenElements(tree);
    expect(findByType(all, HandHistoryModal)).toHaveLength(0);
  });

  it("17. GameTable receives seatNames prop when seatNames is provided", () => {
    const seatNames = { N: "Alice", E: "Bob" };
    const tree = OnlineGamePageView(makeProps({ seatNames }));
    const all = flattenElements(tree);
    const tables = findByType(all, GameTable);
    expect(tables).toHaveLength(1);
    const p = tables[0].props as Record<string, unknown>;
    expect(p.seatNames).toEqual(seatNames);
  });

  it("18. GameTable receives undefined seatNames when prop is omitted", () => {
    const tree = OnlineGamePageView(makeProps());
    const all = flattenElements(tree);
    const tables = findByType(all, GameTable);
    expect(tables).toHaveLength(1);
    const p = tables[0].props as Record<string, unknown>;
    expect(p.seatNames).toBeUndefined();
  });

  it("19. NestOverlay is NOT rendered when overlay='nest' and mySeat=null (guard test)", () => {
    const tree = OnlineGamePageView(makeProps({ overlay: "nest", mySeat: null }));
    const all = flattenElements(tree);
    expect(findByType(all, NestOverlay)).toHaveLength(0);
  });

  it("20. NestOverlay uses mySeat hand directly when mySeat is non-null", () => {
    const wHand = ["W1", "W2", "W3"] as unknown as import("@rook/engine").CardId[];
    const gameState = makeGameState({
      hands: { N: [], E: [], S: [], W: wHand },
    });
    const tree = OnlineGamePageView(makeProps({ overlay: "nest", gameState, mySeat: "W" }));
    const all = flattenElements(tree);
    const nestOverlays = findByType(all, NestOverlay);
    expect(nestOverlays).toHaveLength(1);
    const p = nestOverlays[0].props as Record<string, unknown>;
    expect(p.hand).toEqual(wHand);
  });

  it("21. BiddingOverlay does NOT receive seatNames prop (moved to GameTable)", () => {
    const seatNames = { N: "Alice", E: "Bob" };
    const tree = OnlineGamePageView(makeProps({ overlay: "bidding", seatNames }));
    const all = flattenElements(tree);
    const overlays = findByType(all, BiddingOverlay);
    expect(overlays).toHaveLength(1);
    const p = overlays[0].props as Record<string, unknown>;
    expect(p.seatNames).toBeUndefined();
  });

  it("22. GameTable receives humanSeat=mySeat when mySeat is non-null", () => {
    const tree = OnlineGamePageView(makeProps({ mySeat: "E" }));
    const all = flattenElements(tree);
    const tables = findByType(all, GameTable);
    expect(tables).toHaveLength(1);
    const p = tables[0].props as Record<string, unknown>;
    expect(p.humanSeat).toBe("E");
  });

  it("23. GameTable receives humanSeat='N' when mySeat=null", () => {
    const tree = OnlineGamePageView(makeProps({ mySeat: null }));
    const all = flattenElements(tree);
    const tables = findByType(all, GameTable);
    expect(tables).toHaveLength(1);
    const p = tables[0].props as Record<string, unknown>;
    expect(p.humanSeat).toBe("N");
  });

  it("24. GameOverScreen receives humanTeam prop when overlay='game-over'", () => {
    const gameState = makeGameState({ winner: "EW", phase: "finished" });
    const tree = OnlineGamePageView(
      makeProps({ overlay: "game-over", gameState, humanTeam: "EW" }),
    );
    const all = flattenElements(tree);
    const screens = findByType(all, GameOverScreen);
    expect(screens).toHaveLength(1);
    const p = screens[0].props as Record<string, unknown>;
    expect(p.humanTeam).toBe("EW");
  });

  it("25. GameOverScreen receives humanTeam='NS' when humanTeam is NS", () => {
    const gameState = makeGameState({ winner: "NS", phase: "finished" });
    const tree = OnlineGamePageView(
      makeProps({ overlay: "game-over", gameState, humanTeam: "NS" }),
    );
    const all = flattenElements(tree);
    const screens = findByType(all, GameOverScreen);
    expect(screens).toHaveLength(1);
    const p = screens[0].props as Record<string, unknown>;
    expect(p.humanTeam).toBe("NS");
  });

});

describe("DisconnectAlert rendering in OnlineGamePageView", () => {

  it("26. renders DisconnectAlert when disconnectedAlert is non-null", () => {
    const tree = OnlineGamePageView(makeProps({
      disconnectedAlert: { seat: "E", displayName: "Bob" },
    }));
    const all = flattenElements(tree);
    expect(findByType(all, DisconnectAlert)).toHaveLength(1);
  });

  it("27. does NOT render DisconnectAlert when disconnectedAlert is null", () => {
    const tree = OnlineGamePageView(makeProps({ disconnectedAlert: null }));
    const all = flattenElements(tree);
    expect(findByType(all, DisconnectAlert)).toHaveLength(0);
  });

  it("28. passes isHost=true to DisconnectAlert when isHost prop is true", () => {
    const tree = OnlineGamePageView(makeProps({
      disconnectedAlert: { seat: "S", displayName: "Carol" },
      isHost: true,
    }));
    const all = flattenElements(tree);
    const alerts = findByType(all, DisconnectAlert);
    expect(alerts).toHaveLength(1);
    const p = alerts[0].props as Record<string, unknown>;
    expect(p.isHost).toBe(true);
  });

  it("29. passes correct seat and displayName to DisconnectAlert", () => {
    const tree = OnlineGamePageView(makeProps({
      disconnectedAlert: { seat: "W", displayName: "Dave" },
    }));
    const all = flattenElements(tree);
    const alerts = findByType(all, DisconnectAlert);
    expect(alerts).toHaveLength(1);
    const p = alerts[0].props as Record<string, unknown>;
    expect(p.seat).toBe("W");
    expect(p.displayName).toBe("Dave");
  });

  it("30. passes onReplaceWithBot and onDismissDisconnectAlert to DisconnectAlert", () => {
    const onReplaceWithBot = vi.fn();
    const onDismissDisconnectAlert = vi.fn();
    const tree = OnlineGamePageView(makeProps({
      disconnectedAlert: { seat: "E", displayName: "Bob" },
      isHost: true,
      onReplaceWithBot,
      onDismissDisconnectAlert,
    }));
    const all = flattenElements(tree);
    const alerts = findByType(all, DisconnectAlert);
    expect(alerts).toHaveLength(1);
    const p = alerts[0].props as Record<string, unknown>;
    expect(p.onReplaceWithBot).toBe(onReplaceWithBot);
    expect(p.onDismiss).toBe(onDismissDisconnectAlert);
  });

  it("31. passes isHost=false to DisconnectAlert when isHost prop is false", () => {
    const tree = OnlineGamePageView(makeProps({
      disconnectedAlert: { seat: "N", displayName: "Alice" },
      isHost: false,
    }));
    const all = flattenElements(tree);
    const alerts = findByType(all, DisconnectAlert);
    expect(alerts).toHaveLength(1);
    const p = alerts[0].props as Record<string, unknown>;
    expect(p.isHost).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// OnlineGamePage container — navigation target tests (32–33)
// ---------------------------------------------------------------------------
// These tests verify that both "Play Again" and "Leave Game" navigate to
// "/online" (the home screen), not "/online/:code" (the room lobby).
// We test via the exported `buildPlayAgainHandler` and `buildLeaveGameHandler`
// pure factory functions that encapsulate navigation logic.

describe("OnlineGamePage — navigation handlers", () => {

  it("32. handlePlayAgain navigates to '/online' (not '/online/:code')", () => {
    const disconnect = vi.fn();
    const navigate = vi.fn();
    const code = "ABC123";

    const handlePlayAgain = buildPlayAgainHandler({ disconnect, navigate });
    handlePlayAgain();

    expect(navigate).toHaveBeenCalledWith("/online");
    expect(navigate).not.toHaveBeenCalledWith(`/online/${code}`);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("33. Leave Game button navigates to '/online' (not '/online/:code')", () => {
    const disconnect = vi.fn();
    const navigate = vi.fn();
    const code = "ABC123";

    const handleLeaveGame = buildLeaveGameHandler({ disconnect, navigate });
    handleLeaveGame();

    expect(navigate).toHaveBeenCalledWith("/online");
    expect(navigate).not.toHaveBeenCalledWith(`/online/${code}`);
    expect(disconnect).toHaveBeenCalledOnce();
  });

});

// ---------------------------------------------------------------------------
// Fix 3: shouldShowReconnecting guard includes lobbyPhase === "connecting"
// ---------------------------------------------------------------------------

describe("shouldShowReconnecting — blank-screen guard", () => {

  it("34. returns true when isReconnecting=true (existing behaviour)", () => {
    expect(shouldShowReconnecting({
      isReconnecting: true,
      hasMidGameFlag: false,
      lobbyPhase: "idle",
    })).toBe(true);
  });

  it("35. returns true when hasMidGameFlag=true (existing behaviour)", () => {
    expect(shouldShowReconnecting({
      isReconnecting: false,
      hasMidGameFlag: true,
      lobbyPhase: "idle",
    })).toBe(true);
  });

  it("36. returns true when lobbyPhase='connecting' even if isReconnecting=false and hasMidGameFlag=false (Fix 3)", () => {
    // This is the new behaviour added by Fix 3.
    // Before the fix, a fresh reconnect with lobbyPhase="connecting" but no
    // sessionStorage flag would fall through to `return null`, causing the blank screen.
    expect(shouldShowReconnecting({
      isReconnecting: false,
      hasMidGameFlag: false,
      lobbyPhase: "connecting",
    })).toBe(true);
  });

  it("37. returns false when all conditions are false (no reconnect needed)", () => {
    expect(shouldShowReconnecting({
      isReconnecting: false,
      hasMidGameFlag: false,
      lobbyPhase: "idle",
    })).toBe(false);
  });

  it("38. returns false when lobbyPhase='lobby' (not connecting)", () => {
    expect(shouldShowReconnecting({
      isReconnecting: false,
      hasMidGameFlag: false,
      lobbyPhase: "lobby",
    })).toBe(false);
  });

  it("39. returns false when lobbyPhase='playing' and no other flags", () => {
    expect(shouldShowReconnecting({
      isReconnecting: false,
      hasMidGameFlag: false,
      lobbyPhase: "playing",
    })).toBe(false);
  });

});

// Suppress unused import warnings
void GameTable;
void DisconnectAlert;
