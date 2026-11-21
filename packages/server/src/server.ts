import { Server } from "partyserver";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import RookRoom from "./room.js";
import type { RoomHost } from "./room.js";

export interface Env {
  RoomServer: DurableObjectNamespace<RoomServer>;
}

function roomHostFor(server: RoomServer): RoomHost {
  return {
    get id() {
      return server.name;
    },
    getConnection: (id) => server.getConnection(id),
    getConnections: () => server.getConnections(),
  };
}

export class RoomServer extends Server<Env> {
  static override options = { hibernate: false };

  private readonly room = new RookRoom(roomHostFor(this));

  override onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
    return this.room.onConnect(conn, ctx);
  }

  override onMessage(conn: Connection, message: WSMessage): Promise<void> {
    return this.room.onMessage(message, conn);
  }

  override onClose(conn: Connection): Promise<void> {
    return this.room.onClose(conn);
  }
}
