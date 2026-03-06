import styles from "./DisconnectAlert.module.css";
import type { Seat } from "@rook/engine";

export type DisconnectAlertProps = {
  displayName: string;
  seat: Seat;
  isHost: boolean;
  onReplaceWithBot: (seat: Seat) => void;
  onDismiss: () => void;
};

export function DisconnectAlert({ displayName, seat, isHost, onReplaceWithBot, onDismiss }: DisconnectAlertProps) {
  return (
    <div className={styles.banner} role="alert">
      <span className={styles.message}>{displayName} has disconnected.</span>
      {isHost ? (
        <button className={styles.btn} onClick={() => { onReplaceWithBot(seat); onDismiss(); }}>
          Replace with Bot
        </button>
      ) : (
        <button className={styles.btn} onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
