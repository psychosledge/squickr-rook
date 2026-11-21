import { routePartykitRequest } from "partyserver";
import { isRoomRoute } from "./routes.js";
import type { Env } from "./server.js";

export { RoomServer } from "./server.js";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    if (!isRoomRoute(new URL(request.url).pathname)) return notFound();
    return (await routePartykitRequest(request, env)) ?? notFound();
  },
} satisfies ExportedHandler<Env>;
