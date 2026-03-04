import type { HandHistoryRow } from "@/utils/handHistory";
import styles from "./HandHistoryTable.module.css";

type Props = {
  rows: HandHistoryRow[];
  highlightLast?: boolean;
};

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export default function HandHistoryTable({ rows, highlightLast }: Props) {
  if (rows.length === 0) {
    return <p className={styles.empty}>No hands played yet</p>;
  }

  return (
    <table className={styles.table} aria-label="Hand history">
      <thead>
        <tr>
          <th scope="col">Hand</th>
          <th scope="col">Bidder</th>
          <th scope="col">Bid</th>
          <th scope="col">NS Δ</th>
          <th scope="col">EW Δ</th>
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
              <td>{`H${row.handNumber}`}</td>
              <td>{row.bidderLabel}</td>
              <td>
                {row.bidAmount} — {row.outcomeBadge}
              </td>
              <td className={row.nsDelta >= 0 ? styles.pos : styles.neg}>
                {formatDelta(row.nsDelta)}
              </td>
              <td className={row.ewDelta >= 0 ? styles.pos : styles.neg}>
                {formatDelta(row.ewDelta)}
              </td>
              <td>{row.nsCumulative}</td>
              <td>{row.ewCumulative}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
