import { useMemo } from "react";
import PlayerSeat from "@/components/PlayerSeat/PlayerSeat";
import CurrentTrick from "@/components/CurrentTrick/CurrentTrick";
import type { GameState, CardId } from "@rook/engine";
import { sortHand } from "@/utils/sortHand";
import styles from "./GameTable.module.css";

type Props = {
  gameState: GameState;
  onPlayCard: (cardId: CardId) => void;
};

const HUMAN = "N" as const;

export default function GameTable({ gameState, onPlayCard }: Props) {
  const { hands, activePlayer, currentTrick, trump, phase, dealer, bidder } = gameState;
  const isHumanTurn = phase === "playing" && activePlayer === HUMAN;

  const sortedNorthHand = useMemo(
    () => sortHand(hands["N"] ?? [], trump),
    [hands, trump],
  );

  return (
    <div className={styles.table}>
      {/* Partner S — top center */}
      <div className={styles.top}>
        <PlayerSeat seat="S" cards={hands["S"] ?? []} faceDown isActive={activePlayer === "S"} isBidder={bidder === "S"} isDealer={dealer === "S"} phase={phase} />
      </div>

      {/* Opponent E — screen-left (N=bottom, clockwise: N→E→S→W, so E is to N's left) */}
      <div className={styles.left}>
        <PlayerSeat seat="E" cards={hands["E"] ?? []} faceDown isActive={activePlayer === "E"} isBidder={bidder === "E"} isDealer={dealer === "E"} phase={phase} />
      </div>

      {/* Center trick area */}
      <div className={styles.center}>
        <CurrentTrick trick={currentTrick} trump={trump} />
      </div>

      {/* Opponent W — screen-right (N=bottom, clockwise: N→E→S→W, so W is to N's right) */}
      <div className={styles.right}>
        <PlayerSeat seat="W" cards={hands["W"] ?? []} faceDown isActive={activePlayer === "W"} isBidder={bidder === "W"} isDealer={dealer === "W"} phase={phase} />
      </div>

      {/* Human N — bottom */}
      <div className={styles.bottom}>
        <PlayerSeat
          seat="N"
          cards={sortedNorthHand}
          faceDown={false}
          isActive={activePlayer === HUMAN}
          isBidder={bidder === "N"}
          isDealer={dealer === "N"}
          phase={phase}
          onCardClick={isHumanTurn ? onPlayCard : undefined}
        />
      </div>
    </div>
  );
}
