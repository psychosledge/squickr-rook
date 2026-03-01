import type { Team } from "@rook/engine";
import { getTeamLabel } from "@/utils/seatLabel";
import styles from "./GameOverScreen.module.css";

type Props = {
  winner: Team;
  finalScores: Record<Team, number>;
  reason: "threshold-reached" | "bust";
  onPlayAgain: () => void;
};

export default function GameOverScreen({ winner, finalScores, reason, onPlayAgain }: Props) {
  const humanWon = winner === "NS";

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

        <button className={styles.btn} onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
