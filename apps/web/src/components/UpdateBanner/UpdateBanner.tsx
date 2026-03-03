import { useRegisterSW } from "virtual:pwa-register/react";
import styles from "./UpdateBanner.module.css";

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    // role="alert" implies aria-live="assertive" per ARIA spec — no need to duplicate
    <div className={styles.banner} role="alert">
      <span>Update available!</span>
      {/* rejection intentionally discarded — SW updates are best-effort */}
      <button
        className={styles.reloadBtn}
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </button>
    </div>
  );
}
