import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import styles from "./AnnouncementBanner.module.css";

const VISIBLE_MS = 2700;   // how long the banner stays fully visible
const EXIT_MS   = 300;     // duration of the slide-out animation (matches CSS transition)

export default function AnnouncementBanner() {
  const announcement = useGameStore((s) => s.announcement);
  const clearAnnouncement = useGameStore((s) => s.clearAnnouncement);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!announcement) {
      setExiting(false);
      return;
    }

    // Phase 1: start slide-out animation
    const exitId = setTimeout(() => setExiting(true), VISIBLE_MS);

    // Phase 2: remove from store once animation completes
    const clearId = setTimeout(() => clearAnnouncement(), VISIBLE_MS + EXIT_MS);

    return () => {
      clearTimeout(exitId);
      clearTimeout(clearId);
    };
  }, [announcement, clearAnnouncement]);

  if (!announcement) return null;

  return (
    <div
      className={`${styles.banner}${exiting ? ` ${styles.exiting}` : ""}`}
      role="status"
      aria-live="polite"
    >
      {announcement}
    </div>
  );
}
