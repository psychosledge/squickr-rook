import type { GameState, GameEvent, CardId, Color, BotDifficulty, HandScore } from "@rook/engine";

export type OverlayKind = "none" | "nest" | "trump" | "hand-result" | "game-over";

export type AppState = {
  gameState: GameState | null;
  eventLog: GameEvent[];
  overlay: OverlayKind;
  pendingDiscards: CardId[];
  pendingHandScore: HandScore | null;
  botTimeoutId: ReturnType<typeof setTimeout> | null;
  botDifficulty: BotDifficulty;
  announcement: string | null;
};

export type AppActions = {
  startGame: (difficulty: BotDifficulty) => void;
  resetGame: () => void;
  humanPlayCard: (cardId: CardId) => void;
  toggleDiscard: (cardId: CardId) => void;
  confirmDiscards: () => void;
  humanSelectTrump: (color: Color) => void;
  acknowledgeHandResult: () => void;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  clearAnnouncement: () => void;
  _applyEvents: (events: GameEvent[]) => void;
  _scheduleNextTurn: () => void;
  _dispatchBotTurn: () => void;
};

export type AppStore = AppState & AppActions;
