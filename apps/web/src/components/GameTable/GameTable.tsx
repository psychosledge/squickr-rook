import PlayerSeat from "@/components/PlayerSeat/PlayerSeat";
import CurrentTrick from "@/components/CurrentTrick/CurrentTrick";
import type { GameState, CardId, Seat } from "@rook/engine";
import { sortHand } from "@/utils/sortHand";
import styles from "./GameTable.module.css";

type Props = {
  gameState: GameState;
  onPlayCard: (cardId: CardId) => void;
  seatNames?: Partial<Record<Seat, string>>;
  humanSeat?: Seat;
};

/** Clockwise seat order */
const CLOCKWISE: Seat[] = ["N", "E", "S", "W"];

/**
 * Derive the 4 positional display slots from the human's seat.
 *
 * Screen layout (cardinal directions are the seat labels, not screen positions):
 *   - bottom = humanSeat (face-up, interactive)
 *   - top    = opposite seat (partner, 2 steps clockwise)
 *   - left   = next clockwise seat (1 step clockwise)
 *   - right  = previous clockwise seat (1 step counter-clockwise)
 *
 * Mnemonic: N→E→S→W clockwise, so from N's perspective E is to the left
 * and W is to the right on screen.
 */
function deriveSlots(humanSeat: Seat): { bottom: Seat; top: Seat; left: Seat; right: Seat } {
  const idx = CLOCKWISE.indexOf(humanSeat);
  const bottom = humanSeat;
  const top = CLOCKWISE[(idx + 2) % 4];
  const left = CLOCKWISE[(idx + 1) % 4];
  const right = CLOCKWISE[(idx + 3) % 4];
  return { bottom, top, left, right };
}

export default function GameTable({ gameState, onPlayCard, seatNames, humanSeat = "N" }: Props) {
  const { hands, activePlayer, currentTrick, trump, phase, dealer, bidder } = gameState;
  const isHumanTurn = phase === "playing" && activePlayer === humanSeat;

  const { bottom, top, left, right } = deriveSlots(humanSeat);

  const sortedHumanHand = sortHand(hands[humanSeat] ?? [], trump);

  return (
    <div className={styles.table}>
      {/* Partner — top center */}
      <div className={styles.top}>
        <PlayerSeat seat={top} cards={hands[top] ?? []} faceDown isActive={activePlayer === top} isBidder={bidder === top} isDealer={dealer === top} phase={phase} displayName={seatNames?.[top]} />
      </div>

      {/* Opponent — screen-left (next clockwise from human) */}
      <div className={styles.left}>
        <PlayerSeat seat={left} cards={hands[left] ?? []} faceDown isActive={activePlayer === left} isBidder={bidder === left} isDealer={dealer === left} phase={phase} displayName={seatNames?.[left]} />
      </div>

      {/* Center trick area */}
      <div className={styles.center}>
        <CurrentTrick trick={currentTrick} trump={trump} />
      </div>

      {/* Opponent — screen-right (previous clockwise from human) */}
      <div className={styles.right}>
        <PlayerSeat seat={right} cards={hands[right] ?? []} faceDown isActive={activePlayer === right} isBidder={bidder === right} isDealer={dealer === right} phase={phase} displayName={seatNames?.[right]} />
      </div>

      {/* Human — bottom */}
      <div className={styles.bottom}>
        <PlayerSeat
          seat={bottom}
          cards={sortedHumanHand}
          faceDown={false}
          isActive={activePlayer === humanSeat}
          isBidder={bidder === humanSeat}
          isDealer={dealer === humanSeat}
          phase={phase}
          onCardClick={isHumanTurn ? onPlayCard : undefined}
          displayName={seatNames?.[humanSeat]}
        />
      </div>
    </div>
  );
}
