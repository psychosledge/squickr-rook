import { deriveDeal } from "./deal.js";
import type { GameEvent } from "./events.js";
import type { GameState, Team } from "./types.js";
import {
  DEFAULT_RULES,
  SEAT_TEAM,
  leftOf,
  nextSeat,
} from "./types.js";

export const INITIAL_STATE: GameState = {
  version: 0,
  phase: "dealing",
  rules: DEFAULT_RULES,
  players: [],
  handNumber: 0,
  dealer: "N",
  seed: 0,
  activePlayer: null,
  hands: { N: [], E: [], S: [], W: [] },
  nest: [],
  originalNest: [],
  discarded: [],
  trump: null,
  currentTrick: [],
  tricksPlayed: 0,
  completedTricks: [],
  capturedCards: { NS: [], EW: [] },
  scores: { NS: 0, EW: 0 },
  handHistory: [],
  winner: null,
  playedCards: [],
};

export function applyEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "GameStarted": {
      const deal = deriveDeal(event.seed, 0);
      const nestPlayer = leftOf(event.dealer);
      return {
        ...state,
        version: state.version + 1,
        phase: "nest",
        rules: event.rules,
        players: event.players,
        dealer: event.dealer,
        seed: event.seed,
        handNumber: 0,
        activePlayer: nestPlayer,
        hands: deal.hands,
        nest: deal.nest,
        originalNest: [],
        discarded: [],
        trump: null,
        currentTrick: [],
        tricksPlayed: 0,
        completedTricks: [],
        capturedCards: { NS: [], EW: [] },
        scores: { NS: 0, EW: 0 },
        handHistory: [],
        winner: null,
        playedCards: [],
      };
    }

    case "HandStarted": {
      const deal = deriveDeal(state.seed, event.handNumber);
      const nestPlayer = leftOf(event.dealer);
      return {
        ...state,
        version: state.version + 1,
        phase: "nest",
        dealer: event.dealer,
        handNumber: event.handNumber,
        activePlayer: nestPlayer,
        hands: deal.hands,
        nest: deal.nest,
        originalNest: [],
        discarded: [],
        trump: null,
        currentTrick: [],
        tricksPlayed: 0,
        completedTricks: [],
        capturedCards: { NS: [], EW: [] },
        playedCards: [],
      };
    }

    case "NestTaken": {
      const { seat, nestCards } = event;
      const newHand = [...(state.hands[seat] ?? []), ...nestCards];
      return {
        ...state,
        version: state.version + 1,
        hands: { ...state.hands, [seat]: newHand },
        nest: [],
        originalNest: nestCards,
        // phase stays "nest" — waiting for discards
      };
    }

    case "CardDiscarded": {
      const { seat, cardId } = event;
      const currentHand = state.hands[seat] ?? [];
      const newHand = currentHand.filter((c) => c !== cardId);
      const newDiscarded = [...state.discarded, cardId];
      const newPhase = newDiscarded.length === 5 ? "trump" : state.phase;
      return {
        ...state,
        version: state.version + 1,
        hands: { ...state.hands, [seat]: newHand },
        discarded: newDiscarded,
        phase: newPhase,
      };
    }

    case "TrumpSelected": {
      return {
        ...state,
        version: state.version + 1,
        trump: event.color,
        phase: "playing",
        activePlayer: leftOf(leftOf(state.dealer)),
      };
    }

    case "CardPlayed": {
      const { seat, cardId } = event;
      const currentHand = state.hands[seat] ?? [];
      const newHand = currentHand.filter((c) => c !== cardId);
      const newCurrentTrick = [...state.currentTrick, { seat, cardId }];
      const newPlayedCards = [...state.playedCards, cardId];
      const nextActive = nextSeat(seat);
      return {
        ...state,
        version: state.version + 1,
        hands: { ...state.hands, [seat]: newHand },
        currentTrick: newCurrentTrick,
        playedCards: newPlayedCards,
        activePlayer: nextActive,
      };
    }

    case "TrickCompleted": {
      const { winner, plays, leadColor } = event;
      const winnerTeam: Team = SEAT_TEAM[winner];
      const newCaptured = {
        ...state.capturedCards,
        [winnerTeam]: [
          ...(state.capturedCards[winnerTeam] ?? []),
          ...plays.map((p) => p.cardId),
        ],
      };
      const newTricksPlayed = state.tricksPlayed + 1;
      const newPhase = newTricksPlayed === 10 ? "scoring" : state.phase;
      return {
        ...state,
        version: state.version + 1,
        completedTricks: [
          ...state.completedTricks,
          { plays, winner, leadColor },
        ],
        capturedCards: newCaptured,
        currentTrick: [],
        activePlayer: winner,
        tricksPlayed: newTricksPlayed,
        phase: newPhase,
      };
    }

    case "HandScored": {
      const { score } = event;
      return {
        ...state,
        version: state.version + 1,
        scores: {
          NS: state.scores.NS + score.nsDelta,
          EW: state.scores.EW + score.ewDelta,
        },
        handHistory: [...state.handHistory, score],
      };
    }

    case "GameFinished": {
      return {
        ...state,
        version: state.version + 1,
        phase: "finished",
        winner: event.winner,
      };
    }

    default: {
      // exhaustive check
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
}

export function reduceEvents(events: GameEvent[]): GameState {
  return events.reduce(applyEvent, INITIAL_STATE);
}
