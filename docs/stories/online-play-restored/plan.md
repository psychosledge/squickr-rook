# Online Play Restored: Plan
Tier: core

## Slice Plan

### Slice 1: Room server runs on PartyServer locally
**Scope:** The room server moves off the `partykit` package onto PartyServer, packaged as a Cloudflare Worker with a Durable Object per room, and runs locally. The web app in dev mode connects to the local server and a full online game works end to end on one machine. Room protocol messages, lobby rules, reconnect, and bot replacement behave exactly as before. No production deploy, no production host change, no deployment-guide rewrite.
**Status:** not started
**Commit:** —
**Acceptance Criteria:**
- [ ] `pnpm server:dev` starts the room server locally on the Cloudflare Workers runtime.
- [ ] `pnpm dev` with no host configured connects to the local room server: one browser creates a room, a second browser opens the room link and joins, both see each other and claim seats.
- [ ] Locally, the host fills empty seats with bots, sets their difficulty, starts the game, and the table plays from bidding through game over with both browsers showing the same table.
- [ ] Locally, refreshing one browser mid-game returns that player to their seat and the game continues.
- [ ] Locally, closing one browser mid-game lets the host replace that seat with a bot and the game continues.
- [ ] Every scenario in `packages/server/src/room.test.ts` runs against the ported server and passes, with no scenario removed or weakened.
- [ ] The `partykit` dependency and `packages/server/partykit.json` are gone; the server package typechecks.
- [ ] The web app builds its room connection URL to match the new server's route, using `ws` for a local host and `wss` otherwise (existing: apps/web/src/store/onlineGameStore.ts), and the online store tests cover the URL it builds.
- [ ] A request to the Worker outside the room route gets a `404`.
- [ ] Offline play is unchanged: the web test suite passes and `pnpm -r test` passes.
**Files:** packages/server/src/room.ts, packages/server/src/room.test.ts, packages/server/src/ (Worker entry), packages/server/package.json, packages/server/wrangler config, packages/server/partykit.json (removed), packages/server/tsconfig.json, packages/server/vitest.config.ts, package.json, pnpm-lock.yaml, apps/web/src/store/onlineGameStore.ts, apps/web/src/store/__tests__/onlineGameStore.test.ts, apps/web/src/vite-env.d.ts
**Needs Architect:** yes. New hosting pattern (Worker entry plus Durable Object binding). Where room routing lives has a real alternative: the client adopts PartyServer's route path, or the Worker maps the existing `/party/<code>` path; each choice changes a different package. The test harness for the ported tests is also open (mocked connections as today, or the Workers runtime).
**Architect decides:** the room route and, if the client adopts PartyServer's route, the Durable Object class and party names; the test harness; the wrangler config format (`wrangler.toml` or `wrangler.jsonc`) and Worker name, which Slice 2 deploys under; the Worker entry file and export shape, and whether `room.ts` becomes the Durable Object class; whether hibernation is on. With hibernation on, the room's state must be persisted to Durable Object storage so it survives between messages; with it off, in-memory state is acceptable. `room.ts` relies on `conn.id`, per-connection state (`setState`/`state`), and `room.getConnections()`, and the port keeps all three working.
**Settled:**
- Script names stay. Root `server:dev` and `server:ship` delegate to `packages/server`'s `dev` and `ship` scripts, which switch to wrangler. `typecheck` stays `tsc --noEmit` in `packages/server`, with Workers types added. (repo)
- The web client opens a raw `WebSocket` (`onlineGameStore.ts:128`) and never used `partysocket`. Only the URL changes. (repo)
- The env var keeps the name `VITE_PARTYKIT_HOST`. `vite-env.d.ts` changes only if the architect renames it. (planner's call)
- The local server listens on port 1999, set in the wrangler dev config, so the web default `localhost:1999` stays unchanged. (planner's call)
- The `ws`/`wss` rule stays as today: `ws` when the host starts with `localhost`, `wss` otherwise. (planner's call)
- "Not weakened" means mock setup may change to fit PartyServer's types, while every assertion on messages sent, seat state, and host state stays. (planner's call)
- The local browser checks (criteria 2 to 5) are manual. The human runs them at the slice approval gate, and the verifier records the outcome. (planner's call)

### Slice 2: Production room server live and the web app pointed at it
**Scope:** The ported server is deployed to the existing Cloudflare account (free Workers plan, SQLite-backed Durable Objects) on its `*.workers.dev` hostname, production web builds point at it, and the release process and deployment guide describe the new setup. The web app reaches players on rook.squickr.com through the normal `/ship` release after code review.
**Status:** not started
**Commit:** —
**Acceptance Criteria:**
- [ ] `pnpm server:ship` deploys the room server from a local machine after `wrangler login` to its `*.workers.dev` hostname.
- [ ] A WebSocket connection to the deployed server for a new room code, sending `JoinRoom`, receives a `Welcome` message.
- [ ] `VITE_PARTYKIT_HOST` in `apps/web/.env.production` names the new hostname, and a production `pnpm build` embeds it with no reference to `partykit.dev` left in `apps/web/dist`.
- [ ] `.claude/commands/ship.md` Step 7 deploys the Cloudflare room server and names it accurately.
- [ ] `docs/deployment-guide.md` describes the Cloudflare one-time setup, local server dev, server deploy, and server monitoring, and has no remaining instructions for hosted PartyKit.
- [ ] No Cloudflare credential or API token is committed to the repo.
- [ ] `pnpm -r test` passes.
**Files:** packages/server/wrangler config, packages/server/package.json, apps/web/.env.production, .claude/commands/ship.md, docs/deployment-guide.md
**Needs Architect:** no. No new code pattern.
**Settled:**
- Step 7 keeps its shape: diff `packages/server/` and `packages/engine/src/`, ask, bump the server version, then run `pnpm server:ship`. The wording changes from the PartyKit server to the Cloudflare room server. (repo)
- The Cloudflare account ID stays out of the repo. `wrangler login` supplies it. (planner's call)
- The `Welcome` smoke check is a one-off manual check (`wscat` or a short node snippet), recorded in the slice notes and not committed. It sends a `JoinRoom` built from the protocol types in `room.ts`. (planner's call)
- Hostname is `*.workers.dev`. squickr.com DNS is on GoDaddy, and a Worker custom domain requires the zone on Cloudflare. (human)
- Deploys run locally. No CI deploy workflow or GitHub secret. (human)
- "Server monitoring" in the deployment guide means `wrangler tail` and the Worker's logs and metrics in the Cloudflare dashboard. It adds no alerting. (planner's call)

## Review Focus

- A server redeploy or Durable Object eviction during a live game discards that room's in-memory state, as it did on PartyKit: accepted: redeploys are scheduled when no one is playing (hibernation state loss covered: Slice 1)
- An installed PWA still running the pre-release bundle keeps connecting to the dead `partykit.dev` host until the player accepts the update prompt: accepted: clears on the first accepted update
- Requests to the Worker outside the room route get no defined response: covered: Slice 1
- Cloudflare free-plan request or Durable Object quotas run out and new rooms fail to connect: accepted: free plan fails without charging, usage is visible in the dashboard
- A Cloudflare deploy credential leaks through the repo: covered: Slice 2
- CI (`.github/workflows/ci.yml`) runs neither the server tests nor the server typecheck, so a broken room server ships behind a green check: out of scope: pre-existing (known issue) (new entry: docs/backlog.md #13)

## Walkthrough Checklist
(Complete after all slices are committed and `/ship` has deployed the web app)

- [ ] On rook.squickr.com, create an online room and copy its room link.
- [ ] Open the room link in a second browser or device; both players see each other in the lobby.
- [ ] Each player claims a seat; claiming a seat someone else holds is refused.
- [ ] As host, fill the empty seats with bots, change a bot's difficulty, and start the game.
- [ ] Play a complete game from bidding through game over; both players see the same bids, trump, tricks, and scores throughout.
- [ ] Play a game with four human players (or as many devices as available plus bots) and confirm every table matches.
- [ ] Mid-game, refresh one player's browser; they return to their seat and play continues.
- [ ] Mid-game, turn one player's network off briefly and back on; they return to their seat and play continues.
- [ ] Mid-game, close one player's browser; the host replaces that seat with a bot and play continues.
- [ ] Open a room link for a room code that was never created; the app behaves as it did before the move (joins an empty lobby).
- [ ] Start an offline game against bots and play a hand; it behaves as before.
- [ ] Follow the deployment guide's local dev steps on a clean checkout and play a local online game.

## ADR: Room server hosting shape
Added: slice 1 of online-play-restored, 2026-11-20

### Context
Hosted PartyKit is gone. `room.ts` has to run as a Durable Object on a Cloudflare Worker through PartyServer 0.5.10, and its scenario tests must keep their assertions.

### Decision 1: Room route
| Option | Summary | Key cost |
|---|---|---|
| A: Adopt PartyServer's route | Client uses `/parties/room-server/<code>`. Worker calls `routePartykitRequest` | One-line client change |
| B: Map `/party/<code>` in the Worker | Worker parses the path and calls `getServerByName` | Hand-written routing to maintain |

**Chosen: A.** Old bundles point at the dead `partykit.dev` host, so keeping the old path buys nothing. The Durable Object class and binding are both `RoomServer`, which makes the party `room-server`.

### Decision 2: Test harness and Durable Object shape
| Option | Summary | Key cost |
|---|---|---|
| A: Logic class plus thin Durable Object adapter | `RookRoom` stays a plain class taking a `RoomHost` port. `RoomServer extends Server` passes calls through. Tests stay in Node with the same mocks | One extra small file |
| B: `RookRoom extends Server`, tests in Node | Tests stub `cloudflare:workers` and patch PartyServer internals | Breaks on PartyServer upgrades |
| C: Tests in the Workers runtime via `@cloudflare/vitest-pool-workers` | Real sockets through the Worker | Race scenarios still need mocks; needs vitest ^4.1 |

**Chosen: A.** `room.ts` imports only types from `partyserver`. If room logic later needs storage or alarms, the `RoomHost` port grows.

### Decision 3: Hibernation
**Off**, set explicitly with `static options = { hibernate: false }`. State stays in memory, as on PartyKit. Hibernation would require persisting all room state and moving bot delays to alarms.

### Decision 4: Wrangler config
`wrangler.jsonc`, Worker name `squickr-rook`, `main: src/index.ts`, `compatibility_date: 2026-11-01`, Durable Object binding `RoomServer`, migration `v1` with `new_sqlite_classes: ["RoomServer"]`, `dev.port: 1999`.

### Decision 5: Requests outside the room route
The Worker returns `404` unless the path starts with `/parties/room-server/` followed by a non-empty room code. A non-WebSocket request on the room route gets PartyServer's `404`.

### Implementation shape
- `packages/server/src/room.ts`: type-only imports of `Connection`, `ConnectionContext`, `WSMessage` from `partyserver`. Exports `RoomHost` (`id`, `getConnection`, `getConnections`). Constructor takes `RoomHost`. Keeps `onMessage(message, sender)`. `sendTo` keeps the literal `1` for OPEN and drops the `any` cast.
- `packages/server/src/server.ts`: `Env` with `RoomServer: DurableObjectNamespace<RoomServer>`. `RoomServer extends Server<Env>` builds a `RookRoom` whose `RoomHost` reads `this.name`, `this.getConnection`, `this.getConnections` on each call. Forwards `onConnect`, `onMessage(conn, msg)` as `onMessage(msg, conn)`, and `onClose`.
- `packages/server/src/routes.ts` and `routes.test.ts`: `ROOM_PARTY = "room-server"` and `isRoomRoute(pathname)`.
- `packages/server/src/index.ts`: re-exports `RoomServer`. `fetch` returns 404 outside the room route, otherwise `(await routePartykitRequest(request, env)) ?? 404`.
- `packages/server/package.json`: `dev` is `wrangler dev`, `ship` is `wrangler deploy`. Deps `partyserver@0.5.10`; dev deps `wrangler@4.158.0`, `@cloudflare/workers-types@5.20261104.1`. `partykit` removed.
- `packages/server/tsconfig.json`: `lib: ["ES2022"]`, `types: ["@cloudflare/workers-types"]`.
- `packages/server/partykit.json` deleted. `.gitignore` swaps `.partykit/` for `.wrangler/`.
- `room.test.ts`: only type casts change (`partyserver` `Connection`, `RoomHost`).
- Web: URL is `${proto}://${host}/parties/room-server/${roomCode}`. Store tests cover the default host (`ws://localhost:1999/parties/room-server/ABCD`) and a workers.dev host (`wss://...`). `vite-env.d.ts` unchanged.

### Consequences
- Room logic is tested in Node. The `RoomServer` adapter and Worker routing are checked by hand at the slice gate.
- Each open room keeps its Durable Object running and counts against the free plan's daily duration limit.
- If `pnpm install` skips `workerd` or `esbuild` builds, add `onlyBuiltDependencies` to `pnpm-workspace.yaml`. If the bundle needs Node built-ins, add the `nodejs_compat` flag.
