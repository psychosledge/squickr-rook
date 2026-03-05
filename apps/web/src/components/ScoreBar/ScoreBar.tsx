import type { GameState, Seat } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import styles from "./ScoreBar.module.css";

type Props = { gameState: GameState; onOpenHistory?: () => void; seatNames?: Partial<Record<Seat, string>>; humanSeat?: Seat };

const TRUMP_COLORS: Record<string, string> = {
  Black:  "#aaaaaa",
  Red:    "#e74c3c",
  Green:  "#2ecc71",
  Yellow: "#f1c40f",
};

export default function ScoreBar({ gameState, onOpenHistory, seatNames, humanSeat }: Props) {
  const { scores, handNumber, trump, phase, activePlayer, bidder, bidAmount, shotMoon, handHistory } = gameState;

  function resolveName(seat: Seat): string {
    if (seatNames?.[seat]) return seatNames[seat]!;
    if (seat === (humanSeat ?? "N")) return "You";
    return getSeatLabel(seat);
  }

  const activeName = activePlayer ? resolveName(activePlayer) : "";

  const showBidBadge =
    bidder !== null &&
    bidAmount > 0 &&
    (phase === "playing" || phase === "nest" || phase === "trump" || phase === "scoring");

  const bidBadgeText = showBidBadge
    ? `${resolveName(bidder!)} bid ${bidAmount}${shotMoon ? " 🌙" : ""}`
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
