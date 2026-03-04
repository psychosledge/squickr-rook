import type { CardId, Color, Seat } from "./types.js";

export type PlaceBid = {
  type: "PlaceBid";
  seat: Seat;
  amount: number;
};

export type PassBid = {
  type: "PassBid";
  seat: Seat;
};

export type ShootMoon = {
  type: "ShootMoon";
  seat: Seat;
};

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
  | PlaceBid
  | PassBid
  | ShootMoon
  | TakeNest
  | DiscardCard
  | SelectTrump
  | PlayCard;
