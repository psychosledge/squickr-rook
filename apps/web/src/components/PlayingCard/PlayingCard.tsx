import { getCardDisplay } from "@/utils/cardDisplay";
import type { CardId } from "@rook/engine";
import type { CSSProperties } from "react";
import styles from "./PlayingCard.module.css";

type Props = {
  cardId: CardId;
  faceDown?: boolean;
  isPlayable?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
};

export default function PlayingCard({
  cardId,
  faceDown = false,
  isPlayable = true,
  isSelected = false,
  onClick,
  style,
}: Props) {
  if (faceDown) {
    return <div className={styles.faceDown} style={style} />;
  }

  const display = getCardDisplay(cardId);

  return (
    <div
      className={`${styles.card} ${!isPlayable ? styles.unplayable : ""} ${isSelected ? styles.selected : ""}`}
      style={{
        backgroundColor: display.bgColor,
        borderColor: isSelected ? "#ffffff" : display.borderColor,
        color: display.textColor,
        ...style,
      }}
      onClick={isPlayable && onClick ? onClick : undefined}
      role={onClick && isPlayable ? "button" : undefined}
      aria-label={`${display.label} ${display.colorName}`}
    >
      <span className={styles.topLeft}>{display.label}</span>
      <span className={styles.center}>{display.colorName[0]}</span>
      <span className={styles.bottomRight}>{display.label}</span>
    </div>
  );
}
