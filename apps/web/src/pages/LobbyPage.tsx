import { useNavigate } from "react-router";
import styles from "./LobbyPage.module.css";

export default function LobbyPage() {
  const navigate = useNavigate();

  function handleNewGame() {
    void navigate("/setup");
  }

  function handleOnline() {
    void navigate("/online");
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>
      <p className={styles.subtitle}>2v2 trick-taking card game</p>

      <button className={styles.startBtn} onClick={handleNewGame}>
        New Game
      </button>
      <button className={styles.onlineBtn} onClick={handleOnline}>
        Play Online
      </button>
      <span className={styles.version}>v{__APP_VERSION__}</span>
    </div>
  );
}
