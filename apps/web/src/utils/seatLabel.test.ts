import { describe, it, expect } from "vitest";
import { getSeatLabel, getTeamLabel, teamDisplay } from "./seatLabel";

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

describe("teamDisplay", () => {
  it("falls back to getTeamLabel when no seatNames provided", () => {
    expect(teamDisplay("NS")).toBe("P1 & P3");
    expect(teamDisplay("EW")).toBe("P2 & P4");
  });

  it("builds team string from seatNames when provided", () => {
    const seatNames = { N: "Alice", S: "Carol", E: "Bob", W: "Dave" };
    expect(teamDisplay("NS", seatNames)).toBe("Alice & Carol");
    expect(teamDisplay("EW", seatNames)).toBe("Bob & Dave");
  });

  it("falls back per-seat to getSeatLabel when a seat is missing from seatNames", () => {
    const seatNames = { N: "Alice" }; // S, E, W missing
    expect(teamDisplay("NS", seatNames)).toBe("Alice & P3");
    expect(teamDisplay("EW", seatNames)).toBe("P2 & P4");
  });
});
