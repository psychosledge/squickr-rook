import type { GameState, GameEvent, CardId, Color, BotDifficulty, HandScore, Seat } from "@rook/engine";

export type OverlayKind = "none" | "bidding" | "nest" | "trump" | "hand-result" | "game-over";

export type AppState = {
  gameState: GameState | null;
  eventLog: GameEvent[];
  overlay: OverlayKind;
  pendingDiscards: CardId[];
  pendingHandScore: HandScore | null;
  botTimeoutId: ReturnType<typeof setTimeout> | null;
  botDifficulty: BotDifficulty;
  announcement: string | null;
  gameOverReason: "threshold-reached" | "bust" | "moon-set" | "moon-made" | null;
  historyModalOpen: boolean;
  biddingThinkingSeat: Seat | null;
};

export type AppActions = {
  startGame: (difficulty: BotDifficulty) => void;
  resetGame: () => void;
  humanPlayCard: (cardId: CardId) => void;
  humanPlaceBid: (amount: number) => void;
  humanPassBid: () => void;
  humanShootMoon: () => void;
  toggleDiscard: (cardId: CardId) => void;
  confirmDiscards: () => void;
  humanSelectTrump: (color: Color) => void;
  acknowledgeHandResult: () => void;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  clearAnnouncement: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  _applyEvents: (events: GameEvent[]) => void;
  _scheduleNextTurn: () => void;
  _dispatchBotTurn: () => void;
};

export type AppStore = AppState & AppActions;
