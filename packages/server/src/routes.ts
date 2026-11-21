const ROOM_PARTY = "room-server";

const ROOM_ROUTE_PREFIX = `/parties/${ROOM_PARTY}/`;

export function isRoomRoute(pathname: string): boolean {
  return pathname.startsWith(ROOM_ROUTE_PREFIX) && pathname.length > ROOM_ROUTE_PREFIX.length;
}
