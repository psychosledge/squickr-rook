import { useState } from "react";
import type { HandScore, Team } from "@rook/engine";
import { SEAT_TEAM } from "@rook/engine";
import { getTeamLabel } from "@/utils/seatLabel";
import { buildHandHistoryRows } from "@/utils/handHistory";
import HandHistoryTable from "@/components/HandHistoryTable/HandHistoryTable";
import styles from "./HandResultOverlay.module.css";

type Props = {
  score: HandScore;
  runningScores: Record<Team, number>;
  onContinue: () => void;
  handHistory?: HandScore[];
};

// ── Pure render helper (state is passed in explicitly) ────────────────────────
// Exported so tests can call it directly without hitting React hooks.
export type HandResultOverlayViewProps = Props & {
  activeTab: "result" | "history";
  onTabChange: (tab: "result" | "history") => void;
};

export function HandResultOverlayView({
  score,
  runningScores,
  onContinue,
  handHistory,
  activeTab,
  onTabChange,
}: HandResultOverlayViewProps) {
  const { bidder, bidAmount, nsDelta, ewDelta, nsTotal, ewTotal } = score;
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
                {getTeamLabel(bidderTeam)} bid {bidAmount} — {bidWon ? "MADE IT" : "SET!"}
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
                  <th>Delta</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{getTeamLabel("NS")}</td>
                  <td>{nsTotal}</td>
                  <td className={nsDelta >= 0 ? styles.pos : styles.neg}>
                    {nsDelta >= 0 ? "+" : ""}{nsDelta}
                  </td>
                  <td><strong>{runningScores.NS}</strong></td>
                </tr>
                <tr>
                  <td>{getTeamLabel("EW")}</td>
                  <td>{ewTotal}</td>
                  <td className={ewDelta >= 0 ? styles.pos : styles.neg}>
                    {ewDelta >= 0 ? "+" : ""}{ewDelta}
                  </td>
                  <td><strong>{runningScores.EW}</strong></td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {hasTabs && activeTab === "history" && handHistory && (
          <HandHistoryTable
            rows={buildHandHistoryRows(handHistory)}
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
