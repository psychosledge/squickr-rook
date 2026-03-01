import CardHand from "@/components/CardHand/CardHand";
import { useLegalCards } from "@/hooks/useLegalCards";
import { getSeatLabel } from "@/utils/seatLabel";
import type { Seat, CardId } from "@rook/engine";
import styles from "./PlayerSeat.module.css";

type Props = {
  seat: Seat;
  cards: CardId[];
  faceDown: boolean;
  isActive: boolean;
  onCardClick?: (cardId: CardId) => void;
};

export default function PlayerSeat({ seat, cards, faceDown, isActive, onCardClick }: Props) {
  const legalCards = useLegalCards(seat);
  const label = getSeatLabel(seat);

  return (
    <div className={`${styles.seat} ${isActive ? styles.active : ""}`} data-seat={seat}>
      <div className={styles.nameRow}>
        <span className={styles.name}>{label}</span>
        {faceDown && <span className={styles.count}>{cards.length}</span>}
        {isActive && <span className={styles.indicator}>●</span>}
      </div>
      <CardHand
        cards={cards}
        faceDown={faceDown}
        legalCardIds={!faceDown ? legalCards : undefined}
        onCardClick={!faceDown ? onCardClick : undefined}
      />
    </div>
  );
}
