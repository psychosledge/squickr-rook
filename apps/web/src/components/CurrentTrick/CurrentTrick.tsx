import PlayingCard from "@/components/PlayingCard/PlayingCard";
import { getSeatLabel } from "@/utils/seatLabel";
import type { PlayedCard, Color, Seat } from "@rook/engine";
import styles from "./CurrentTrick.module.css";

type Props = {
  trick: PlayedCard[];
  trump: Color | null;
};

// Positions are from the local player (N=bottom) perspective.
// Clockwise: N(bottom) → E(screen-left) → S(top) → W(screen-right)
const SEAT_AREA: Record<Seat, string> = {
  S: "top",
  E: "left",
  W: "right",
  N: "bottom",
};

const ALL_SEATS: Seat[] = ["S", "E", "W", "N"];

export default function CurrentTrick({ trick, trump }: Props) {
  // Build a lookup: seat → cardId (only for played cards)
  const playedBySeat: Partial<Record<Seat, string>> = {};
  for (const { seat, cardId } of trick) {
    playedBySeat[seat] = cardId;
  }

  return (
    <div className={styles.trick} role="region" aria-label="Current trick">
      {/* Always render all 4 seat slots to hold grid structure */}
      {ALL_SEATS.map((seat) => {
        const cardId = playedBySeat[seat];
        return (
          <div
            key={seat}
            data-seat={seat}
            className={cardId ? styles.play : styles.placeholder}
            style={{ gridArea: SEAT_AREA[seat] }}
          >
            {cardId ? (
              <>
                <PlayingCard
                  cardId={cardId}
                  isPlayable={false}
                  style={{ width: "var(--trick-card-w)", height: "var(--trick-card-h)" }}
                />
                <span className={styles.seatLabel}>{getSeatLabel(seat)}</span>
              </>
            ) : null}
          </div>
        );
      })}

      {/* Center info cell */}
      <div
        data-testid="trick-info"
        className={styles.info}
        style={{ gridArea: "info" }}
      >
        {trump ? (
          <span className={styles.trump}>Trump: {trump}</span>
        ) : (
          <span className={styles.empty}>Waiting...</span>
        )}
      </div>
    </div>
  );
}
