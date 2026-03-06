import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { customAlphabet } from "nanoid";
import { useOnlineGameStore } from "@/store/onlineGameStore";
import type { SeatInfo } from "@/store/onlineGameStore.types";
import type { Seat } from "@rook/engine";
import { getLobbyLabel } from "@/utils/seatLabel";
import styles from "./OnlineLobbyPage.module.css";

// ── Room code generator ──────────────────────────────────────────────────────
const roomCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
function generateRoomCode() {
  return roomCodeAlphabet();
}

// ── View: Name Entry ─────────────────────────────────────────────────────────

export type NameEntryViewProps = {
  nameInput: string;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
};

export function NameEntryView({ nameInput, onNameChange, onSubmit }: NameEntryViewProps) {
  const trimmed = nameInput.trim();
  const disabled = trimmed.length === 0;
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>
      <p className={styles.subtitle}>Online Play</p>
      <form
        className={styles.nameForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit();
        }}
      >
        <label className={styles.label} htmlFor="displayName">
          Enter your display name
        </label>
        <input
          id="displayName"
          className={styles.nameInput}
          type="text"
          value={nameInput}
          maxLength={20}
          onChange={(e) => onNameChange(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={disabled} className={styles.startBtn}>
          Continue
        </button>
      </form>
    </div>
  );
}

// ── View: Home ───────────────────────────────────────────────────────────────

export type HomeViewProps = {
  joinMode: boolean;
  codeInput: string;
  onCodeChange: (value: string) => void;
  onHostGame: () => void;
  onShowJoin: () => void;
  onJoinSubmit: () => void;
  onCancelJoin: () => void;
};

export function HomeView({
  joinMode,
  codeInput,
  onCodeChange,
  onHostGame,
  onShowJoin,
  onJoinSubmit,
  onCancelJoin,
}: HomeViewProps) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>
      <p className={styles.subtitle}>Online Play</p>
      {!joinMode ? (
        <div className={styles.actionGroup}>
          <button className={styles.startBtn} onClick={onHostGame}>
            Host a Game
          </button>
          <button className={styles.onlineBtn} onClick={onShowJoin}>
            Join a Game
          </button>
        </div>
      ) : (
        <div className={styles.actionGroup}>
          <label className={styles.label} htmlFor="roomCode">
            Enter Room Code
          </label>
          <input
            id="roomCode"
            className={styles.codeInput}
            type="text"
            value={codeInput}
            maxLength={6}
            onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
            autoFocus
          />
          <button
            className={styles.startBtn}
            onClick={onJoinSubmit}
            disabled={codeInput.length < 6}
          >
            Join
          </button>
          <button className={styles.onlineBtn} onClick={onCancelJoin}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

// ── View: Connecting ─────────────────────────────────────────────────────────

export type ConnectingViewProps = {
  roomCode: string;
  connectionError: string | null;
  onBack: () => void;
};

export function ConnectingView({ roomCode, connectionError, onBack }: ConnectingViewProps) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>
      <div className={styles.roomInfo}>
        <span className={styles.label}>Room Code</span>
        <span className={styles.roomCode}>{roomCode}</span>
      </div>
      {connectionError ? (
        <p className={styles.errorMsg}>{connectionError}</p>
      ) : (
        <div className={styles.spinner} aria-label="Connecting…" />
      )}
      <button className={styles.onlineBtn} onClick={onBack}>
        Back
      </button>
    </div>
  );
}

// ── View: Lobby ──────────────────────────────────────────────────────────────

export type LobbyViewProps = {
  roomCode: string;
  shareUrl: string;
  seats: SeatInfo[];
  mySeat: Seat | null;
  isHost: boolean;
  connectionError: string | null;
  onClaimSeat: (seat: Seat) => void;
  onLeaveSeat: () => void;
  onStartGame: () => void;
  onBack: () => void;
};

export function LobbyView({
  roomCode,
  shareUrl,
  seats,
  mySeat,
  isHost,
  connectionError,
  onClaimSeat,
  onLeaveSeat,
  onStartGame,
  onBack,
}: LobbyViewProps) {
  const nsPair: Seat[] = ["N", "S"];
  const ewPair: Seat[] = ["E", "W"];

  function renderSeatCard(seat: Seat) {
    const info = seats.find((s) => s.seat === seat);
    const isOccupied = !!info?.playerId;
    const isMine = seat === mySeat;
    const isBot = info?.isBot ?? false;
    const isDisconnected = isOccupied && !info?.connected && !isBot;
    let displayName = info?.displayName ?? null;
    if (isBot) displayName = `${displayName ?? seat} (bot)`;
    else if (isDisconnected) displayName = `${displayName ?? seat} (disconnected)`;

    return (
      <div
        key={seat}
        className={`${styles.seatCard}${isMine ? ` ${styles.mySeat}` : ""}`}
      >
        <span className={styles.seatLabel}>{getLobbyLabel(seat)}</span>
        {isOccupied ? (
          <span className={styles.seatName}>{displayName}</span>
        ) : (
          <span className={styles.seatEmpty}>Empty</span>
        )}
        {!isOccupied && !isMine && (
          <button
            className={styles.seatBtn}
            onClick={() => onClaimSeat(seat)}
          >
            Sit Here
          </button>
        )}
        {isMine && (
          <button className={styles.seatBtn} onClick={onLeaveSeat}>
            Leave
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Squickr Rook</h1>

      <div className={styles.roomInfo}>
        <span className={styles.label}>Room Code</span>
        <span className={styles.roomCode}>{roomCode}</span>
        <span className={styles.shareUrl}>{shareUrl}</span>
      </div>

      <div className={styles.seatGrid}>
        <div className={styles.seatPair}>
          {nsPair.map(renderSeatCard)}
        </div>
        <div className={styles.seatDivider} />
        <div className={styles.seatPair}>
          {ewPair.map(renderSeatCard)}
        </div>
      </div>

      {connectionError && <p className={styles.errorMsg}>{connectionError}</p>}

      {isHost && (
        <button
          className={styles.startBtn}
          onClick={onStartGame}
          disabled={mySeat === null}
        >
          Start Game
        </button>
      )}

      <button className={styles.onlineBtn} onClick={onBack}>
        Back to Menu
      </button>
    </div>
  );
}

// ── Default Export: OnlineLobbyPage ──────────────────────────────────────────

export default function OnlineLobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  // Store subscriptions
  const lobbyPhase = useOnlineGameStore((s) => s.lobbyPhase);
  const connectionError = useOnlineGameStore((s) => s.connectionError);
  const seats = useOnlineGameStore((s) => s.seats);
  const hostId = useOnlineGameStore((s) => s.hostId);
  const mySeat = useOnlineGameStore((s) => s.mySeat);
  const myPlayerId = useOnlineGameStore((s) => s.myPlayerId);
  const connect = useOnlineGameStore((s) => s.connect);
  const disconnect = useOnlineGameStore((s) => s.disconnect);
  const claimSeat = useOnlineGameStore((s) => s.claimSeat);
  const leaveSeat = useOnlineGameStore((s) => s.leaveSeat);
  const startGame = useOnlineGameStore((s) => s.startGame);

  // Local state
  const [displayName, setDisplayName] = useState<string>(
    () => localStorage.getItem("rookDisplayName") ?? ""
  );
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [joinMode, setJoinMode] = useState(false);

  // Effect: connect when code + displayName both present
  useEffect(() => {
    if (!code || !displayName) return;
    connect(code);
  }, [code, displayName, connect]); // connect is a stable Zustand action reference

  // Effect: navigate to game when playing
  useEffect(() => {
    if (lobbyPhase === "playing" && code) {
      void navigate(`/online/${code}/game`, { replace: true });
    }
  }, [lobbyPhase, code, navigate]);

  // Handlers
  function handleNameSubmit() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    localStorage.setItem("rookDisplayName", trimmed);
    setDisplayName(trimmed);
  }

  function handleHostGame() {
    void navigate(`/online/${generateRoomCode()}`);
  }

  function handleJoinSubmit() {
    void navigate(`/online/${codeInput.trim()}`);
  }

  function handleBack() {
    disconnect();
    void navigate("/online");
  }

  const isHost = !!myPlayerId && myPlayerId === hostId;
  const shareUrl =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/online/${code}`
      : code
      ? `/online/${code}`
      : "";

  // Render views
  if (!displayName) {
    return (
      <NameEntryView
        nameInput={nameInput}
        onNameChange={setNameInput}
        onSubmit={handleNameSubmit}
      />
    );
  }

  if (!code) {
    return (
      <HomeView
        joinMode={joinMode}
        codeInput={codeInput}
        onCodeChange={setCodeInput}
        onHostGame={handleHostGame}
        onShowJoin={() => setJoinMode(true)}
        onJoinSubmit={handleJoinSubmit}
        onCancelJoin={() => setJoinMode(false)}
      />
    );
  }

  if (lobbyPhase === "connecting") {
    return (
      <ConnectingView
        roomCode={code}
        connectionError={connectionError}
        onBack={handleBack}
      />
    );
  }

  // lobbyPhase === "lobby" or connected
  return (
    <LobbyView
      roomCode={code}
      shareUrl={shareUrl}
      seats={seats}
      mySeat={mySeat}
      isHost={isHost}
      connectionError={connectionError}
      onClaimSeat={claimSeat}
      onLeaveSeat={leaveSeat}
      onStartGame={startGame}
      onBack={handleBack}
    />
  );
}
