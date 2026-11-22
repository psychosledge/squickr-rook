# Online Play Restored

Tier: core

## Summary

When this story is done, a player can create an online room again, share it with friends, and play a full game together.

## Background

Online play has been down since late October 2026. The service that hosted our online rooms shut down permanently, so creating or joining a room fails and new server updates can't be released. Offline play against bots still works, but anyone who plays Rook with friends online has had no way to do it. This story moves the online rooms to hosting we control so they work again and stay that way.

## What needs to happen

- Move the online room server to a new hosting provider under our own account.
- Point the web app at the new room server.
- Restore our ability to run the room server locally for development and to release server updates.
- Update the deployment guide to describe the new setup.

## Notes

- Backlog #12. Hosted PartyKit (*.partykit.dev and `partykit deploy`) shut down on 2026-10-23. squickr-rook.psychosledge.partykit.dev no longer resolves.
- Target: PartyServer on a Cloudflare Worker with Durable Objects, in our own Cloudflare account. Migration guide: https://docs.partykit.io/guides/migrate-to-partyserver/
- Port `packages/server/src/room.ts` from the `Party.Server` API. `room.test.ts` is the regression net for the port.
- Add wrangler config and a Cloudflare deploy token (a GitHub secret if deploys run from CI). Set `VITE_PARTYKIT_HOST` (read in `apps/web/src/store/onlineGameStore.ts`) to the new Worker URL for production builds.
- Replace the `server:dev` and `server:ship` scripts and `docs/deployment-guide.md`. Update the `/ship` server-deploy step if it calls `server:ship`.
- Rooms stored on the old host were deleted at shutdown, so there's no data to migrate.
- Open question for `/plan`: keep the Worker on its `*.workers.dev` URL, or put it on a custom subdomain of squickr.com.

## Acceptance criteria

- A player on rook.squickr.com can create an online room and get a room link to share.
- Friends who open that link join the same room, see each other, and can claim seats.
- The host can fill empty seats with bots, choose their difficulty, and start the game.
- Four players, or players plus bots, can play a complete game from bidding through game over, and all players see the same table.
- A player who refreshes or briefly loses connection mid-game returns to their seat and the game continues.
- When a player leaves mid-game, the host can replace them with a bot and the game continues.
- Offline play against bots works the same as before.
