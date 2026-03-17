import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useOnlineGameStore, MID_GAME_ROOM_KEY } from "@/store/onlineGameStore";
import type { SeatInfo } from "@/store/onlineGameStore.types";
import type { OverlayKind } from "@/store/gameStore.types";
import type { GameState, HandScore, Seat, CardId, Color, Team } from "@rook/engine";
import ScoreBar from "@/components/ScoreBar/ScoreBar";
import GameTable from "@/components/GameTable/GameTable";
import NestOverlay from "@/components/NestOverlay/NestOverlay";
import TrumpPicker from "@/components/TrumpPicker/TrumpPicker";
import BiddingOverlay from "@/components/BiddingOverlay/BiddingOverlay";
import HandResultOverlay from "@/components/HandResultOverlay/HandResultOverlay";
import GameOverScreen from "@/components/GameOverScreen/GameOverScreen";
import AnnouncementBanner from "@/components/AnnouncementBanner/AnnouncementBanner";
import HandHistoryModal from "@/components/HandHistoryModal/HandHistoryModal";
import { DisconnectAlert } from "@/components/DisconnectAlert/DisconnectAlert";
import { sortHand } from "@/utils/sortHand";
import { buildHandHistoryRows } from "@/utils/handHistory";
import styles from "./OnlineGamePage.module.css";

// ── View Props ───────────────────────────────────────────────────────────────

export type OnlineGamePageViewProps = {
  gameState: GameState;
  overlay: OverlayKind;
  pendingDiscards: CardId[];
  pendingHandScore: HandScore | null;
  mySeat: Seat | null;
  announcement: string | null;
  gameOverReason: "threshold-reached" | "bust" | "moon-set" | "moon-made" | null;
  historyModalOpen: boolean;
  biddingThinkingSeat: Seat | null;
  seatNames?: Partial<Record<Seat, string>>;
  humanTeam: Team;
  disconnectedAlert: { seat: Seat; displayName: string } | null;
  isHost: boolean;
  onReplaceWithBot: (seat: Seat) => void;
  onDismissDisconnectAlert: () => void;
  onPlayCard: (cardId: CardId) => void;
  onToggleDiscard: (cardId: CardId) => void;
  onConfirmDiscards: () => void;
  onSelectTrump: (color: Color) => void;
  onAcknowledgeHandResult: () => void;
  onPlaceBid: (amount: number) => void;
  onPassBid: () => void;
  onShootMoon: () => void;
  clearAnnouncement: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  onPlayAgain: () => void;
};

// ── Pure View (exported for testing) ────────────────────────────────────────

export function OnlineGamePageView({
  gameState,
  overlay,
  pendingDiscards,
  pendingHandScore,
  mySeat,
  announcement,
  gameOverReason,
  historyModalOpen,
  biddingThinkingSeat,
  seatNames,
  humanTeam,
  disconnectedAlert,
  isHost,
  onReplaceWithBot,
  onDismissDisconnectAlert,
  onPlayCard,
  onToggleDiscard,
  onConfirmDiscards,
  onSelectTrump,
  onAcknowledgeHandResult,
  onPlaceBid,
  onPassBid,
  onShootMoon,
  clearAnnouncement,
  openHistoryModal,
  closeHistoryModal,
  onPlayAgain,
}: OnlineGamePageViewProps) {
  const humanSeat: Seat = mySeat ?? "N";
  const trump = gameState.trump;

  return (
    <div className={styles.page}>
      <ScoreBar gameState={gameState} onOpenHistory={openHistoryModal} seatNames={seatNames} humanSeat={humanSeat} />

      <AnnouncementBanner announcement={announcement} clearAnnouncement={clearAnnouncement} />

      {disconnectedAlert !== null && (
        <DisconnectAlert
          displayName={disconnectedAlert.displayName}
          seat={disconnectedAlert.seat}
          isHost={isHost}
          onReplaceWithBot={onReplaceWithBot}
          onDismiss={onDismissDisconnectAlert}
        />
      )}

      {historyModalOpen && (
        <HandHistoryModal
          rows={buildHandHistoryRows(gameState.handHistory, undefined, seatNames)}
          onClose={closeHistoryModal}
        />
      )}

      {overlay === "bidding" && (
        <BiddingOverlay
          gameState={gameState}
          onPlaceBid={onPlaceBid}
          onPass={onPassBid}
          onShootMoon={onShootMoon}
          humanSeat={humanSeat}
        />
      )}

      {overlay === "trump" && (
        <TrumpPicker onSelect={onSelectTrump} />
      )}

      <GameTable gameState={gameState} onPlayCard={onPlayCard} seatNames={seatNames} humanSeat={humanSeat} biddingThinkingSeat={biddingThinkingSeat} />

      {overlay === "nest" && mySeat !== null && (
        <NestOverlay
          hand={sortHand(gameState.hands[mySeat] ?? [], trump).filter((c) => c !== "ROOK")}
          nestCardIds={gameState.originalNest}
          pendingDiscards={pendingDiscards}
          onToggleDiscard={onToggleDiscard}
          onConfirm={onConfirmDiscards}
          bidAmount={gameState.bidAmount}
          shotMoon={gameState.shotMoon}
        />
      )}

      {overlay === "hand-result" && pendingHandScore && (
        <HandResultOverlay
          score={pendingHandScore}
          runningScores={gameState.scores}
          onContinue={onAcknowledgeHandResult}
          handHistory={gameState.handHistory}
          seatNames={seatNames}
        />
      )}

      {overlay === "game-over" && gameState.winner && (
        <GameOverScreen
          winner={gameState.winner}
          finalScores={gameState.scores}
          reason={gameOverReason ?? "threshold-reached"}
          onPlayAgain={onPlayAgain}
          handHistory={gameState.handHistory}
          seatNames={seatNames}
          humanTeam={humanTeam}
        />
      )}
    </div>
  );
}

// ── Navigation Handler Factories (exported for testing) ─────────────────────

type NavigateFn = (path: string) => void;

export function buildPlayAgainHandler(opts: {
  disconnect: () => void;
  navigate: NavigateFn;
}): () => void {
  return function handlePlayAgain() {
    opts.disconnect();
    void opts.navigate("/online");
  };
}

export function buildLeaveGameHandler(opts: {
  disconnect: () => void;
  navigate: NavigateFn;
}): () => void {
  return function handleLeaveGame() {
    opts.disconnect();
    void opts.navigate("/online");
  };
}

// ── Reconnect guard helper (exported for testing) ────────────────────────────

/**
 * Pure helper that decides whether to show the "Reconnecting…" screen
 * when gameState is null. Extracted for testability.
 */
export function shouldShowReconnecting(opts: {
  isReconnecting: boolean;
  hasMidGameFlag: boolean;
  lobbyPhase: string;
}): boolean {
  return opts.isReconnecting || opts.hasMidGameFlag || opts.lobbyPhase === "connecting";
}

// ── Default Export: OnlineGamePage ───────────────────────────────────────────

export default function OnlineGamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const gameState = useOnlineGameStore((s) => s.gameState);
  const overlay = useOnlineGameStore((s) => s.overlay);
  const pendingDiscards = useOnlineGameStore((s) => s.pendingDiscards);
  const pendingHandScore = useOnlineGameStore((s) => s.pendingHandScore);
  const mySeat = useOnlineGameStore((s) => s.mySeat);
  const announcement = useOnlineGameStore((s) => s.announcement);
  const gameOverReason = useOnlineGameStore((s) => s.gameOverReason);
  const historyModalOpen = useOnlineGameStore((s) => s.historyModalOpen);
  const biddingThinkingSeat = useOnlineGameStore((s) => s.biddingThinkingSeat);
  const seats = useOnlineGameStore((s) => s.seats);
  const humanPlayCard = useOnlineGameStore((s) => s.humanPlayCard);
  const toggleDiscard = useOnlineGameStore((s) => s.toggleDiscard);
  const confirmDiscards = useOnlineGameStore((s) => s.confirmDiscards);
  const humanSelectTrump = useOnlineGameStore((s) => s.humanSelectTrump);
  const acknowledgeHandResult = useOnlineGameStore((s) => s.acknowledgeHandResult);
  const humanPlaceBid = useOnlineGameStore((s) => s.humanPlaceBid);
  const humanPassBid = useOnlineGameStore((s) => s.humanPassBid);
  const humanShootMoon = useOnlineGameStore((s) => s.humanShootMoon);
  const clearAnnouncement = useOnlineGameStore((s) => s.clearAnnouncement);
  const openHistoryModal = useOnlineGameStore((s) => s.openHistoryModal);
  const closeHistoryModal = useOnlineGameStore((s) => s.closeHistoryModal);
  const disconnect = useOnlineGameStore((s) => s.disconnect);
  const connect = useOnlineGameStore((s) => s.connect);
  const disconnectedAlert = useOnlineGameStore((s) => s.disconnectedAlert);
  const replaceWithBot = useOnlineGameStore((s) => s.replaceWithBot);
  const dismissDisconnectAlert = useOnlineGameStore((s) => s.dismissDisconnectAlert);
  const hostId = useOnlineGameStore((s) => s.hostId);
  const myPlayerId = useOnlineGameStore((s) => s.myPlayerId);
  const connectionError = useOnlineGameStore((s) => s.connectionError);
  const _socket = useOnlineGameStore((s) => s._socket);
  const isReconnecting = useOnlineGameStore((s) => s.isReconnecting);
  const lobbyPhase = useOnlineGameStore((s) => s.lobbyPhase);
  const isHost = myPlayerId !== null && myPlayerId !== "" && myPlayerId === hostId;

  // Mount-only effect: reconnect automatically on mid-game refresh (direct navigation)
  useEffect(() => {
    const storedCode = globalThis.sessionStorage?.getItem(MID_GAME_ROOM_KEY);
    // On a cold page refresh, lobbyPhase starts as "idle" (store is wiped).
    // Guard against re-connecting if a connection is already in progress.
    if (storedCode && storedCode === code && lobbyPhase === "idle") {
      connect(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Empty deps: mount-only. Adding lobbyPhase/connect would cause double-connect
    // when Welcome arrives and sets lobbyPhase="connecting".
  }, []);

  // Navigate back if no game state
  useEffect(() => {
    const storedCode = globalThis.sessionStorage?.getItem(MID_GAME_ROOM_KEY);
    // Only redirect if we have no game state AND we're not in a clean idle disconnect
    // (lobbyPhase === "idle" with no storedCode means we intentionally left/disconnected)
    if (!gameState && !isReconnecting && storedCode !== code && lobbyPhase !== "idle") {
      void navigate(code ? `/online/${code}` : "/online");
    }
  }, [gameState, isReconnecting, code, navigate, lobbyPhase]);

  const hasMidGameFlag = globalThis.sessionStorage?.getItem(MID_GAME_ROOM_KEY) === code;

  if (!gameState) {
    if (shouldShowReconnecting({ isReconnecting, hasMidGameFlag, lobbyPhase })) {
      return <div className={styles.reconnecting}><p>Reconnecting…</p></div>;
    }
    return null;
  }

  // Disconnected self-panel
  if (connectionError !== null && !_socket && gameState !== null) {
    return (
      <div className={styles.disconnectedPanel}>
        <p>You were disconnected from the game.</p>
        <button onClick={() => code && connect(code)}>Reconnect</button>
        <button onClick={buildLeaveGameHandler({ disconnect, navigate })}>
          Leave Game
        </button>
      </div>
    );
  }

  const seatNames: Partial<Record<Seat, string>> = Object.fromEntries(
    seats
      .filter((s): s is SeatInfo & { displayName: string } => s.displayName !== null)
      .map((s) => [s.seat, s.displayName]),
  );

  const humanTeam: Team = mySeat !== null && ["E", "W"].includes(mySeat) ? "EW" : "NS";

  return (
    <OnlineGamePageView
      gameState={gameState}
      overlay={overlay}
      pendingDiscards={pendingDiscards}
      pendingHandScore={pendingHandScore}
      mySeat={mySeat}
      announcement={announcement}
      gameOverReason={gameOverReason}
      historyModalOpen={historyModalOpen}
      biddingThinkingSeat={biddingThinkingSeat}
      seatNames={seatNames}
      humanTeam={humanTeam}
      disconnectedAlert={disconnectedAlert}
      isHost={isHost}
      onReplaceWithBot={replaceWithBot}
      onDismissDisconnectAlert={dismissDisconnectAlert}
      onPlayCard={humanPlayCard}
      onToggleDiscard={toggleDiscard}
      onConfirmDiscards={confirmDiscards}
      onSelectTrump={humanSelectTrump}
      onAcknowledgeHandResult={acknowledgeHandResult}
      onPlaceBid={humanPlaceBid}
      onPassBid={humanPassBid}
      onShootMoon={humanShootMoon}
      clearAnnouncement={clearAnnouncement}
      openHistoryModal={openHistoryModal}
      closeHistoryModal={closeHistoryModal}
      onPlayAgain={buildPlayAgainHandler({ disconnect, navigate })}
    />
  );
}
