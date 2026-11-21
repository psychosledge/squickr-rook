import { describe, it, expect } from "vitest";
import { isRoomRoute } from "./routes.js";

describe("isRoomRoute", () => {
  it("accepts a room code under the room party", () => {
    expect(isRoomRoute("/parties/room-server/ABCD")).toBe(true);
  });

  it("rejects the root path", () => {
    expect(isRoomRoute("/")).toBe(false);
  });

  it("rejects the room party with no room code", () => {
    expect(isRoomRoute("/parties/room-server/")).toBe(false);
    expect(isRoomRoute("/parties/room-server")).toBe(false);
  });

  it("rejects another party", () => {
    expect(isRoomRoute("/parties/foo/ABCD")).toBe(false);
  });

  it("rejects the old PartyKit path", () => {
    expect(isRoomRoute("/party/ABCD")).toBe(false);
  });

  it("rejects a party name that only starts with the room party", () => {
    expect(isRoomRoute("/parties/room-server-x/ABCD")).toBe(false);
  });
});
