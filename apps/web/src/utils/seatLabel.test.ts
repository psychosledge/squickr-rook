import { describe, it, expect } from "vitest";
import { getSeatLabel, getLobbyLabel, getTeamLabel, teamDisplay } from "./seatLabel";

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
  it('getTeamLabel("NS") === "P1 & P2"', () => {
    expect(getTeamLabel("NS")).toBe("P1 & P2");
  });

  it('getTeamLabel("EW") === "P3 & P4"', () => {
    expect(getTeamLabel("EW")).toBe("P3 & P4");
  });
});

describe("teamDisplay", () => {
  it("falls back to getTeamLabel when no seatNames provided", () => {
    expect(teamDisplay("NS")).toBe("P1 & P2");
    expect(teamDisplay("EW")).toBe("P3 & P4");
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

describe("getLobbyLabel", () => {
  it('getLobbyLabel("N") === "P1"', () => {
    expect(getLobbyLabel("N")).toBe("P1");
  });

  it('getLobbyLabel("S") === "P2"', () => {
    expect(getLobbyLabel("S")).toBe("P2");
  });

  it('getLobbyLabel("E") === "P3"', () => {
    expect(getLobbyLabel("E")).toBe("P3");
  });

  it('getLobbyLabel("W") === "P4"', () => {
    expect(getLobbyLabel("W")).toBe("P4");
  });
});
