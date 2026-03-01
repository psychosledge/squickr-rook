import PlayingCard from "@/components/PlayingCard/PlayingCard";
import { getSeatLabel } from "@/utils/seatLabel";
import type { PlayedCard, Color } from "@rook/engine";
import styles from "./CurrentTrick.module.css";

type Props = {
  trick: PlayedCard[];
  trump: Color | null;
};

export default function CurrentTrick({ trick, trump }: Props) {
  return (
    <div className={styles.trick}>
      {trick.length === 0 && (
        <div className={styles.empty}>
          {trump ? `Trump: ${trump}` : "No trick yet"}
        </div>
      )}
      {trick.map(({ seat, cardId }) => (
        <div key={seat} className={styles.play}>
          <PlayingCard cardId={cardId} isPlayable={false} />
          <span className={styles.seatLabel}>{getSeatLabel(seat)}</span>
        </div>
      ))}
    </div>
  );
}
