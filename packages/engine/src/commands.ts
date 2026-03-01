import type { CardId, Color, Seat } from "./types.js";

export type TakeNest = {
  type: "TakeNest";
  seat: Seat;
};

export type DiscardCard = {
  type: "DiscardCard";
  seat: Seat;
  cardId: CardId;
};

export type SelectTrump = {
  type: "SelectTrump";
  seat: Seat;
  color: Color;
};

export type PlayCard = {
  type: "PlayCard";
  seat: Seat;
  cardId: CardId;
};

export type GameCommand =
  | TakeNest
  | DiscardCard
  | SelectTrump
  | PlayCard;
