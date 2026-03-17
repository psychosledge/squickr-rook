import { useState } from "react";
import type { HandScore, Seat, Team } from "@rook/engine";
import { SEAT_TEAM } from "@rook/engine";
import { teamDisplay } from "@/utils/seatLabel";
import { buildHandHistoryRows } from "@/utils/handHistory";
import HandHistoryTable from "@/components/HandHistoryTable/HandHistoryTable";
import styles from "./HandResultOverlay.module.css";

type Props = {
  score: HandScore;
  runningScores: Record<Team, number>;
  onContinue: () => void;
  handHistory?: HandScore[];
  seatNames?: Partial<Record<Seat, string>>;
};

// ── Pure render helper (state is passed in explicitly) ────────────────────────
// Exported so tests can call it directly without hitting React hooks.
export type HandResultOverlayViewProps = Props & {
  activeTab: "result" | "history";
  onTabChange: (tab: "result" | "history") => void;
};

/** Returns the Outcome cell content for a given team row. */
function renderOutcomeCell(
  score: HandScore,
  team: Team,
  runningScores: Record<Team, number>,
  styles: Record<string, string>,
): React.ReactNode {
  const { shotMoon, moonShooterWentSet, nsDelta, ewDelta } = score;
  const bidderTeam: Team = SEAT_TEAM[score.bidder];

  if (!shotMoon) {
    // Normal hand — numeric delta
    const delta = team === "NS" ? nsDelta : ewDelta;
    return (
      <td className={delta >= 0 ? styles.pos : styles.neg}>
        {delta >= 0 ? "+" : ""}{delta}
      </td>
    );
  }

  // Moon hand
  if (moonShooterWentSet) {
    if (team === bidderTeam) {
      return <td className={styles.neg}>Instant loss</td>;
    } else {
      return <td className={styles.pos}>Instant win</td>;
    }
  }

  // Moon made — determine made-in-hole vs made-positive using pre-hand score
  const teamDelta = team === "NS" ? nsDelta : ewDelta;
  const preHandScore = runningScores[team] - teamDelta;

  if (team === bidderTeam) {
    if (preHandScore < 0) {
      return <td className={styles.pos}>Reset to 0</td>;
    } else {
      return <td className={styles.pos}>Instant win</td>;
    }
  } else {
    // Opponent — show numeric delta
    return (
      <td className={teamDelta >= 0 ? styles.pos : styles.neg}>
        {teamDelta >= 0 ? "+" : ""}{teamDelta}
      </td>
    );
  }
}

export function HandResultOverlayView({
  score,
  runningScores,
  onContinue,
  handHistory,
  seatNames,
  activeTab,
  onTabChange,
}: HandResultOverlayViewProps) {
  const { bidder, bidAmount, nsTotal, ewTotal } = score;
  const bidderTeam: Team = SEAT_TEAM[bidder];
  const bidderPoints = bidderTeam === "NS" ? nsTotal : ewTotal;
  const bidWon = bidderPoints >= bidAmount || (score.shotMoon && !score.moonShooterWentSet);

  const hasTabs = handHistory != null && handHistory.length > 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Hand Result</h2>

        {hasTabs && (
          <div className={styles.tabs}>
            <button
              className={`${styles.tab}${activeTab === "result" ? ` ${styles.activeTab}` : ""}`}
              onClick={() => onTabChange("result")}
            >
              Result
            </button>
            <button
              className={`${styles.tab}${activeTab === "history" ? ` ${styles.activeTab}` : ""}`}
              onClick={() => onTabChange("history")}
            >
              History
            </button>
          </div>
        )}

        {(!hasTabs || activeTab === "result") && (
          <>
            <div className={styles.bidResult}>
              <span className={bidWon ? styles.won : styles.lost}>
                {teamDisplay(bidderTeam, seatNames)} bid {bidAmount} — {bidWon ? "MADE IT" : "SET!"}
              </span>
              {score.shotMoon && (
                <div className={styles.moon}>🌙 Shoot the Moon!</div>
              )}
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Outcome</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{teamDisplay("NS", seatNames)}</td>
                  <td>{score.nsTotal}</td>
                  {renderOutcomeCell(score, "NS", runningScores, styles)}
                  <td><strong>{runningScores.NS}</strong></td>
                </tr>
                <tr>
                  <td>{teamDisplay("EW", seatNames)}</td>
                  <td>{score.ewTotal}</td>
                  {renderOutcomeCell(score, "EW", runningScores, styles)}
                  <td><strong>{runningScores.EW}</strong></td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {hasTabs && activeTab === "history" && handHistory && (
          <HandHistoryTable
            rows={buildHandHistoryRows(handHistory, undefined, seatNames)}
            highlightLast={true}
          />
        )}

        <button className={styles.btn} onClick={onContinue}>
          Next Hand
        </button>
      </div>
    </div>
  );
}

// ── Default export: stateful shell ────────────────────────────────────────────
export default function HandResultOverlay(props: Props) {
  const [activeTab, setActiveTab] = useState<"result" | "history">("result");
  return (
    <HandResultOverlayView
      {...props}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}
