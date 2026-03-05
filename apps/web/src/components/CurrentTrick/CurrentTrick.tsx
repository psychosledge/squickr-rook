import PlayingCard from "@/components/PlayingCard/PlayingCard";
import { getSeatLabel } from "@/utils/seatLabel";
import { deriveSlots } from "@/utils/seatPositions";
import type { PlayedCard, Color, Seat } from "@rook/engine";
import styles from "./CurrentTrick.module.css";

type Props = {
  trick: PlayedCard[];
  trump: Color | null;
  humanSeat?: Seat;
};

const ALL_SEATS: Seat[] = ["S", "E", "W", "N"];

export default function CurrentTrick({ trick, trump: _trump, humanSeat }: Props) {
  const { bottom, top, left, right } = deriveSlots(humanSeat ?? "N");
  const seatArea: Record<Seat, string> = {
    [bottom]: "bottom",
    [top]: "top",
    [left]: "left",
    [right]: "right",
  } as Record<Seat, string>;

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
            style={{ gridArea: seatArea[seat] }}
          >
            {cardId ? (
              <>
                <PlayingCard
                  cardId={cardId}
                  isDisplay={true}
                  style={{ width: "var(--trick-card-w)", height: "var(--trick-card-h)" }}
                />
                <span className={styles.seatLabel}>{getSeatLabel(seat)}</span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
