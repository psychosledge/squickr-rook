import CardHand from "@/components/CardHand/CardHand";
import { useLegalCards } from "@/hooks/useLegalCards";
import { getSeatLabel } from "@/utils/seatLabel";
import type { Seat, CardId, GamePhase } from "@rook/engine";
import styles from "./PlayerSeat.module.css";

type Props = {
  seat: Seat;
  cards: CardId[];
  faceDown: boolean;
  isActive: boolean;
  isBidder?: boolean;
  isDealer?: boolean;
  phase: GamePhase;
  onCardClick?: (cardId: CardId) => void;
};

const BIDDER_PHASES: GamePhase[] = ["nest", "trump", "playing", "scoring"];

export default function PlayerSeat({ seat, cards, faceDown, isActive, isBidder, isDealer, phase, onCardClick }: Props) {
  const legalCards = useLegalCards(seat);
  const label = getSeatLabel(seat);
  const showBidBadge = isBidder === true && BIDDER_PHASES.includes(phase);

  return (
    <div className={`${styles.seat} ${isActive ? styles.active : ""}`} data-seat={seat}>
      <div className={styles.nameRow}>
        <span className={styles.name}>{label}</span>
        {isDealer && <span className={styles.dealerBadge} aria-label="Dealer">D</span>}
        {showBidBadge && <span className={styles.bidBadge} aria-label="Bidder">★ BID</span>}
        {isActive && <span className={styles.indicator}>●</span>}
      </div>
      <div className={styles.handWrap}>
        <CardHand
          cards={cards}
          faceDown={faceDown}
          legalCardIds={!faceDown && onCardClick ? legalCards : undefined}
          onCardClick={!faceDown ? onCardClick : undefined}
        />
      </div>
    </div>
  );
}
