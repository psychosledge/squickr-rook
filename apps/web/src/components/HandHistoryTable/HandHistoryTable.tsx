import type { HandHistoryRow } from "@/utils/handHistory";
import styles from "./HandHistoryTable.module.css";

type Props = {
  rows: HandHistoryRow[];
  highlightLast?: boolean;
};

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function outcomeClass(row: HandHistoryRow): string {
  return row.bidMade ? styles.pos : styles.neg;
}

export default function HandHistoryTable({ rows, highlightLast }: Props) {
  if (rows.length === 0) {
    return <p className={styles.empty}>No hands played yet</p>;
  }

  return (
    <table className={styles.table} aria-label="Hand history">
      <thead>
        <tr>
          <th scope="col" aria-label="Outcome"></th>
          <th scope="col">Bidder</th>
          <th scope="col">Bid</th>
          <th scope="col">NS</th>
          <th scope="col">EW</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1;
          const rowClass = highlightLast && isLast ? styles.highlighted : undefined;

          return (
            <tr key={row.handNumber} className={rowClass}>
              <td className={`${outcomeClass(row)} ${styles.iconCell}`}>
                {row.bidMade ? "✓" : "✗"}
              </td>
              <td>{row.bidderLabel}</td>
              <td>{row.shotMoon ? `${row.bidAmount} 🌙` : row.bidAmount}</td>
              <td className={styles.scoreCell}>
                <span className={styles.scoreCumulative}>{row.nsCumulative}</span>
                <span className={`${styles.scoreDelta} ${row.nsDelta >= 0 ? styles.pos : styles.neg}`}>
                  {formatDelta(row.nsDelta)}
                </span>
              </td>
              <td className={styles.scoreCell}>
                <span className={styles.scoreCumulative}>{row.ewCumulative}</span>
                <span className={`${styles.scoreDelta} ${row.ewDelta >= 0 ? styles.pos : styles.neg}`}>
                  {formatDelta(row.ewDelta)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
