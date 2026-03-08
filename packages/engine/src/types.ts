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
  moonShooterWentSet: boolean;
};

export type PlayerKind = "human" | "bot";

export type PlayerInfo = {
  seat: Seat;
  name: string;
  kind: PlayerKind;
  botProfile?: BotProfile;
};

/** 1=Beginner, 2=Easy, 3=Normal, 4=Hard, 5=Expert */
export type BotDifficulty = 1 | 2 | 3 | 4 | 5;

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  1: "Beginner",
  2: "Easy",
  3: "Normal",
  4: "Hard",
  5: "Expert",
};

export const ALL_BOT_DIFFICULTIES: BotDifficulty[] = [1, 2, 3, 4, 5];

export type BotProfile = {
  difficulty: BotDifficulty;

  // Bidding parameters
  /** 0.0 = completely random noise; 1.0 = perfect hand value computation */
  handValuationAccuracy: number;
  /** Multiplier on computed bid ceiling. 1.0 = exact ceiling */
  bidAggressiveness: number;
  /** 0.0 = fold at ceiling; 1.0 = push up to 30 pts above ceiling */
  bluffResistance: number;
  /** Whether bot adjusts bid ceiling based on current scores */
  scoreContextAwareness: boolean;
  /** Whether bot attempts moon shoots (levels 3–5) */
  canShootMoon: boolean;
  /** Minimum hand strength to consider moon shooting */
  moonShootThreshold: number;
  /** Expert only: lowers moon threshold when opponents near win threshold */
  contextualMoonShoot: boolean;

  // Discard parameters
  /** 0.0 = no void strategy; 0.5 = target one void; 0.8+ = target two voids */
  voidExploitation: number;

  // Card-play parameters
  /** Probability of playing optimally; otherwise plays random legal card */
  playAccuracy: number;
  /** Whether bot tracks which cards have been played */
  trackPlayedCards: boolean;
  /** 0.0 = random trump; 0.5 = basic; 0.7 = intermediate; 1.0 = expert */
  trumpManagement: number;
  /** Whether bot dumps point cards onto partner's winning tricks */
  sluffStrategy: boolean;
  /** 0.0 = no endgame awareness; 0.5+ = adjusts play when tricksPlayed >= 7 */
  endgameCardAwareness: number;
  /** Whether bot adjusts strategy based on bidding vs defending role */
  roleAwareness: boolean;
};

export const BOT_PRESETS: Record<BotDifficulty, BotProfile> = {
  1: {
    difficulty: 1,
    handValuationAccuracy: 0.0,
    bidAggressiveness:     0.7,
    bluffResistance:       0.0,
    scoreContextAwareness: false,
    canShootMoon:          false,
    moonShootThreshold:    999,
    contextualMoonShoot:   false,
    voidExploitation:      0.0,
    playAccuracy:          0.15,
    trackPlayedCards:      false,
    trumpManagement:       0.0,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         false,
  },
  2: {
    difficulty: 2,
    handValuationAccuracy: 0.4,
    bidAggressiveness:     0.85,
    bluffResistance:       0.1,
    scoreContextAwareness: false,
    canShootMoon:          false,
    moonShootThreshold:    999,
    contextualMoonShoot:   false,
    voidExploitation:      0.0,
    playAccuracy:          0.45,
    trackPlayedCards:      false,
    trumpManagement:       0.2,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         false,
  },
  3: {
    difficulty: 3,
    handValuationAccuracy: 0.75,
    bidAggressiveness:     1.0,
    bluffResistance:       0.3,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    110,
    contextualMoonShoot:   false,
    voidExploitation:      0.5,
    playAccuracy:          0.70,
    trackPlayedCards:      true,
    trumpManagement:       0.5,
    sluffStrategy:         false,
    endgameCardAwareness:  0.0,
    roleAwareness:         true,
  },
  4: {
    difficulty: 4,
    handValuationAccuracy: 0.90,
    bidAggressiveness:     1.1,
    bluffResistance:       0.6,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    90,
    contextualMoonShoot:   false,
    voidExploitation:      0.8,
    playAccuracy:          0.90,
    trackPlayedCards:      true,
    trumpManagement:       0.7,
    sluffStrategy:         true,
    endgameCardAwareness:  0.5,
    roleAwareness:         true,
  },
  5: {
    difficulty: 5,
    handValuationAccuracy: 1.0,
    bidAggressiveness:     1.15,
    bluffResistance:       1.0,
    scoreContextAwareness: true,
    canShootMoon:          true,
    moonShootThreshold:    75,
    contextualMoonShoot:   true,
    voidExploitation:      1.0,
    playAccuracy:          1.0,
    trackPlayedCards:      true,
    trumpManagement:       1.0,
    sluffStrategy:         true,
    endgameCardAwareness:  1.0,
    roleAwareness:         true,
  },
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
