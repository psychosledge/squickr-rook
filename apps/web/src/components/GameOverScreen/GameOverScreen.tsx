import { useState } from "react";
import type { HandScore, Team } from "@rook/engine";
import { getTeamLabel } from "@/utils/seatLabel";
import { buildHandHistoryRows } from "@/utils/handHistory";
import HandHistoryTable from "@/components/HandHistoryTable/HandHistoryTable";
import styles from "./GameOverScreen.module.css";

type Props = {
  winner: Team;
  finalScores: Record<Team, number>;
  reason: "threshold-reached" | "bust" | "moon-made" | "moon-set";
  onPlayAgain: () => void;
  handHistory?: HandScore[];
};

// ── Pure render helper (state is passed in explicitly) ────────────────────────
// Exported so tests can call it directly without hitting React hooks.
export type GameOverScreenViewProps = Props & {
  showHandLog: boolean;
  onToggleHandLog: () => void;
};

export function GameOverScreenView({
  winner,
  finalScores,
  reason,
  onPlayAgain,
  handHistory,
  showHandLog,
  onToggleHandLog,
}: GameOverScreenViewProps) {
  const humanWon = winner === "NS";
  const hasHistory = handHistory != null && handHistory.length > 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.emoji}>{humanWon ? "🎉" : "💀"}</div>
        <h1 className={`${styles.result} ${humanWon ? styles.win : styles.lose}`}>
          {humanWon ? "You Win!" : "You Lose"}
        </h1>
        <p className={styles.reason}>
          {reason === "bust"
            ? `${getTeamLabel(winner === "NS" ? "EW" : "NS")} team went bust`
            : reason === "moon-made"
            ? `${getTeamLabel(winner)} shot the Moon! 🌙`
            : reason === "moon-set"
            ? `${getTeamLabel(winner === "NS" ? "EW" : "NS")} failed to shoot the Moon`
            : `${getTeamLabel(winner)} reached 500 points`}
        </p>

        <div className={styles.scores}>
          <div className={`${styles.scoreBox} ${winner === "NS" ? styles.winner : ""}`}>
            <span className={styles.teamLabel}>{getTeamLabel("NS")}</span>
            <span className={styles.scoreVal}>{finalScores.NS}</span>
          </div>
          <div className={`${styles.scoreBox} ${winner === "EW" ? styles.winner : ""}`}>
            <span className={styles.teamLabel}>{getTeamLabel("EW")}</span>
            <span className={styles.scoreVal}>{finalScores.EW}</span>
          </div>
        </div>

        {hasHistory && (
          <button className={styles.handLogBtn} onClick={onToggleHandLog}>
            📋 Hand Log
          </button>
        )}

        {hasHistory && showHandLog && handHistory && (
          <div className={styles.handLogSection}>
            <HandHistoryTable rows={buildHandHistoryRows(handHistory)} />
          </div>
        )}

        <button className={styles.btn} onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ── Default export: stateful shell ────────────────────────────────────────────
export default function GameOverScreen(props: Props) {
  const [showHandLog, setShowHandLog] = useState(false);
  return (
    <GameOverScreenView
      {...props}
      showHandLog={showHandLog}
      onToggleHandLog={() => setShowHandLog((s) => !s)}
    />
  );
}
