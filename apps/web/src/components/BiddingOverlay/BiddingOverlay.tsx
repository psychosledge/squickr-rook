import { useState, useEffect } from "react";
import type { GameState, Seat } from "@rook/engine";
import styles from "./BiddingOverlay.module.css";

type Props = {
  gameState: GameState;
  onPlaceBid: (amount: number) => void;
  onPass: () => void;
  onShootMoon: () => void;
  humanSeat?: Seat;
};

// ── Pure render helper (state is passed in explicitly) ────────────────────────
// This is exported so tests can call it directly without hitting React hooks.
export type BiddingOverlayViewProps = Props & {
  pickerAmount: number;
  onIncrement: () => void;
  onDecrement: () => void;
  moonConfirmPending: boolean;
  onMoonConfirmRequest: () => void;
  onMoonConfirmCancel: () => void;
};

export function BiddingOverlayView({
  gameState,
  onPlaceBid,
  onPass,
  onShootMoon,
  pickerAmount,
  onIncrement,
  onDecrement,
  humanSeat = "N",
  moonConfirmPending,
  onMoonConfirmRequest,
  onMoonConfirmCancel,
}: BiddingOverlayViewProps) {
  const { bids, currentBid, activePlayer, rules, moonShooters } = gameState;
  const isMyTurn = activePlayer === humanSeat;

  if (!isMyTurn) return null;

  const { minimumBid, bidIncrement, maximumBid } = rules;

  const minNextBid = currentBid === 0 ? minimumBid : currentBid + bidIncrement;

  // moonEligible: human has not placed a numeric bid and is not already a moon shooter
  const iAlreadyMoon = moonShooters.includes(humanSeat);
  const humanBid = bids[humanSeat];
  const moonEligible = !iAlreadyMoon && typeof humanBid !== "number";

  // moonAlreadyShot: once any player shoots the moon, numeric bidding is closed
  const moonAlreadyShot = moonShooters.length > 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} aria-label="Bidding">
        {/* Stepper and confirm — hidden once someone has shot the moon */}
        {!moonAlreadyShot && (
          <>
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

            <button
              className={styles.confirmBidBtn}
              aria-label={`Confirm bid of ${pickerAmount}`}
              onClick={() => onPlaceBid(pickerAmount)}
            >
              Confirm bid: {pickerAmount}
            </button>
          </>
        )}

        {/* Pass button — always visible */}
        <button className={styles.passBtn} onClick={onPass}>PASS</button>

        {/* Moon button or inline confirm */}
        {moonEligible && (
          moonConfirmPending ? (
            <div className={styles.moonConfirm}>
              <span className={styles.moonConfirmText}>Shoot the Moon?</span>
              <button className={styles.moonConfirmYes} onClick={onShootMoon}>Yes, shoot!</button>
              <button className={styles.moonConfirmNo} onClick={onMoonConfirmCancel}>Cancel</button>
            </div>
          ) : (
            <button className={styles.moonBtn} onClick={onMoonConfirmRequest}>
              🌙 Shoot the Moon
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Stateful wrapper (the actual exported default) ────────────────────────────
export default function BiddingOverlay({ gameState, onPlaceBid, onPass, onShootMoon, humanSeat = "N" }: Props) {
  const { currentBid, rules } = gameState;
  const minNextBid = currentBid === 0 ? rules.minimumBid : currentBid + rules.bidIncrement;

  const [pickerAmount, setPickerAmount] = useState(minNextBid);
  const [moonConfirmPending, setMoonConfirmPending] = useState(false);

  // Reset pickerAmount when the legal minimum advances (another player outbid us).
  // We only react to the derived minNextBid value, not its constituent rule inputs,
  // to avoid spurious resets when rules object identity changes.
  // Clamp to maximumBid so the picker never initialises above the legal ceiling.
  useEffect(() => {
    setPickerAmount(Math.min(minNextBid, rules.maximumBid));
  }, [minNextBid]); // eslint-disable-line react-hooks/exhaustive-deps

  function increment() {
    setPickerAmount((a) => Math.min(a + rules.bidIncrement, rules.maximumBid));
  }

  function decrement() {
    setPickerAmount((a) => Math.max(a - rules.bidIncrement, minNextBid));
  }

  function handleShootMoon() {
    setMoonConfirmPending(false);
    onShootMoon();
  }

  return (
    <BiddingOverlayView
      gameState={gameState}
      onPlaceBid={onPlaceBid}
      onPass={onPass}
      onShootMoon={handleShootMoon}
      pickerAmount={pickerAmount}
      onIncrement={increment}
      onDecrement={decrement}
      humanSeat={humanSeat}
      moonConfirmPending={moonConfirmPending}
      onMoonConfirmRequest={() => setMoonConfirmPending(true)}
      onMoonConfirmCancel={() => setMoonConfirmPending(false)}
    />
  );
}
