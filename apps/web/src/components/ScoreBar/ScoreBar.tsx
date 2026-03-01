import type { GameState } from "@rook/engine";
import { leftOf } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import styles from "./ScoreBar.module.css";

type Props = { gameState: GameState };

const TRUMP_COLORS: Record<string, string> = {
  Black:  "#aaaaaa",
  Red:    "#e74c3c",
  Green:  "#2ecc71",
  Yellow: "#f1c40f",
};

export default function ScoreBar({ gameState }: Props) {
  const { scores, handNumber, trump, phase, activePlayer, dealer } = gameState;
  const activeName = activePlayer ? getSeatLabel(activePlayer) : "";

  return (
    <div className={styles.bar}>
      <div className={styles.scores}>
        <span className={styles.team}>NS <strong>{scores.NS}</strong></span>
        <span className={styles.divider}>|</span>
        <span className={styles.team}>EW <strong>{scores.EW}</strong></span>
      </div>

      <div className={styles.center}>
        {trump && (
          <span className={styles.trump} style={{ color: TRUMP_COLORS[trump] }}>
            ■ {trump}
          </span>
        )}
        <span className={styles.hand}>H{handNumber + 1}</span>
      </div>

      <div className={styles.status}>
        {phase === "playing" && activePlayer && (
          <span className={styles.active}>{activeName}&apos;s turn</span>
        )}
        {(phase === "nest" || phase === "trump") && (
          <span className={styles.active}>
            {getSeatLabel(leftOf(dealer))} sorting…
          </span>
        )}
      </div>
    </div>
  );
}
