import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/gameStore";
import { BOT_DIFFICULTY_LABELS } from "@rook/engine";
import type { BotDifficulty } from "@rook/engine";
import styles from "./SetupPage.module.css";

const DISPLAYED_DIFFICULTIES: { value: BotDifficulty; label: string }[] = [
  { value: 1, label: 'Easy' },
  { value: 3, label: 'Medium' },
  { value: 5, label: 'Hard' },
];

// ---------------------------------------------------------------------------
// Pure sub-components (exported for unit testing)
// ---------------------------------------------------------------------------

export type DifficultyPickerProps = {
  value: BotDifficulty;
  onChange: (d: BotDifficulty) => void;
  label: string;
};

export function DifficultyPicker({ value, onChange, label }: DifficultyPickerProps) {
  return (
    <div className={styles.pickerRow}>
      <span className={styles.seatLabel}>{label}</span>
      <div className={styles.pickerButtons}>
        {DISPLAYED_DIFFICULTIES.map((item) => (
          <button
            key={item.value}
            className={`${styles.diffBtn} ${value === item.value ? styles.active : ""}`}
            onClick={() => onChange(item.value)}
            aria-pressed={value === item.value}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type SetupViewProps = {
  botDifficulties: Record<"E" | "S" | "W", BotDifficulty>;
  onSetAll: (d: BotDifficulty) => void;
  onSetSeat: (seat: "E" | "S" | "W", d: BotDifficulty) => void;
  onStart: () => void;
  onBack: () => void;
};

export function SetupView({
  botDifficulties,
  onSetAll,
  onSetSeat,
  onStart,
  onBack,
}: SetupViewProps) {
  const allSame =
    botDifficulties.E === botDifficulties.S &&
    botDifficulties.S === botDifficulties.W;

  const setAllLabel = allSame ? BOT_DIFFICULTY_LABELS[botDifficulties.E] : "Mixed";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <h1 className={styles.title}>Game Setup</h1>
      </div>

      <div className={styles.card}>
        <p className={styles.sectionHeading}>Bot Difficulty</p>

        <div className={`${styles.pickerRow} ${styles.setAllRow}`}>
          <span className={styles.seatLabel}>Set All</span>
          <div className={styles.pickerButtons}>
            {DISPLAYED_DIFFICULTIES.map((item) => (
              <button
                key={item.value}
                className={`${styles.diffBtn} ${allSame && botDifficulties.E === item.value ? styles.active : ""}`}
                onClick={() => onSetAll(item.value)}
                aria-pressed={allSame && botDifficulties.E === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className={styles.diffLabel}>{setAllLabel}</span>
        </div>

        <div className={styles.divider} />

        <DifficultyPicker
          label="East"
          value={botDifficulties.E}
          onChange={(d) => onSetSeat("E", d)}
        />
        <DifficultyPicker
          label="Partner"
          value={botDifficulties.S}
          onChange={(d) => onSetSeat("S", d)}
        />
        <DifficultyPicker
          label="West"
          value={botDifficulties.W}
          onChange={(d) => onSetSeat("W", d)}
        />
      </div>

      <button className={styles.startBtn} onClick={onStart}>
        Start Game
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stateful page component (default export)
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const navigate = useNavigate();
  const gameState = useGameStore((s) => s.gameState);
  const botDifficulties = useGameStore((s) => s.botDifficulties);
  const setAllBotDifficulty = useGameStore((s) => s.setAllBotDifficulty);
  const setBotDifficultySeat = useGameStore((s) => s.setBotDifficultySeat);
  const startGame = useGameStore((s) => s.startGame);

  // If a game is already in progress, skip setup and go straight to it
  useEffect(() => {
    if (gameState !== null) void navigate("/game");
  }, [gameState, navigate]);

  function handleStart() {
    startGame(botDifficulties);
    void navigate("/game");
  }

  return (
    <SetupView
      botDifficulties={botDifficulties}
      onSetAll={setAllBotDifficulty}
      onSetSeat={setBotDifficultySeat}
      onStart={handleStart}
      onBack={() => void navigate("/")}
    />
  );
}
