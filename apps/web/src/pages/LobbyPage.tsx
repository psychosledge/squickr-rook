import { useNavigate } from "react-router";
import { useGameStore } from "@/store/gameStore";
import type { BotDifficulty } from "@rook/engine";
import styles from "./LobbyPage.module.css";

const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];

export default function LobbyPage() {
  const navigate = useNavigate();
  const botDifficulty = useGameStore((s) => s.botDifficulty);
  const setBotDifficulty = useGameStore((s) => s.setBotDifficulty);
  const startGame = useGameStore((s) => s.startGame);

  function handleStart() {
    startGame(botDifficulty);
    void navigate("/game");
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>
      <p className={styles.subtitle}>2v2 trick-taking card game</p>

      <div className={styles.section}>
        <label className={styles.label}>Bot Difficulty</label>
        <div className={styles.difficultyPicker}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`${styles.diffBtn} ${botDifficulty === d ? styles.active : ""}`}
              onClick={() => setBotDifficulty(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button className={styles.startBtn} onClick={handleStart}>
        New Game
      </button>
      <span className={styles.version}>v{__APP_VERSION__}</span>
    </div>
  );
}
