import PlayerSeat from "@/components/PlayerSeat/PlayerSeat";
import CurrentTrick from "@/components/CurrentTrick/CurrentTrick";
import type { GameState, CardId, Seat } from "@rook/engine";
import { sortHand } from "@/utils/sortHand";
import { deriveSlots } from "@/utils/seatPositions";
import styles from "./GameTable.module.css";

type Props = {
  gameState: GameState;
  onPlayCard: (cardId: CardId) => void;
  seatNames?: Partial<Record<Seat, string>>;
  difficultyLabels?: Partial<Record<Seat, string>>;
  humanSeat?: Seat;
  biddingThinkingSeat?: Seat | null;
};

export default function GameTable({ gameState, onPlayCard, seatNames, difficultyLabels, humanSeat = "N", biddingThinkingSeat }: Props) {
  const { hands, activePlayer, currentTrick, trump, phase, dealer, bidder, bids, moonShooters } = gameState;
  const isHumanTurn = phase === "playing" && activePlayer === humanSeat;

  const { bottom, top, left, right } = deriveSlots(humanSeat);

  const sortedHumanHand = sortHand(hands[humanSeat] ?? [], trump);

  // Intentionally shows bid chips beyond the bidding phase — they serve as a
  // reminder of the auction result throughout the hand (e.g. who bid, who passed).
  function getBidDisplay(seat: Seat): string | undefined {
    if (phase === "bidding" && biddingThinkingSeat === seat) return "…";
    const bid = bids[seat];
    if (bid === null) return undefined;
    if (bid === "pass") return "PASS";
    const isMoon = moonShooters.includes(seat);
    return isMoon ? `${bid} 🌙` : String(bid);
  }

  return (
    <div className={styles.table}>
      {/* Partner — top center */}
      <div className={styles.top}>
        <PlayerSeat seat={top} cards={hands[top] ?? []} faceDown isActive={activePlayer === top} isBidder={bidder === top} isDealer={dealer === top} phase={phase} gameState={gameState} displayName={seatNames?.[top]} difficultyLabel={difficultyLabels?.[top]} position="top" bidDisplay={getBidDisplay(top)} />
      </div>

      {/* Opponent — screen-left (next clockwise from human) */}
      <div className={styles.left}>
        <PlayerSeat seat={left} cards={hands[left] ?? []} faceDown isActive={activePlayer === left} isBidder={bidder === left} isDealer={dealer === left} phase={phase} gameState={gameState} displayName={seatNames?.[left]} difficultyLabel={difficultyLabels?.[left]} position="left" bidDisplay={getBidDisplay(left)} />
      </div>

      {/* Center trick area */}
      <div className={styles.center}>
        <CurrentTrick trick={currentTrick} trump={trump} humanSeat={humanSeat} seatNames={seatNames} />
      </div>

      {/* Opponent — screen-right (previous clockwise from human) */}
      <div className={styles.right}>
        <PlayerSeat seat={right} cards={hands[right] ?? []} faceDown isActive={activePlayer === right} isBidder={bidder === right} isDealer={dealer === right} phase={phase} gameState={gameState} displayName={seatNames?.[right]} difficultyLabel={difficultyLabels?.[right]} position="right" bidDisplay={getBidDisplay(right)} />
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
          gameState={gameState}
          onCardClick={isHumanTurn ? onPlayCard : undefined}
          displayName={seatNames?.[humanSeat]}
          position="bottom"
          bidDisplay={getBidDisplay(bottom)}
        />
      </div>
    </div>
  );
}
