import { useState, useEffect } from "react";
import type { GameState, Seat } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import styles from "./BiddingOverlay.module.css";

type Props = {
  gameState: GameState;
  onPlaceBid: (amount: number) => void;
  onPass: () => void;
  onShootMoon: () => void;
  biddingThinkingSeat?: Seat | null;
  humanSeat?: Seat;
};

// ── Pure render helper (state is passed in explicitly) ────────────────────────
// This is exported so tests can call it directly without hitting React hooks.
export type BiddingOverlayViewProps = Props & {
  pickerAmount: number;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function BiddingOverlayView({
  gameState,
  onPlaceBid,
  onPass,
  onShootMoon,
  pickerAmount,
  onIncrement,
  onDecrement,
  biddingThinkingSeat,
  humanSeat = "N",
}: BiddingOverlayViewProps) {
  const { bids, currentBid, activePlayer, rules, moonShooters } = gameState;
  const isMyTurn = activePlayer === humanSeat;
  const { minimumBid, bidIncrement, maximumBid } = rules;

  const minNextBid = currentBid === 0 ? minimumBid : currentBid + bidIncrement;

  // moonEligible: human has not placed a numeric bid and is not already a moon shooter
  const iAlreadyMoon = moonShooters.includes(humanSeat);
  const humanBid = bids[humanSeat];
  const moonEligible = !iAlreadyMoon && typeof humanBid !== "number";

  const seats = ["N", "E", "S", "W"] as const;

  function handleShootMoon() {
    if (window.confirm("Shoot the Moon? You'll bid the maximum and attempt to capture all points!")) {
      onShootMoon();
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} role="region" aria-label="Bidding">
        <h2 className={styles.title} id="bidding-title">Bidding</h2>

        <div className={styles.currentBid}>
          {currentBid > 0 ? `Current bid: ${currentBid}` : "No bids yet"}
        </div>

        <table className={styles.bidTable}>
          <tbody>
            {seats.map((seat) => {
              const bid = bids[seat];
              const isActive = seat === activePlayer;
              const isMoonShooter = moonShooters.includes(seat);
              let display = "–";
              if (bid === "pass") display = "PASS";
              else if (typeof bid === "number") display = isMoonShooter ? `${bid} 🌙` : String(bid);
              return (
                <tr key={seat} className={isActive ? styles.activeRow : undefined}>
                  <td className={styles.seatName}>{getSeatLabel(seat)}</td>
                  <td className={bid === "pass" ? styles.passed : styles.bidVal}>{display}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {isMyTurn && (
          <>
            {/* Stepper row — always visible */}
            <div className={styles.picker}>
              <button
                className={styles.stepBtn}
                aria-label="Decrease bid"
                onClick={onDecrement}
                disabled={pickerAmount <= minNextBid}
              >
                −
              </button>
              <span className={styles.pickerAmount}>{pickerAmount}</span>
              <button
                className={styles.stepBtn}
                aria-label="Increase bid"
                onClick={onIncrement}
                disabled={pickerAmount >= maximumBid}
              >
                +
              </button>
            </div>

            {/* Confirm bid button — always visible */}
            <button
              className={styles.confirmBidBtn}
              aria-label={`Confirm bid of ${pickerAmount}`}
              onClick={() => onPlaceBid(pickerAmount)}
            >
              Confirm bid: {pickerAmount}
            </button>

            {/* Pass button — always visible */}
            <button className={styles.passBtn} onClick={onPass}>PASS</button>

            {/* Moon button — below Pass, only when moonEligible */}
            {moonEligible && (
              <button className={styles.moonBtn} onClick={handleShootMoon}>
                🌙 Shoot the Moon
              </button>
            )}
          </>
        )}

        {!isMyTurn && (
          <div className={styles.waiting}>
            <span className={biddingThinkingSeat ? styles.thinking : undefined}>
              {biddingThinkingSeat
                ? `${getSeatLabel(biddingThinkingSeat)} is thinking…`
                : activePlayer
                ? `${getSeatLabel(activePlayer)} is bidding…`
                : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stateful wrapper (the actual exported default) ────────────────────────────
export default function BiddingOverlay({ gameState, onPlaceBid, onPass, onShootMoon, biddingThinkingSeat, humanSeat = "N" }: Props) {
  const { currentBid, rules } = gameState;
  const minNextBid = currentBid === 0 ? rules.minimumBid : currentBid + rules.bidIncrement;

  const [pickerAmount, setPickerAmount] = useState(minNextBid);

  // Reset pickerAmount when the legal minimum advances (another player outbid us).
  // We only react to the derived minNextBid value, not its constituent rule inputs,
  // to avoid spurious resets when rules object identity changes.
  useEffect(() => {
    setPickerAmount(minNextBid);
  }, [minNextBid]); // eslint-disable-line react-hooks/exhaustive-deps

  function increment() {
    setPickerAmount((a) => Math.min(a + rules.bidIncrement, rules.maximumBid));
  }

  function decrement() {
    setPickerAmount((a) => Math.max(a - rules.bidIncrement, minNextBid));
  }

  return (
    <BiddingOverlayView
      gameState={gameState}
      onPlaceBid={onPlaceBid}
      onPass={onPass}
      onShootMoon={onShootMoon}
      pickerAmount={pickerAmount}
      onIncrement={increment}
      onDecrement={decrement}
      biddingThinkingSeat={biddingThinkingSeat}
      humanSeat={humanSeat}
    />
  );
}
