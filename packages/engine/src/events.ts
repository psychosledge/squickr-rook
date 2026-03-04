import type { BotProfile, CardId, Color, GameRules, HandScore, Seat, Team } from "./types.js";

export type GameStarted = {
  type: "GameStarted";
  seed: number;
  dealer: Seat;
  players: Array<{ seat: Seat; name: string; kind: "human" | "bot"; botProfile?: BotProfile }>;
  rules: GameRules;
  timestamp: number;
};

export type HandStarted = {
  type: "HandStarted";
  handNumber: number;
  dealer: Seat;
  timestamp: number;
};

export type BidPlaced = {
  type: "BidPlaced";
  seat: Seat;
  amount: number;
  handNumber: number;
  timestamp: number;
};

export type BidPassed = {
  type: "BidPassed";
  seat: Seat;
  handNumber: number;
  timestamp: number;
};

export type MoonDeclared = {
  type: "MoonDeclared";
  seat: Seat;
  amount: number;
  handNumber: number;
  timestamp: number;
};

export type BiddingComplete = {
  type: "BiddingComplete";
  winner: Seat;
  amount: number;
  forced: boolean;
  shotMoon: boolean;
  handNumber: number;
  timestamp: number;
};

export type NestTaken = {
  type: "NestTaken";
  seat: Seat;
  nestCards: CardId[];
  handNumber: number;
  timestamp: number;
};

export type CardDiscarded = {
  type: "CardDiscarded";
  seat: Seat;
  cardId: CardId;
  handNumber: number;
  timestamp: number;
};

export type TrumpSelected = {
  type: "TrumpSelected";
  seat: Seat;
  color: Color;
  handNumber: number;
  timestamp: number;
};

export type CardPlayed = {
  type: "CardPlayed";
  seat: Seat;
  cardId: CardId;
  trickIndex: number;
  handNumber: number;
  timestamp: number;
};

export type TrickCompleted = {
  type: "TrickCompleted";
  plays: Array<{ seat: Seat; cardId: CardId }>;
  winner: Seat;
  leadColor: Color | null;
  trickIndex: number;
  handNumber: number;
  timestamp: number;
};

export type HandScored = {
  type: "HandScored";
  score: HandScore;
  handNumber: number;
  timestamp: number;
};

export type GameFinished = {
  type: "GameFinished";
  winner: Team;
  reason: "threshold-reached" | "bust";
  finalScores: Record<Team, number>;
  timestamp: number;
};

export type GameEvent =
  | GameStarted
  | HandStarted
  | BidPlaced
  | BidPassed
  | MoonDeclared
  | BiddingComplete
  | NestTaken
  | CardDiscarded
  | TrumpSelected
  | CardPlayed
  | TrickCompleted
  | HandScored
  | GameFinished;
