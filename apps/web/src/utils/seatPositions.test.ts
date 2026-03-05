import { describe, it, expect } from "vitest";
import { deriveSlots } from "./seatPositions";

describe("deriveSlots", () => {
  it("N at bottom: top=S, left=E, right=W", () => {
    expect(deriveSlots("N")).toEqual({ bottom: "N", top: "S", left: "E", right: "W" });
  });

  it("E at bottom: top=W, left=S, right=N", () => {
    expect(deriveSlots("E")).toEqual({ bottom: "E", top: "W", left: "S", right: "N" });
  });

  it("S at bottom: top=N, left=W, right=E", () => {
    expect(deriveSlots("S")).toEqual({ bottom: "S", top: "N", left: "W", right: "E" });
  });

  it("W at bottom: top=E, left=N, right=S", () => {
    expect(deriveSlots("W")).toEqual({ bottom: "W", top: "E", left: "N", right: "S" });
  });
});
