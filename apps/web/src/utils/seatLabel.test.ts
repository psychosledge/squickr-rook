import { describe, it, expect } from "vitest";
import { getSeatLabel, getTeamLabel } from "./seatLabel";

describe("getSeatLabel", () => {
  it('getSeatLabel("N") === "You"', () => {
    expect(getSeatLabel("N")).toBe("You");
  });

  it('getSeatLabel("E") === "P2"', () => {
    expect(getSeatLabel("E")).toBe("P2");
  });

  it('getSeatLabel("S") === "P3"', () => {
    expect(getSeatLabel("S")).toBe("P3");
  });

  it('getSeatLabel("W") === "P4"', () => {
    expect(getSeatLabel("W")).toBe("P4");
  });
});

describe("getTeamLabel", () => {
  it('getTeamLabel("NS") === "P1 & P3"', () => {
    expect(getTeamLabel("NS")).toBe("P1 & P3");
  });

  it('getTeamLabel("EW") === "P2 & P4"', () => {
    expect(getTeamLabel("EW")).toBe("P2 & P4");
  });
});
