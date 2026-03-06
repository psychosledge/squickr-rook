import type { GameState, GameEvent, CardId, Color, HandScore, Seat, GameCommand } from "@rook/engine";
import type { OverlayKind } from "./gameStore.types";

export type SeatInfo = {
  seat: Seat;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  isBot: boolean;
};

export type WelcomeMsg = {
  type: "Welcome";
  roomCode: string;
  hostId: string | null;
  seats: SeatInfo[];
  phase: "lobby" | "playing";
  state?: GameState;
};

export type LobbyUpdatedMsg = {
  type: "LobbyUpdated";
  seats: SeatInfo[];
  hostId: string | null;
};

export type EventBatchMsg = {
  type: "EventBatch";
  events: GameEvent[];
};

export type CommandErrorMsg = {
  type: "CommandError";
  reason: string;
};

export type PlayerDisconnectedMsg = {
  type: "PlayerDisconnected";
  seat: Seat;
  displayName: string;
};

export type PlayerReconnectedMsg = {
  type: "PlayerReconnected";
  seat: Seat;
  displayName: string;
};

export type ServerMessage = WelcomeMsg | LobbyUpdatedMsg | EventBatchMsg | CommandErrorMsg | PlayerDisconnectedMsg | PlayerReconnectedMsg;

export type ClientJoinRoom    = { type: "JoinRoom"; playerId: string; displayName: string; seat: Seat | null };
export type ClientClaimSeat   = { type: "ClaimSeat"; seat: Seat };
export type ClientLeaveSeat   = { type: "LeaveSeat" };
export type ClientStartGame   = { type: "StartGame" };
export type ClientSendCommand = { type: "SendCommand"; command: GameCommand };
export type ClientUpdateName  = { type: "UpdateName"; displayName: string };
export type ClientReplaceWithBot = { type: "ReplaceWithBot"; seat: Seat };
export type ClientMessage = ClientJoinRoom | ClientClaimSeat | ClientLeaveSeat | ClientStartGame | ClientSendCommand | ClientUpdateName | ClientReplaceWithBot;

export type OnlineStoreState = {
  myPlayerId: string;
  myDisplayName: string;
  roomCode: string | null;
  lobbyPhase: "idle" | "connecting" | "lobby" | "playing";
  connectionError: string | null;
  seats: SeatInfo[];
  hostId: string | null;
  mySeat: Seat | null;
  gameState: GameState | null;
  overlay: OverlayKind;
  pendingDiscards: CardId[];
  pendingHandScore: HandScore | null;
  announcement: string | null;
  gameOverReason: "threshold-reached" | "bust" | "moon-set" | "moon-made" | null;
  historyModalOpen: boolean;
  biddingThinkingSeat: Seat | null;
  disconnectedAlert: { seat: Seat; displayName: string } | null;
  gamePaused: boolean;
  isReconnecting: boolean;
  _socket: WebSocket | null;
  _pendingBatch: GameEvent[];
  _deferredEventQueue: GameEvent[][] | null;
};

export type OnlineStoreActions = {
  connect: (roomCode: string) => void;
  disconnect: () => void;
  claimSeat: (seat: Seat) => void;
  leaveSeat: () => void;
  startGame: () => void;
  updateDisplayName: (name: string) => void;
  humanPlayCard: (cardId: CardId) => void;
  humanPlaceBid: (amount: number) => void;
  humanPassBid: () => void;
  humanShootMoon: () => void;
  toggleDiscard: (cardId: CardId) => void;
  confirmDiscards: () => void;
  humanSelectTrump: (color: Color) => void;
  acknowledgeHandResult: () => void;
  clearAnnouncement: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  replaceWithBot: (seat: Seat) => void;
  dismissDisconnectAlert: () => void;
  _handleMessage: (msg: ServerMessage) => void;
  _applyIncomingEvents: (events: GameEvent[]) => void;
  _updateOverlayAfterBatch: () => void;
  _sendRaw: (msg: ClientMessage) => void;
  _sendCommand: (command: GameCommand) => void;
};

export type OnlineStore = OnlineStoreState & OnlineStoreActions;
