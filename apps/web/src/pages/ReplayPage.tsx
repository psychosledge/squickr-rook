import { useState, useRef } from "react";
import type { CardId, GameRecord, Seat, TrickSnapshot } from "@rook/engine";
import { pointValue } from "@rook/engine";
import PlayingCard from "@/components/PlayingCard/PlayingCard";
import { sortHand } from "@/utils/sortHand";
import styles from "./ReplayPage.module.css";

export function computeOriginalHand(
  handAtTrick1: CardId[],
  nestCards: CardId[],
  discarded: CardId[]
): CardId[] {
  const nestSet = new Set(nestCards);
  const discardSet = new Set(discarded);
  return [
    ...handAtTrick1.filter((c) => !nestSet.has(c) || discardSet.has(c)),
    ...discarded.filter((c) => !nestSet.has(c)),
  ];
}

// Perspective mapping: given a perspective seat, which seat goes in each grid position?
const PERSPECTIVE_MAP: Record<Seat, { bottom: Seat; top: Seat; left: Seat; right: Seat }> = {
  N: { bottom: "N", top: "S", left: "E", right: "W" },
  E: { bottom: "E", top: "W", left: "S", right: "N" },
  S: { bottom: "S", top: "N", left: "W", right: "E" },
  W: { bottom: "W", top: "E", left: "N", right: "S" },
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
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function copyContext(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

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
    setTrickIndex(-1); // start at bidding summary step
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

  // Capture narrowed reference so closures below know game is non-nullable.
  const game = selectedGame;
  const totalTricks = game.transcript.length;

  // --- Bidding summary step (trickIndex === -1) ---
  if (trickIndex === -1) {
    const bidSeat = game.outcome.bidder;
    const bidAmount = game.outcome.bidAmount;
    const trump = game.transcript[0]!.trump;
    const trick1Hands = game.transcript[0]!.handsAtTrickStart;

    // Each player knew their own hand at bid time; only the bidder saw the nest.
    const perspHandAtBid = sortHand(
      perspective === bidSeat
        ? computeOriginalHand(trick1Hands[bidSeat], game.outcome.nestCards, game.outcome.discarded)
        : trick1Hands[perspective],
      trump,
    );

    function renderBidCard(cardId: CardId, idx: number) {
      return (
        <div key={idx} className={styles.cardSlot}>
          <PlayingCard cardId={cardId} faceDown={false} size="sm" isDisplay={true} style={{ marginLeft: 0 }} />
        </div>
      );
    }

    function buildBidContext(): string {
      return `Game: ${game.gameId} | Step: Bidding | Perspective: ${perspective} | feedback: `;
    }

    return (
      <div className={styles.page}>
        <div className={styles.trickHeader}>
          <button className={styles.backBtn} onClick={handleBack}>
            &larr; Games
          </button>
          <span className={styles.gameIdLabel}>{game.gameId}</span>
          <span>
            Bidding | Winner: {bidSeat} — {bidAmount} pts | Trump: {trump}
          </span>
          <button className={styles.copyBtn} onClick={() => copyContext(buildBidContext())}>
            {copied ? "Copied!" : "Copy context"}
          </button>
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

        <div className={styles.biddingView}>
          {game.bidHistory && game.bidHistory.length > 0 && (
            <div className={styles.biddingSection}>
              <span className={styles.biddingLabel}>Auction</span>
              <table className={styles.bidTable}>
                <thead>
                  <tr>
                    {(["N", "E", "S", "W"] as Seat[]).map((s) => (
                      <th key={s} className={`${styles.bidCol} ${s === bidSeat ? styles.bidWinner : ""}`}>
                        {s}{s === bidSeat ? " ★" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {game.bidHistory.map((entry, i) => (
                    <tr key={i}>
                      {(["N", "E", "S", "W"] as Seat[]).map((s) => (
                        <td key={s} className={`${styles.bidCell} ${s === entry.seat && s === bidSeat && entry.bid === bidAmount ? styles.bidWinningBid : ""}`}>
                          {s === entry.seat ? (entry.bid === "pass" ? "pass" : String(entry.bid)) : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.biddingSection}>
            <span className={styles.biddingLabel}>
              {perspective}'s hand at high bid
              {perspective === bidSeat ? ` (won: ${bidAmount})` : ""}
            </span>
            <div className={styles.handWrapper}>
              {perspHandAtBid.map(renderBidCard)}
            </div>
          </div>

          {perspective === bidSeat && (
            <div className={styles.biddingSection}>
              <span className={styles.biddingLabel}>Nest (picked up)</span>
              <div className={styles.handWrapper}>
                {sortHand(game.outcome.nestCards, trump).map(renderBidCard)}
              </div>
            </div>
          )}
        </div>

        <div className={styles.navBar}>
          <button className={styles.btn} disabled>
            &larr; Prev
          </button>
          <span className={styles.trickCounter}>Bid</span>
          <button className={styles.btn} onClick={() => setTrickIndex(0)}>
            Next &rarr;
          </button>
        </div>
      </div>
    );
  }

  // --- Trick view (trickIndex >= 0) ---
  const trick: TrickSnapshot = game.transcript[trickIndex]!;
  const positions = PERSPECTIVE_MAP[perspective];

  const winnerSeat = trick.winner;
  const winnerCardId = trick.plays.find((p) => p.seat === winnerSeat)?.cardId;

  // Cards each seat played in tricks before the current one (perfect-memory record)
  function computePreviouslyPlayed(seat: Seat): CardId[] {
    const result: CardId[] = [];
    for (let i = 0; i < trickIndex; i++) {
      const t = game.transcript[i]!;
      const play = t.plays.find((p) => p.seat === seat);
      if (play) result.push(play.cardId);
    }
    return result;
  }

  function renderSeatHand(seat: Seat) {
    const hand = sortHand(trick.handsAtTrickStart[seat] ?? [], trick.trump);
    const seatPlay = trick.plays.find((p) => p.seat === seat);
    const playedCard = seatPlay?.cardId;
    const isWinner = seat === winnerSeat;
    const isFaceUp = seat === perspective;
    const prevPlayed = sortHand(computePreviouslyPlayed(seat), trick.trump);
    // After the nest exchange only the discards are relevant — the nest itself is gone.
    const showDiscards = isFaceUp && seat === game.outcome.bidder;

    return (
      <div className={styles.seatBlock}>
        <div className={styles.seatLabel}>
          {seat}
          {isWinner && <span className={styles.winnerBadge}> W</span>}
        </div>
        <div className={styles.handWrapper}>
          {hand.map((cardId, idx) => {
            const isPlayedThisTrick = cardId === playedCard;
            const isWinningCard = cardId === winnerCardId;
            // Show played-this-trick card face-up for all seats (it's on the table)
            const showFaceUp = isFaceUp || isPlayedThisTrick;
            return (
              <div
                key={idx}
                className={`${styles.cardSlot} ${isPlayedThisTrick ? styles.played : ""} ${isWinningCard ? styles.winningCard : ""}`}
              >
                <PlayingCard
                  cardId={cardId}
                  faceDown={!showFaceUp}
                  size="sm"
                  isDisplay={true}
                  style={{ marginLeft: 0 }}
                />
              </div>
            );
          })}
        </div>
        {prevPlayed.length > 0 && (
          <div className={styles.playedHistory}>
            {prevPlayed.map((cardId, idx) => (
              <div key={idx} className={styles.cardSlot}>
                <PlayingCard cardId={cardId} faceDown={false} size="sm" isDisplay={true} style={{ marginLeft: 0 }} />
              </div>
            ))}
          </div>
        )}
        {showDiscards && (
          <div className={styles.nestSection}>
            <span className={styles.nestLabel}>Discarded (out of play)</span>
            <div className={styles.handWrapper}>
              {sortHand(game.outcome.discarded, trick.trump).map((cardId, idx) => (
                <div key={idx} className={styles.cardSlot}>
                  <PlayingCard cardId={cardId} faceDown={false} size="sm" isDisplay={true} style={{ marginLeft: 0 }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const nsScore = trick.cumulativeScore["NS"];
  const ewScore = trick.cumulativeScore["EW"];

  // Points remaining: sum of future trick points + nest bonus on last trick
  const nestBonus = game.outcome.discarded.reduce((sum, c) => sum + pointValue(c), 0);
  const futurePoints = game.transcript
    .slice(trickIndex + 1)
    .reduce((sum, t) => sum + t.pointsInTrick, 0);
  const remainingPoints = futurePoints + nestBonus;

  const bidder = game.outcome.bidder;
  const bidAmount = game.outcome.bidAmount;
  const bidTeam = bidder === "N" || bidder === "S" ? "NS" : "EW";
  const bidTeamScore = bidTeam === "NS" ? nsScore : ewScore;
  const bidTeamNeeds = Math.max(0, bidAmount - bidTeamScore);
  const bidTeamLabel = bidTeam === "NS" ? "NS" : "EW";

  function buildTrickContext(): string {
    return `Game: ${game.gameId} | Trick: ${trick.trickNumber} | Perspective: ${perspective} | feedback: `;
  }

  return (
    <div className={styles.page}>
      <div className={styles.trickHeader}>
        <button className={styles.backBtn} onClick={handleBack}>
          &larr; Games
        </button>
        <span className={styles.gameIdLabel}>{game.gameId}</span>
        <span>
          Trick {trick.trickNumber} of {totalTricks} | Lead: {trick.leadSeat} | Trump: {trick.trump} | This trick: {trick.pointsInTrick} pts
        </span>
        <button className={styles.copyBtn} onClick={() => copyContext(buildTrickContext())}>
          {copied ? "Copied!" : "Copy context"}
        </button>
      </div>

      <div className={styles.scoreTally}>
        <span className={`${styles.tallyTeam} ${bidTeam === "NS" ? styles.tallyBidder : ""}`}>
          NS: {nsScore}
        </span>
        <span className={styles.tallySep}>|</span>
        <span className={`${styles.tallyTeam} ${bidTeam === "EW" ? styles.tallyBidder : ""}`}>
          EW: {ewScore}
        </span>
        <span className={styles.tallySep}>|</span>
        <span className={styles.tallyBid}>
          Bid: {bidder} ({bidTeamLabel}) — {bidAmount}
        </span>
        <span className={styles.tallySep}>|</span>
        {bidTeamNeeds > 0
          ? <span className={styles.tallyNeeds}>{bidTeamLabel} needs {bidTeamNeeds} more</span>
          : <span className={styles.tallyMade}>{bidTeamLabel} has made it</span>
        }
        <span className={styles.tallySep}>|</span>
        <span className={styles.tallyRemaining}>{remainingPoints} pts left</span>
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
        <div className={styles.topSeat}>{renderSeatHand(positions.top)}</div>
        <div className={styles.leftSeat}>{renderSeatHand(positions.left)}</div>
        <div className={styles.centerLabel}>
          <div>Trump: {trick.trump}</div>
        </div>
        <div className={styles.rightSeat}>{renderSeatHand(positions.right)}</div>
        <div className={styles.bottomSeat}>{renderSeatHand(positions.bottom)}</div>
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
