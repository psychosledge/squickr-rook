import PlayingCard from "@/components/PlayingCard/PlayingCard";
import type { CardId } from "@rook/engine";
import styles from "./CardHand.module.css";

type Props = {
  cards: CardId[];
  faceDown: boolean;
  legalCardIds?: CardId[];
  onCardClick?: (cardId: CardId) => void;
  orientation?: 'horizontal' | 'vertical';
  size?: 'normal' | 'sm';
};

export default function CardHand({ cards, faceDown, legalCardIds, onCardClick, orientation, size }: Props) {
  return (
    <div
      className={`${styles.hand}${orientation === 'vertical' ? ` ${styles.vertical}` : ''}`}
      // Inline style defeats Vite/LightningCSS @media merge ordering at ≥901px breakpoint
      // (see CardHand.module.css for details). Inline styles always win the cascade.
      style={orientation === 'vertical' ? {
        flexDirection: 'column',
        overflow: 'visible',
        position: 'relative',
        gap: 0,
      } : undefined}
    >
      {cards.map((cardId, index) => (
        <PlayingCard
          // key=index intentional: cardId can be "??" for masked hands (not unique)
          key={index}
          cardId={cardId}
          faceDown={faceDown}
          size={size}
          isPlayable={faceDown ? false : (legalCardIds ? legalCardIds.includes(cardId) : true)}
          onClick={onCardClick ? () => onCardClick(cardId) : undefined}
          style={{ zIndex: index, ...(index === 0 ? { marginLeft: 0 } : {}) }}
        />
      ))}
    </div>
  );
}
