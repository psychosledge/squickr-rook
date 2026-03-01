import type { Color } from "@rook/engine";
import styles from "./TrumpPicker.module.css";

type Props = { onSelect: (color: Color) => void };

const COLORS: { color: Color; bg: string; label: string }[] = [
  { color: "Black",  bg: "#2d2d2d", label: "Black" },
  { color: "Red",    bg: "#c0392b", label: "Red" },
  { color: "Green",  bg: "#1e8449", label: "Green" },
  { color: "Yellow", bg: "#d68910", label: "Yellow" },
];

export default function TrumpPicker({ onSelect }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Pick Trump</h2>
        <div className={styles.colors}>
          {COLORS.map(({ color, bg, label }) => (
            <button
              key={color}
              className={styles.colorBtn}
              style={{ backgroundColor: bg }}
              onClick={() => onSelect(color)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
