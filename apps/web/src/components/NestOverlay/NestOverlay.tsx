import PlayingCard from "@/components/PlayingCard/PlayingCard";
import type { CardId } from "@rook/engine";
import styles from "./NestOverlay.module.css";

type Props = {
  hand: CardId[];
  nestCardIds: CardId[];
  pendingDiscards: CardId[];
  onToggleDiscard: (cardId: CardId) => void;
  onConfirm: () => void;
  bidAmount: number;
  shotMoon: boolean;
};

export default function NestOverlay({ hand, nestCardIds, pendingDiscards, onToggleDiscard, onConfirm, bidAmount, shotMoon }: Props) {
  const canConfirm = pendingDiscards.length === 5;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Discard 5 Cards</h2>
        <p className={styles.infoRow}>Your bid: {bidAmount}{shotMoon ? " 🌙" : ""}</p>
        <p className={styles.subtitle}>{pendingDiscards.length}/5 selected</p>

        <div className={styles.hand}>
          {hand.map((cardId) => (
            <PlayingCard
              key={cardId}
              cardId={cardId}
              isFromNest={nestCardIds.includes(cardId)}
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
