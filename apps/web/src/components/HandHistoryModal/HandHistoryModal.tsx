import type { HandHistoryRow } from "@/utils/handHistory";
import HandHistoryTable from "@/components/HandHistoryTable/HandHistoryTable";
import styles from "./HandHistoryModal.module.css";

type Props = {
  rows: HandHistoryRow[];
  onClose: () => void;
};

export default function HandHistoryModal({ rows, onClose }: Props) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-history-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div className={styles.header}>
          <h2 id="hand-history-modal-title">Hand History</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>
          <HandHistoryTable rows={rows} />
        </div>
      </div>
    </div>
  );
}
