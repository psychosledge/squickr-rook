# Online Multiplayer — Architecture Decision Record

**Status:** Approved — ready to implement  
**Date:** 2026-03-04  
**Note:** Delete this document once online multiplayer has shipped.

---

## Context

Squickr Rook is a single-player PWA (human vs. 3 bots). This document records the design decisions for adding online multiplayer — 1–4 humans sharing a room, with bots filling any empty seats.

**Constraints:**
- No matchmaking, ever. This is a party game — you share a link with friends.
- No long-term persistence. No accounts, stats, game history, or ELO.
- The static PWA (GitHub Pages) must remain deployable without a backend.

---

## Decisions

### Transport — PartyKit

PartyKit (Cloudflare Durable Objects / edge WebSockets) is the transport layer.

- Each game room is a named PartyKit room — a single-threaded, persistent WebSocket server on the Cloudflare edge
- The static PWA stays on GitHub Pages; only the room server runs on PartyKit
- `@rook/engine` is zero-dependency TypeScript and runs natively inside a Cloudflare Worker — the same engine code runs on both client and server
- PartyKit URL is injected as `VITE_PARTYKIT_HOST` env var (default: `localhost:1999` for local dev). Production default: `squickr-rook.*.partykit.dev`. Custom subdomain (`ws.rook.squickr.com`) can be added later as a one-line config change.

**Rejected alternatives:**
- WebRTC — overkill for turn-based; signalling server still needed; disconnect handling is complex
- Supabase Realtime — database-backed pub/sub, wrong abstraction for a stateful game server
- Liveblocks — CRDT/presence focused, designed for collaborative documents

---

### Authority model — Server-authoritative

The PartyKit room server is the sole authority. Clients send commands; the server validates and broadcasts events.

```
Client (any seat)             Server (RookRoom)
    │                              │
    │  GameCommand (JSON)  ──────► │  validateCommand(state, cmd)
    │                              │     → { ok: true, events }
    │  ◄────────── GameEvent[]     │  applyEvent(state, event)
    │                              │  broadcast filtered events to all 4 clients
    │  applyEvent (local mirror)   │
```

- `validateCommand` (already in the engine) is the server-side validation layer — no new validation logic needed
- Bots run inside the PartyKit room server (they need the full unmasked state)
- Clients never trust each other

**Rejected alternatives:**
- Peer-to-peer — trivially exploitable for a card game
- Host-as-server — game dies if the host disconnects

---

### State synchronisation — Event streaming with per-seat filtering

The server broadcasts `GameEvent[]` to clients, filtered per seat for private information.

**The private information problem:** `GameState` contains all 4 players' hands. The server must never send an opponent's hand to a client.

Two mechanisms handle this:

**`maskState(state, forSeat: Seat): GameState`** — used when sending a full state snapshot to a connecting/reconnecting client. Opponent hands are replaced with arrays of `"??"` placeholders (length preserved for card-count rendering). The nest is cleared; `originalNest` is only included for the bidder.

**`filterEvent(event, forSeat: Seat, bidder: Seat | null): GameEvent`** — used when broadcasting events. The only event requiring filtering is `NestTaken`: the bidder receives the full `nestCards` array; all other seats receive the event with `nestCards: []` (they know the nest was taken, not what was in it).

Both functions are pure, in `packages/engine/src/mask.ts`, and fully tested.

Client-side `GameState` is intentionally incomplete for opponent hands — this is correct. Components use `hand.length` for opponent card-count rendering; `"??"` entries are never decoded.

---

### Identity & rooms — Ephemeral, no auth

- `playerId`: `nanoid()` generated on first visit, stored in `localStorage`
- `displayName`: user-chosen (max 20 chars), stored in `localStorage`, asked once
- Room code: 6-character alphanumeric, generated client-side when hosting (e.g. `KQRJ47`)
- Share URL: `rook.squickr.com/online/KQRJ47`

No email, no password, no OAuth. Cross-device continuity works via `localStorage`. No cheating protection beyond server authority — acceptable for a party game.

---

### Settled design decisions

| Question | Decision |
|---|---|
| Seat assignment | Players pick their own seat in the lobby. Host claims first; joiners click any open seat. |
| Host disconnect in lobby | Auto-promote the next-joined player to host. |
| Bot difficulty | Fixed `"normal"` for all bot seats. Not configurable in v1. |
| PartyKit URL | Default `squickr-rook.*.partykit.dev` via `VITE_PARTYKIT_HOST`. Custom domain later. |
| NestTaken filtering | `filterEvent()` pure function in engine (not ad-hoc server logic). |
| Seed generation | Server generates seed (`Math.floor(Math.random() * 2**31)`) when `StartGame` command is received. Included in `GameStarted` event. |
| Reconnect | No rejoin. Disconnected seat is taken over by a bot for the remainder of the game. |
| Spectators | Out of scope. |
| Play Again | Returns to lobby for the same room code. Host can start another game immediately. |

---

## What gets built

7 new/modified artifacts. **Existing `gameStore`, `GamePage`, and all UI components are untouched.**

| # | File | Type | Notes |
|---|---|---|---|
| 1 | `packages/engine/src/mask.ts` | New | `maskState` + `filterEvent` — pure functions, tested first |
| 2 | `packages/server/src/room.ts` | New | PartyKit `RookRoom` class |
| 3 | `packages/server/package.json` | New | `@rook/server` package, depends on `@rook/engine` + `partykit` |
| 4 | `packages/server/partykit.json` | New | PartyKit config |
| 5 | `apps/web/src/store/onlineGameStore.ts` | New | Zustand store wrapping WebSocket |
| 6 | `apps/web/src/pages/OnlineLobbyPage.tsx` | New | Name entry → create/join → waiting room |
| 7 | `apps/web/src/pages/OnlineGamePage.tsx` | New | Same components as GamePage, reads from `onlineGameStore` |
| 8 | `apps/web/src/App.tsx` | Modified | Add 3 routes |
| 9 | `apps/web/src/pages/LobbyPage.tsx` | Modified | Add "Play Online" button |

**Build order:** 1 → 2–4 (parallel) → 5 → 6–7 (parallel) → 8–9 (parallel)

---

## UX flow

```
Home screen
  └─ "Play Online"
       └─ /online
            ├─ [first visit] Enter display name → stored in localStorage
            │
            ├─ "Host a Game"
            │    └─ Generate room code (e.g. KQRJ47)
            │    └─ Connect to PartyKit room
            │    └─ URL → /online/KQRJ47  (shareable)
            │    └─ Lobby: 4 seats, host claims one, others show "Waiting…"
            │    └─ "Start Game" button (enabled immediately — bots fill empty seats)
            │         └─ Server broadcasts GameStarted
            │         └─ All clients → /online/KQRJ47/game
            │
            └─ "Join a Game" (or open shared URL directly)
                 └─ Enter room code (or auto-filled from URL)
                 └─ Connect to PartyKit room
                 └─ Lobby: claim an open seat
                 └─ Wait for host to start
                      └─ GameStarted received → /online/KQRJ47/game

Game
  └─ Plays identically to single-player
  └─ Seat labels show player display names
  └─ Disconnected seat: player name + "(bot)" indicator, bot plays silently

Game Over
  └─ "Play Again" → back to lobby for same room code
```

---

## Routes added to App.tsx

```tsx
<Route path="/online"              element={<OnlineLobbyPage />} />
<Route path="/online/:code"        element={<OnlineLobbyPage />} />
<Route path="/online/:code/game"   element={<OnlineGamePage />} />
```

---

## Key architectural properties

| Property | How |
|---|---|
| No cheating | Server-authoritative; `validateCommand` on server only |
| No hand leaking | `maskState` + `filterEvent` in engine, tested |
| Single-player untouched | Parallel store + page; zero changes to `gameStore` or `GamePage` |
| Bots in multiplayer | Run server-side with full unmasked state |
| Isomorphic engine | Zero-dep TS runs in browser and Cloudflare Workers |
| Testable server | `validateCommand` is pure; room logic is thin |
| No infra ops | PartyKit handles scaling, persistence, edge routing |
