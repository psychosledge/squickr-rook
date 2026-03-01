import PlayingCard from "@/components/PlayingCard/PlayingCard";
import type { CardId } from "@rook/engine";
import styles from "./NestOverlay.module.css";

type Props = {
  hand: CardId[];
  pendingDiscards: CardId[];
  onToggleDiscard: (cardId: CardId) => void;
  onConfirm: () => void;
};

export default function NestOverlay({ hand, pendingDiscards, onToggleDiscard, onConfirm }: Props) {
  const canConfirm = pendingDiscards.length === 5;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Discard 5 Cards</h2>
        <p className={styles.subtitle}>{pendingDiscards.length}/5 selected</p>

        <div className={styles.hand}>
          {hand.map((cardId) => (
            <PlayingCard
              key={cardId}
              cardId={cardId}
              isSelected={pendingDiscards.includes(cardId)}
              isPlayable={pendingDiscards.length < 5 || pendingDiscards.includes(cardId)}
              onClick={() => onToggleDiscard(cardId)}
            />
          ))}
        </div>

        <button
          className={`${styles.confirmBtn} ${canConfirm ? styles.ready : ""}`}
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          Confirm Discards
        </button>
      </div>
    </div>
  );
}
