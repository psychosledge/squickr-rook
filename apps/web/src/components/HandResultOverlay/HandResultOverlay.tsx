import type { HandScore, Team } from "@rook/engine";
import styles from "./HandResultOverlay.module.css";

type Props = {
  score: HandScore;
  runningScores: Record<Team, number>;
  onContinue: () => void;
};

export default function HandResultOverlay({ score, runningScores, onContinue }: Props) {
  const { bidder, bidAmount, nsDelta, ewDelta, nsTotal, ewTotal } = score;
  const bidderTeam: Team = ["N", "S"].includes(bidder) ? "NS" : "EW";
  const bidWon = bidderTeam === "NS" ? nsDelta > 0 : ewDelta > 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Hand Result</h2>

        <div className={styles.bidResult}>
          <span className={bidWon ? styles.won : styles.lost}>
            {bidderTeam} bid {bidAmount} — {bidWon ? "MADE IT" : "SET!"}
          </span>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Points</th>
              <th>Delta</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NS</td>
              <td>{nsTotal}</td>
              <td className={nsDelta >= 0 ? styles.pos : styles.neg}>
                {nsDelta >= 0 ? "+" : ""}{nsDelta}
              </td>
              <td><strong>{runningScores.NS}</strong></td>
            </tr>
            <tr>
              <td>EW</td>
              <td>{ewTotal}</td>
              <td className={ewDelta >= 0 ? styles.pos : styles.neg}>
                {ewDelta >= 0 ? "+" : ""}{ewDelta}
              </td>
              <td><strong>{runningScores.EW}</strong></td>
            </tr>
          </tbody>
        </table>

        <button className={styles.btn} onClick={onContinue}>
          Next Hand
        </button>
      </div>
    </div>
  );
}
