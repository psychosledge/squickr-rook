import { useState, useRef } from "react";
import type { GameRecord, Seat, TrickSnapshot, Team } from "@rook/engine";
import CardHand from "@/components/CardHand/CardHand";
import styles from "./ReplayPage.module.css";

// Perspective mapping: given a perspective seat, which seat goes in each grid position?
const PERSPECTIVE_MAP: Record<Seat, { bottom: Seat; top: Seat; left: Seat; right: Seat }> = {
  N: { bottom: "N", top: "S", left: "W", right: "E" },
  E: { bottom: "E", top: "W", left: "N", right: "S" },
  S: { bottom: "S", top: "N", left: "E", right: "W" },
  W: { bottom: "W", top: "E", left: "S", right: "N" },
};

export function parseInput(raw: string): GameRecord[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Try NDJSON first (multiple lines)
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.map((line) => JSON.parse(line) as GameRecord);
  }
  // Single JSON: could be array or single object
  const parsed = JSON.parse(trimmed) as GameRecord | GameRecord[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export default function ReplayPage() {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [trickIndex, setTrickIndex] = useState(0);
  const [perspective, setPerspective] = useState<Seat>("N");
  const [pasteText, setPasteText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadGames(records: GameRecord[]) {
    setGames(records);
    setSelectedGame(null);
    setTrickIndex(0);
    setLoadError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const records = parseInput(text);
        loadGames(records);
      } catch (err) {
        setLoadError(`Failed to parse file: ${String(err)}`);
      }
    };
    reader.readAsText(file);
  }

  function handlePasteLoad() {
    try {
      const records = parseInput(pasteText);
      loadGames(records);
    } catch (err) {
      setLoadError(`Failed to parse input: ${String(err)}`);
    }
  }

  function handleSelectGame(game: GameRecord) {
    setSelectedGame(game);
    setTrickIndex(0);
    setPerspective("N");
  }

  function handleBack() {
    setSelectedGame(null);
    setTrickIndex(0);
  }

  // --- Load screen ---
  if (!selectedGame) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>Replay Viewer</h1>

        <div className={styles.loadSection}>
          <div className={styles.loadBlock}>
            <h2 className={styles.subheading}>Load from file</h2>
            <p className={styles.hint}>Accepts .ndjson (one GameRecord per line) or .json</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ndjson,.json"
              onChange={handleFileChange}
              className={styles.fileInput}
            />
          </div>

          <div className={styles.loadBlock}>
            <h2 className={styles.subheading}>Paste JSON</h2>
            <p className={styles.hint}>Paste a single GameRecord JSON string</p>
            <textarea
              className={styles.pasteArea}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='{"gameId": "game-0001", ...}'
              rows={6}
            />
            <button className={styles.btn} onClick={handlePasteLoad}>
              Load
            </button>
          </div>
        </div>

        {loadError && <p className={styles.error}>{loadError}</p>}

        {games.length > 0 && (
          <div className={styles.gameList}>
            <h2 className={styles.subheading}>Games ({games.length})</h2>
            <ul className={styles.gameListItems}>
              {games.map((g) => (
                <li key={g.gameId}>
                  <button className={styles.gameListItem} onClick={() => handleSelectGame(g)}>
                    <span className={styles.gameId}>{g.gameId}</span>
                    <span className={styles.gameMeta}>seed: {g.dealSeed} | hand: {g.handNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // --- Trick view ---
  const trick: TrickSnapshot = selectedGame.transcript[trickIndex]!;
  const totalTricks = selectedGame.transcript.length;
  const positions = PERSPECTIVE_MAP[perspective];

  const playedCardIds = new Set(trick.plays.map((p) => p.cardId));
  const winnerSeat = trick.winner;
  const winnerCardId = trick.plays.find((p) => p.seat === winnerSeat)?.cardId;

  function renderSeatHand(seat: Seat, orientation: "horizontal" | "vertical") {
    const hand = trick.handsAtTrickStart[seat] ?? [];
    const seatPlay = trick.plays.find((p) => p.seat === seat);
    const playedCard = seatPlay?.cardId;
    const isWinner = seat === winnerSeat;

    return (
      <div className={styles.seatBlock}>
        <div className={styles.seatLabel}>
          {seat}
          {isWinner && <span className={styles.winnerBadge}> W</span>}
        </div>
        <div className={styles.handWrapper}>
          {hand.map((cardId, idx) => {
            const isPlayed = playedCardIds.has(cardId) && playedCard === cardId;
            const isWinningCard = cardId === winnerCardId && isPlayed;
            return (
              <div
                key={idx}
                className={`${styles.cardSlot} ${isPlayed ? styles.played : ""} ${isWinningCard ? styles.winningCard : ""}`}
              >
                <div className={styles.singleCard}>
                  <CardHand
                    cards={[cardId]}
                    faceDown={false}
                    size="sm"
                    orientation={orientation}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const nsScore = trick.cumulativeScore["NS"];
  const ewScore = trick.cumulativeScore["EW"];

  return (
    <div className={styles.page}>
      <div className={styles.trickHeader}>
        <button className={styles.backBtn} onClick={handleBack}>
          &larr; Games
        </button>
        <span className={styles.gameIdLabel}>{selectedGame.gameId}</span>
        <span>
          Trick {trick.trickNumber} of {totalTricks} | Lead: {trick.leadSeat} | Trump:{" "}
          {trick.trump} | Points this trick: {trick.pointsInTrick} | Score — NS: {nsScore}, EW:{" "}
          {ewScore}
        </span>
      </div>

      <div className={styles.perspectiveBar}>
        <span className={styles.perspectiveLabel}>Perspective:</span>
        {(["N", "E", "S", "W"] as Seat[]).map((seat) => (
          <button
            key={seat}
            className={`${styles.perspectiveBtn} ${perspective === seat ? styles.activePerspective : ""}`}
            onClick={() => setPerspective(seat)}
          >
            {seat}
          </button>
        ))}
      </div>

      <div className={styles.tableGrid}>
        {/* Top */}
        <div className={styles.topSeat}>{renderSeatHand(positions.top, "horizontal")}</div>
        {/* Left */}
        <div className={styles.leftSeat}>{renderSeatHand(positions.left, "vertical")}</div>
        {/* Center label */}
        <div className={styles.centerLabel}>
          <div>Trump: {trick.trump}</div>
        </div>
        {/* Right */}
        <div className={styles.rightSeat}>{renderSeatHand(positions.right, "vertical")}</div>
        {/* Bottom */}
        <div className={styles.bottomSeat}>{renderSeatHand(positions.bottom, "horizontal")}</div>
      </div>

      <div className={styles.navBar}>
        <button
          className={styles.btn}
          onClick={() => setTrickIndex((i) => i - 1)}
          disabled={trickIndex === 0}
        >
          &larr; Prev
        </button>
        <span className={styles.trickCounter}>
          {trickIndex + 1} / {totalTricks}
        </span>
        <button
          className={styles.btn}
          onClick={() => setTrickIndex((i) => i + 1)}
          disabled={trickIndex === totalTricks - 1}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
