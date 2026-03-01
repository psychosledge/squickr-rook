import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/gameStore";
import ScoreBar from "@/components/ScoreBar/ScoreBar";
import GameTable from "@/components/GameTable/GameTable";
import NestOverlay from "@/components/NestOverlay/NestOverlay";
import TrumpPicker from "@/components/TrumpPicker/TrumpPicker";
import HandResultOverlay from "@/components/HandResultOverlay/HandResultOverlay";
import GameOverScreen from "@/components/GameOverScreen/GameOverScreen";
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
      <ScoreBar gameState={gameState} />
      <GameTable gameState={gameState} onPlayCard={humanPlayCard} />

      {overlay === "nest" && (
        <NestOverlay
          hand={(gameState.hands["N"] ?? []).filter((c) => c !== "ROOK")}
          pendingDiscards={pendingDiscards}
          onToggleDiscard={toggleDiscard}
          onConfirm={confirmDiscards}
        />
      )}

      {overlay === "trump" && (
        <TrumpPicker onSelect={humanSelectTrump} />
      )}

      {overlay === "hand-result" && pendingHandScore && (
        <HandResultOverlay
          score={pendingHandScore}
          runningScores={gameState.scores}
          onContinue={acknowledgeHandResult}
        />
      )}

      {overlay === "game-over" && gameState.winner && (
        <GameOverScreen
          winner={gameState.winner}
          finalScores={gameState.scores}
          reason={
            gameState.scores.NS <= gameState.rules.bustThreshold ||
            gameState.scores.EW <= gameState.rules.bustThreshold
              ? "bust"
              : "threshold-reached"
          }
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
