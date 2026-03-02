import PlayingCard from "@/components/PlayingCard/PlayingCard";
import type { CardId } from "@rook/engine";
import styles from "./CardHand.module.css";

type Props = {
  cards: CardId[];
  faceDown: boolean;
  legalCardIds?: CardId[];
  onCardClick?: (cardId: CardId) => void;
};

export default function CardHand({ cards, faceDown, legalCardIds, onCardClick }: Props) {
  return (
    <div className={styles.hand}>
      {cards.map((cardId, index) => (
        <PlayingCard
          key={cardId}
          cardId={cardId}
          faceDown={faceDown}
          isPlayable={faceDown ? false : (legalCardIds ? legalCardIds.includes(cardId) : true)}
          onClick={onCardClick ? () => onCardClick(cardId) : undefined}
          style={{ zIndex: index, ...(index === 0 ? { marginLeft: 0 } : {}) }}
        />
      ))}
    </div>
  );
}
