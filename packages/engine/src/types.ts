export type Color = "Black" | "Red" | "Green" | "Yellow";
export type CardId = string;
export type CardValue = 1 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type Card =
  | { kind: "regular"; id: CardId; color: Color; value: CardValue }
  | { kind: "rook"; id: "ROOK" };

export type RookCard = Extract<Card, { kind: "rook" }>;

export type Seat = "N" | "E" | "S" | "W";
export type Team = "NS" | "EW";

export const SEAT_TEAM: Record<Seat, Team> = { N: "NS", S: "NS", E: "EW", W: "EW" };
export const SEAT_ORDER: Seat[] = ["N", "E", "S", "W"];

export function nextSeat(seat: Seat): Seat {
  const i = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(i + 1) % 4] as Seat;
}

export function leftOf(seat: Seat): Seat {
  return nextSeat(seat);
}

export type GamePhase = "dealing" | "bidding" | "nest" | "trump" | "playing" | "scoring" | "finished";

export type GameRules = {
  version: 1;
  winThreshold: number;
  bustThreshold: number;
  autoBidAmount: number;
  botDelayMs: number;
  nestAssignment: "left-of-dealer";
  minimumBid: number;
  bidIncrement: number;
  maximumBid: number;
};

export const DEFAULT_RULES: GameRules = {
  version: 1,
  winThreshold: 500,
  bustThreshold: -500,
  autoBidAmount: 100,
  botDelayMs: 1000,
  nestAssignment: "left-of-dealer",
  minimumBid: 100,
  bidIncrement: 5,
  maximumBid: 200,
};

export type PlayedCard = { seat: Seat; cardId: CardId };

export type CompletedTrick = {
  plays: PlayedCard[];
  winner: Seat;
  leadColor: Color | null;
};

export type HandScore = {
  hand: number;
  bidder: Seat;
  bidAmount: number;
  nestCards: CardId[];
  discarded: CardId[];
  nsPointCards: number;
  ewPointCards: number;
  nsMostCardsBonus: number;
  ewMostCardsBonus: number;
  nsNestBonus: number;
  ewNestBonus: number;
  nsWonLastTrick: boolean;
  ewWonLastTrick: boolean;
  nsTotal: number;
  ewTotal: number;
  nsDelta: number;
  ewDelta: number;
  shotMoon: boolean;
};

export type PlayerKind = "human" | "bot";

export type PlayerInfo = {
  seat: Seat;
  name: string;
  kind: PlayerKind;
  botProfile?: BotProfile;
};

export type BotDifficulty = "easy" | "normal" | "hard";

export type BotProfile = {
  difficulty: BotDifficulty;
  playAccuracy: number;
  trackPlayedCards: boolean;
  sluffStrategy: boolean;
};

export const BOT_PRESETS: Record<BotDifficulty, BotProfile> = {
  easy:   { difficulty: "easy",   playAccuracy: 0.3, trackPlayedCards: false, sluffStrategy: false },
  normal: { difficulty: "normal", playAccuracy: 0.6, trackPlayedCards: true,  sluffStrategy: false },
  hard:   { difficulty: "hard",   playAccuracy: 1.0, trackPlayedCards: true,  sluffStrategy: true  },
};

export type GameState = {
  version: number;
  phase: GamePhase;
  rules: GameRules;
  players: PlayerInfo[];
  handNumber: number;
  dealer: Seat;
  seed: number;
  activePlayer: Seat | null;
  hands: Record<Seat, CardId[]>;
  nest: CardId[];
  originalNest: CardId[];
  discarded: CardId[];
  trump: Color | null;
  currentTrick: PlayedCard[];
  tricksPlayed: number;
  completedTricks: CompletedTrick[];
  capturedCards: Record<Team, CardId[]>;
  scores: Record<Team, number>;
  handHistory: HandScore[];
  winner: Team | null;
  playedCards: CardId[];
  // Bidding phase fields
  bids: Record<Seat, number | "pass" | null>;
  moonShooters: Seat[];
  currentBid: number;
  bidder: Seat | null;
  bidAmount: number;
  shotMoon: boolean;
};
