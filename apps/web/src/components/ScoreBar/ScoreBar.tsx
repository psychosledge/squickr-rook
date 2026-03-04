import type { GameState } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import styles from "./ScoreBar.module.css";

type Props = { gameState: GameState; onOpenHistory?: () => void };

const TRUMP_COLORS: Record<string, string> = {
  Black:  "#aaaaaa",
  Red:    "#e74c3c",
  Green:  "#2ecc71",
  Yellow: "#f1c40f",
};

export default function ScoreBar({ gameState, onOpenHistory }: Props) {
  const { scores, handNumber, trump, phase, activePlayer, bidder, bidAmount, shotMoon, handHistory } = gameState;
  const activeName = activePlayer ? getSeatLabel(activePlayer) : "";

  const showBidBadge =
    bidder !== null &&
    bidAmount > 0 &&
    (phase === "playing" || phase === "nest" || phase === "trump" || phase === "scoring");

  const bidBadgeText = showBidBadge
    ? `${getSeatLabel(bidder!)} bid ${bidAmount}${shotMoon ? " 🌙" : ""}`
    : null;

  return (
    <div className={styles.bar}>
      <div className={styles.scores}>
        <span className={styles.team}>NS <strong>{scores.NS}</strong></span>
        <span className={styles.divider}>|</span>
        <span className={styles.team}>EW <strong>{scores.EW}</strong></span>
        {onOpenHistory && handHistory.length > 0 && (
          <button
            type="button"
            className={styles.historyBtn}
            aria-label="View hand history"
            onClick={onOpenHistory}
          >
            📋
          </button>
        )}
      </div>

      <div className={styles.center}>
        {trump && (
          <span className={styles.trump} style={{ color: TRUMP_COLORS[trump] }}>
            ■ {trump}
          </span>
        )}
        {showBidBadge && (
          <span className={styles.bidBadge}>{bidBadgeText}</span>
        )}
        <span className={styles.hand}>H{handNumber + 1}</span>
      </div>

      <div className={styles.status}>
        {phase === "bidding" && activePlayer && (
          <span className={styles.active}>
            {activeName} bidding…
          </span>
        )}
        {phase === "playing" && activePlayer && (
          <span className={styles.active}>{activeName}&apos;s turn</span>
        )}
        {phase === "nest" && (
          <span className={styles.active}>
            {activeName} picking nest…
          </span>
        )}
        {phase === "trump" && (
          <span className={styles.active}>
            {activeName} picking trump…
          </span>
        )}
      </div>
    </div>
  );
}
