import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/gameStore";
import ScoreBar from "@/components/ScoreBar/ScoreBar";
import GameTable from "@/components/GameTable/GameTable";
import NestOverlay from "@/components/NestOverlay/NestOverlay";
import TrumpPicker from "@/components/TrumpPicker/TrumpPicker";
import BiddingOverlay from "@/components/BiddingOverlay/BiddingOverlay";
import HandResultOverlay from "@/components/HandResultOverlay/HandResultOverlay";
import GameOverScreen from "@/components/GameOverScreen/GameOverScreen";
import AnnouncementBanner from "@/components/AnnouncementBanner/AnnouncementBanner";
import HandHistoryModal from "@/components/HandHistoryModal/HandHistoryModal";
import { sortHand } from "@/utils/sortHand";
import { buildHandHistoryRows } from "@/utils/handHistory";
import styles from "./GamePage.module.css";

export default function GamePage() {
  const navigate = useNavigate();
  const gameState = useGameStore((s) => s.gameState);
  const overlay = useGameStore((s) => s.overlay);
  const pendingDiscards = useGameStore((s) => s.pendingDiscards);
  const pendingHandScore = useGameStore((s) => s.pendingHandScore);
  const humanPlayCard = useGameStore((s) => s.humanPlayCard);
  const toggleDiscard = useGameStore((s) => s.toggleDiscard);
  const confirmDiscards = useGameStore((s) => s.confirmDiscards);
  const humanSelectTrump = useGameStore((s) => s.humanSelectTrump);
  const acknowledgeHandResult = useGameStore((s) => s.acknowledgeHandResult);
  const resetGame = useGameStore((s) => s.resetGame);
  const humanPlaceBid = useGameStore((s) => s.humanPlaceBid);
  const humanPassBid = useGameStore((s) => s.humanPassBid);
  const humanShootMoon = useGameStore((s) => s.humanShootMoon);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const historyModalOpen = useGameStore((s) => s.historyModalOpen);
  const openHistoryModal = useGameStore((s) => s.openHistoryModal);
  const closeHistoryModal = useGameStore((s) => s.closeHistoryModal);
  const biddingThinkingSeat = useGameStore((s) => s.biddingThinkingSeat);
  const announcement = useGameStore((s) => s.announcement);
  const clearAnnouncement = useGameStore((s) => s.clearAnnouncement);

  // Redirect to lobby if no game active
  useEffect(() => {
    if (!gameState) void navigate("/");
  }, [gameState, navigate]);

  if (!gameState) return null;

  function handlePlayAgain() {
    resetGame();
    void navigate("/");
  }

  return (
    <div className={styles.page}>
      <ScoreBar gameState={gameState} onOpenHistory={openHistoryModal} />

      <AnnouncementBanner announcement={announcement} clearAnnouncement={clearAnnouncement} />

      {historyModalOpen && (
        <HandHistoryModal
          rows={buildHandHistoryRows(gameState.handHistory)}
          onClose={closeHistoryModal}
        />
      )}

      {overlay === "bidding" && (
        <BiddingOverlay
          gameState={gameState}
          onPlaceBid={humanPlaceBid}
          onPass={humanPassBid}
          onShootMoon={humanShootMoon}
          biddingThinkingSeat={biddingThinkingSeat}
        />
      )}

      {overlay === "trump" && (
        <TrumpPicker onSelect={humanSelectTrump} />
      )}

      <GameTable gameState={gameState} onPlayCard={humanPlayCard} />

      {overlay === "nest" && (
        <NestOverlay
          hand={sortHand(gameState.hands["N"] ?? [], gameState.trump).filter((c) => c !== "ROOK")}
          nestCardIds={gameState.originalNest}
          pendingDiscards={pendingDiscards}
          onToggleDiscard={toggleDiscard}
          onConfirm={confirmDiscards}
          bidAmount={gameState.bidAmount}
          shotMoon={gameState.shotMoon}
        />
      )}

      {overlay === "hand-result" && pendingHandScore && (
        <HandResultOverlay
          score={pendingHandScore}
          runningScores={gameState.scores}
          onContinue={acknowledgeHandResult}
          handHistory={gameState.handHistory}
        />
      )}

      {overlay === "game-over" && gameState.winner && (
        <GameOverScreen
          winner={gameState.winner}
          finalScores={gameState.scores}
          reason={gameOverReason ?? "threshold-reached"}
          onPlayAgain={handlePlayAgain}
          handHistory={gameState.handHistory}
        />
      )}
    </div>
  );
}
