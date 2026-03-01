import PlayerSeat from "@/components/PlayerSeat/PlayerSeat";
import CurrentTrick from "@/components/CurrentTrick/CurrentTrick";
import type { GameState, CardId } from "@rook/engine";
import styles from "./GameTable.module.css";

type Props = {
  gameState: GameState;
  onPlayCard: (cardId: CardId) => void;
};

const HUMAN = "N" as const;

export default function GameTable({ gameState, onPlayCard }: Props) {
  const { hands, activePlayer, currentTrick, trump, phase } = gameState;
  const isHumanTurn = phase === "playing" && activePlayer === HUMAN;

  return (
    <div className={styles.table}>
      {/* Partner S — top center */}
      <div className={styles.top}>
        <PlayerSeat seat="S" cards={hands["S"] ?? []} faceDown isActive={activePlayer === "S"} />
      </div>

      {/* Opponent E — left (clockwise from N at bottom) */}
      <div className={styles.left}>
        <PlayerSeat seat="E" cards={hands["E"] ?? []} faceDown isActive={activePlayer === "E"} />
      </div>

      {/* Center trick area */}
      <div className={styles.center}>
        <CurrentTrick trick={currentTrick} trump={trump} />
      </div>

      {/* Opponent W — right (clockwise from N at bottom) */}
      <div className={styles.right}>
        <PlayerSeat seat="W" cards={hands["W"] ?? []} faceDown isActive={activePlayer === "W"} />
      </div>

      {/* Human N — bottom */}
      <div className={styles.bottom}>
        <PlayerSeat
          seat="N"
          cards={hands["N"] ?? []}
          faceDown={false}
          isActive={activePlayer === HUMAN}
          onCardClick={isHumanTurn ? onPlayCard : undefined}
        />
      </div>
    </div>
  );
}
