import CardHand from "@/components/CardHand/CardHand";
import { useLegalCards } from "@/hooks/useLegalCards";
import { getSeatLabel } from "@/utils/seatLabel";
import type { Seat, CardId, GamePhase, GameState } from "@rook/engine";
import styles from "./PlayerSeat.module.css";

type Props = {
  seat: Seat;
  cards: CardId[];
  faceDown: boolean;
  isActive: boolean;
  isBidder?: boolean;
  isDealer?: boolean;
  phase: GamePhase;
  gameState: GameState | null;
  onCardClick?: (cardId: CardId) => void;
  displayName?: string;
  position?: "bottom" | "top" | "left" | "right";
  difficultyLabel?: string;
  bidDisplay?: string;
};

const BIDDER_PHASES: GamePhase[] = ["nest", "trump", "playing", "scoring"];

export default function PlayerSeat({ seat, cards, faceDown, isActive, isBidder, isDealer, phase, gameState, onCardClick, displayName, position, difficultyLabel, bidDisplay }: Props) {
  const legalCards = useLegalCards(gameState, seat);
  const label = displayName ?? getSeatLabel(seat);
  const showBidBadge = isBidder === true && BIDDER_PHASES.includes(phase);
  const showDiffBadge = position !== "bottom" && difficultyLabel !== undefined;

  const cardOrientation: 'horizontal' | 'vertical' =
    (position === 'left' || position === 'right') ? 'vertical' : 'horizontal';

  const cardSize: 'normal' | 'sm' = (position === 'top' || position === 'left' || position === 'right') ? 'sm' : 'normal';

  return (
    <div className={`${styles.seat} ${isActive ? styles.active : ""}`} data-seat={seat} data-face-down={faceDown ? "true" : undefined} data-position={position}>
      <div className={styles.nameRow}>
        <span className={styles.name}>{label}</span>
        {isDealer && <span className={styles.dealerBadge} aria-label="Dealer">D</span>}
        {showBidBadge && <span className={styles.bidBadge} aria-label="Bidder">★ BID</span>}
        {showDiffBadge && <span className={styles.diffBadge}>{difficultyLabel}</span>}
        {bidDisplay !== undefined && (
          <span
            className={styles.bidDisplay}
            data-passed={bidDisplay === "PASS" ? "true" : undefined}
            data-thinking={bidDisplay === "…" ? "true" : undefined}
          >
            {bidDisplay}
          </span>
        )}
        {isActive && <span className={styles.indicator}>●</span>}
      </div>
      <div className={styles.handWrap}>
        <CardHand
          cards={cards}
          faceDown={faceDown}
          orientation={cardOrientation}
          size={cardSize}
          legalCardIds={faceDown ? undefined : (phase === "playing" && onCardClick ? legalCards : undefined)}
          onCardClick={!faceDown ? onCardClick : undefined}
        />
      </div>
    </div>
  );
}
