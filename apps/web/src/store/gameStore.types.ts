import type { GameState, GameEvent, CardId, Color, BotDifficulty, HandScore, Seat } from "@rook/engine";
import type { BotDecisionAnnotation } from "../devLog";

export type OverlayKind = "none" | "bidding" | "nest" | "trump" | "hand-result" | "game-over";

export type AppState = {
  gameState: GameState | null;
  eventLog: GameEvent[];
  overlay: OverlayKind;
  pendingDiscards: CardId[];
  pendingHandScore: HandScore | null;
  botTimeoutId: ReturnType<typeof setTimeout> | null;
  botDifficulties: Record<"E" | "S" | "W", BotDifficulty>;
  announcement: string | null;
  gameOverReason: "threshold-reached" | "bust" | "moon-set" | "moon-made" | null;
  historyModalOpen: boolean;
  biddingThinkingSeat: Seat | null;
  _devOnBotDecision: ((annotation: BotDecisionAnnotation) => void) | undefined;
  _devOnHandComplete: ((gameState: GameState) => void) | undefined;
  _devOnHandStart: ((timestamp: number) => void) | undefined;
};

export type AppActions = {
  startGame: (difficulties: Record<"E" | "S" | "W", BotDifficulty>) => void;
  resetGame: () => void;
  humanPlayCard: (cardId: CardId) => void;
  humanPlaceBid: (amount: number) => void;
  humanPassBid: () => void;
  humanShootMoon: () => void;
  toggleDiscard: (cardId: CardId) => void;
  confirmDiscards: () => void;
  humanSelectTrump: (color: Color) => void;
  acknowledgeHandResult: () => void;
  setAllBotDifficulty: (difficulty: BotDifficulty) => void;
  setBotDifficultySeat: (seat: "E" | "S" | "W", difficulty: BotDifficulty) => void;
  clearAnnouncement: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  _applyEvents: (events: GameEvent[]) => void;
  _scheduleNextTurn: () => void;
  _dispatchBotTurn: () => void;
  _setLoggerCallbacks: (callbacks: {
    onBotDecision: (annotation: BotDecisionAnnotation) => void;
    onHandComplete: (gameState: GameState) => void;
    onHandStart: (timestamp: number) => void;
  }) => void;
};

export type AppStore = AppState & AppActions;
