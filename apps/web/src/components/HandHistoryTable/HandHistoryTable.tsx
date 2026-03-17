import type { HandHistoryRow } from "@/utils/handHistory";
import type { Team } from "@rook/engine";
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

/**
 * Returns moon-specific delta label and CSS class for a given team,
 * or null if this is not a moon hand (fall through to normal delta rendering).
 */
function formatMoonDelta(
  row: HandHistoryRow,
  team: Team,
): { text: string; className: string } | null {
  if (row.moonOutcome === null) return null;

  if (team === row.bidderTeam) {
    // Bidder team
    switch (row.moonOutcome) {
      case "set":
        return { text: "🌙 Set", className: styles.neg };
      case "made-positive":
        return { text: "🌙 Win", className: styles.pos };
      case "made-in-hole":
        return { text: "🌙 ↑0", className: styles.pos };
    }
  }
  // Opponent team — render numeric delta as normal
  return null;
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

          const nsMoon = formatMoonDelta(row, "NS");
          const ewMoon = formatMoonDelta(row, "EW");

          return (
            <tr key={row.handNumber} className={rowClass}>
              <td className={`${outcomeClass(row)} ${styles.iconCell}`}>
                {row.bidMade ? "✓" : "✗"}
              </td>
              <td>{row.bidderLabel}</td>
              <td>{row.shotMoon ? `${row.bidAmount} 🌙` : row.bidAmount}</td>
              <td>
                <div className={styles.scoreCell}>
                  <span className={styles.scoreCumulative}>{row.nsCumulative}</span>
                  {nsMoon ? (
                    <span className={`${styles.scoreDelta} ${nsMoon.className}`}>
                      {nsMoon.text}
                    </span>
                  ) : (
                    <span className={`${styles.scoreDelta} ${row.nsDelta >= 0 ? styles.pos : styles.neg}`}>
                      {formatDelta(row.nsDelta)}
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div className={styles.scoreCell}>
                  <span className={styles.scoreCumulative}>{row.ewCumulative}</span>
                  {ewMoon ? (
                    <span className={`${styles.scoreDelta} ${ewMoon.className}`}>
                      {ewMoon.text}
                    </span>
                  ) : (
                    <span className={`${styles.scoreDelta} ${row.ewDelta >= 0 ? styles.pos : styles.neg}`}>
                      {formatDelta(row.ewDelta)}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
