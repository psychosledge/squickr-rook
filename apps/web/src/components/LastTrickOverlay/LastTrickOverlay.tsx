import CurrentTrick from "@/components/CurrentTrick/CurrentTrick";
import { getSeatLabel } from "@/utils/seatLabel";
import type { CompletedTrick, Color, Seat } from "@rook/engine";
import styles from "./LastTrickOverlay.module.css";

type Props = {
  lastTrick: CompletedTrick;
  trump: Color | null;
  humanSeat?: Seat;
  seatNames?: Partial<Record<Seat, string>>;
  onClose: () => void;
};

export default function LastTrickOverlay({ lastTrick, trump, humanSeat, seatNames, onClose }: Props) {
  const winnerName = seatNames?.[lastTrick.winner] ?? getSeatLabel(lastTrick.winner);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Last Trick</h2>
        <div className={styles.winner}>✓ {winnerName} won</div>
        <CurrentTrick trick={lastTrick.plays} trump={trump} humanSeat={humanSeat} />
        <button className={styles.btn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
