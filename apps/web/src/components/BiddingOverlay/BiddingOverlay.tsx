import type { GameState } from "@rook/engine";
import { getSeatLabel } from "@/utils/seatLabel";
import styles from "./BiddingOverlay.module.css";

type Props = {
  gameState: GameState;
  onPlaceBid: (amount: number) => void;
  onPass: () => void;
  onShootMoon: () => void;
};

const HUMAN = "N" as const;

export default function BiddingOverlay({ gameState, onPlaceBid, onPass, onShootMoon }: Props) {
  const { bids, currentBid, activePlayer, rules, moonShooters } = gameState;
  const isMyTurn = activePlayer === HUMAN;
  const iAlreadyMoon = moonShooters.includes(HUMAN);

  const minNextBid = currentBid === 0 ? rules.minimumBid : currentBid + rules.bidIncrement;
  const bidOptions: number[] = [];
  for (let b = minNextBid; b <= rules.maximumBid; b += rules.bidIncrement) {
    bidOptions.push(b);
  }

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
            <div className={styles.bidButtons}>
              {bidOptions.map((amount) => (
                <button
                  key={amount}
                  className={styles.bidBtn}
                  aria-label={`Bid ${amount}`}
                  onClick={() => onPlaceBid(amount)}
                >
                  {amount}
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button className={styles.passBtn} onClick={onPass}>PASS</button>
              {!iAlreadyMoon && (
                <button className={styles.moonBtn} onClick={handleShootMoon}>
                  🌙 Shoot the Moon
                </button>
              )}
            </div>
          </>
        )}

        {!isMyTurn && (
          <div className={styles.waiting}>
            {activePlayer ? `${getSeatLabel(activePlayer)} is bidding…` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
