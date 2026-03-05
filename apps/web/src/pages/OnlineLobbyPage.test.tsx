import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { SeatInfo } from "@/store/onlineGameStore.types";
import type { Seat } from "@rook/engine";
import {
  NameEntryView,
  HomeView,
  ConnectingView,
  LobbyView,
} from "./OnlineLobbyPage";
import type {
  NameEntryViewProps,
  HomeViewProps,
  ConnectingViewProps,
  LobbyViewProps,
} from "./OnlineLobbyPage";

// Mock CSS modules
vi.mock("./OnlineLobbyPage.module.css", () => ({
  default: {
    page: "page",
    title: "title",
    subtitle: "subtitle",
    label: "label",
    startBtn: "startBtn",
    onlineBtn: "onlineBtn",
    nameForm: "nameForm",
    nameInput: "nameInput",
    codeInput: "codeInput",
    actionGroup: "actionGroup",
    roomCode: "roomCode",
    shareUrl: "shareUrl",
    roomInfo: "roomInfo",
    seatGrid: "seatGrid",
    seatCard: "seatCard",
    mySeat: "mySeat",
    seatLabel: "seatLabel",
    seatName: "seatName",
    seatEmpty: "seatEmpty",
    seatBtn: "seatBtn",
    spinner: "spinner",
    errorMsg: "errorMsg",
  },
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as BiddingOverlay / GameOverScreen tests)
// ---------------------------------------------------------------------------

function flattenElements(node: React.ReactNode): React.ReactElement[] {
  if (node == null || typeof node !== "object") return [];
  if (!React.isValidElement(node)) return [];
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return [el, ...childNodes.flatMap(flattenElements)];
}

function collectTree(node: React.ReactNode): React.ReactNode[] {
  if (node == null) return [];
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return [node];
  if (!React.isValidElement(node)) return [node];
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return [el, ...childNodes.flatMap(collectTree)];
}

function flattenText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "boolean") return "";
  if (!React.isValidElement(node)) return "";
  const el = node as React.ReactElement;
  const p = el.props as Record<string, unknown>;
  const childrenProp = p.children as React.ReactNode | undefined;
  const childNodes: React.ReactNode[] = Array.isArray(childrenProp)
    ? childrenProp
    : childrenProp != null
    ? [childrenProp]
    : [];
  return childNodes.map(flattenText).join("");
}

function findByClass(
  elements: React.ReactElement[],
  classMatch: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

function findButtons(
  elements: React.ReactElement[],
  classMatch: string,
): React.ReactElement[] {
  return elements.filter((el) => {
    if (el.type !== "button") return false;
    const p = el.props as Record<string, unknown>;
    return typeof p.className === "string" && p.className.includes(classMatch);
  });
}

function findInputs(elements: React.ReactElement[]): React.ReactElement[] {
  return elements.filter((el) => el.type === "input");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSeatInfo(overrides: Partial<SeatInfo> = {}): SeatInfo {
  return {
    seat: "N",
    playerId: null,
    displayName: null,
    connected: false,
    isBot: false,
    ...overrides,
  };
}

function makeAllEmptySeats(): SeatInfo[] {
  return (["N", "E", "S", "W"] as Seat[]).map((seat) =>
    makeSeatInfo({ seat }),
  );
}

function makeNameEntryProps(overrides: Partial<NameEntryViewProps> = {}): NameEntryViewProps {
  return {
    nameInput: "",
    onNameChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

function makeHomeProps(overrides: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    joinMode: false,
    codeInput: "",
    onCodeChange: vi.fn(),
    onHostGame: vi.fn(),
    onShowJoin: vi.fn(),
    onJoinSubmit: vi.fn(),
    onCancelJoin: vi.fn(),
    ...overrides,
  };
}

function makeConnectingProps(overrides: Partial<ConnectingViewProps> = {}): ConnectingViewProps {
  return {
    roomCode: "ABC123",
    connectionError: null,
    onBack: vi.fn(),
    ...overrides,
  };
}

function makeLobbyProps(overrides: Partial<LobbyViewProps> = {}): LobbyViewProps {
  return {
    roomCode: "ABC123",
    shareUrl: "https://example.com/online/ABC123",
    seats: makeAllEmptySeats(),
    mySeat: null,
    isHost: false,
    connectionError: null,
    onClaimSeat: vi.fn(),
    onLeaveSeat: vi.fn(),
    onStartGame: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// NameEntryView tests (1–7)
// ---------------------------------------------------------------------------

describe("NameEntryView", () => {
  it("1. renders a label containing 'display name'", () => {
    const tree = NameEntryView(makeNameEntryProps());
    const text = flattenText(tree);
    expect(text.toLowerCase()).toContain("display name");
  });

  it("2. renders input with maxLength=20", () => {
    const tree = NameEntryView(makeNameEntryProps());
    const all = flattenElements(tree);
    const inputs = findInputs(all);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const nameInput = inputs[0];
    const p = nameInput.props as Record<string, unknown>;
    expect(p.maxLength).toBe(20);
  });

  it("3. submit button disabled when nameInput is empty string", () => {
    const tree = NameEntryView(makeNameEntryProps({ nameInput: "" }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const submitBtn = buttons.find((el) => {
      const p = el.props as Record<string, unknown>;
      return p.type === "submit";
    });
    expect(submitBtn).toBeDefined();
    const p = submitBtn!.props as Record<string, unknown>;
    expect(p.disabled).toBe(true);
  });

  it("4. submit button disabled when nameInput is whitespace only", () => {
    const tree = NameEntryView(makeNameEntryProps({ nameInput: "   " }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const submitBtn = buttons.find((el) => {
      const p = el.props as Record<string, unknown>;
      return p.type === "submit";
    });
    expect(submitBtn).toBeDefined();
    const p = submitBtn!.props as Record<string, unknown>;
    expect(p.disabled).toBe(true);
  });

  it("5. submit button enabled when nameInput is 'Alice'", () => {
    const tree = NameEntryView(makeNameEntryProps({ nameInput: "Alice" }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const submitBtn = buttons.find((el) => {
      const p = el.props as Record<string, unknown>;
      return p.type === "submit";
    });
    expect(submitBtn).toBeDefined();
    const p = submitBtn!.props as Record<string, unknown>;
    expect(p.disabled).toBeFalsy();
  });

  it("6. onSubmit called on form submit", () => {
    const onSubmit = vi.fn();
    const tree = NameEntryView(makeNameEntryProps({ nameInput: "Alice", onSubmit }));
    const all = flattenElements(tree);
    const forms = all.filter((el) => el.type === "form");
    expect(forms.length).toBeGreaterThanOrEqual(1);
    const form = forms[0];
    const p = form.props as Record<string, unknown>;
    expect(typeof p.onSubmit).toBe("function");
    // Call onSubmit with a fake event that has preventDefault
    const fakeEvent = { preventDefault: vi.fn() };
    (p.onSubmit as (e: unknown) => void)(fakeEvent);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("7. onNameChange called on input change", () => {
    const onNameChange = vi.fn();
    const tree = NameEntryView(makeNameEntryProps({ onNameChange }));
    const all = flattenElements(tree);
    const inputs = findInputs(all);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const input = inputs[0];
    const p = input.props as Record<string, unknown>;
    expect(typeof p.onChange).toBe("function");
    (p.onChange as (e: { target: { value: string } }) => void)({ target: { value: "Bob" } });
    expect(onNameChange).toHaveBeenCalledWith("Bob");
  });
});

// ---------------------------------------------------------------------------
// HomeView not-joinMode tests (8–12)
// ---------------------------------------------------------------------------

describe("HomeView — not joinMode", () => {
  it("8. renders 'Host a Game' button", () => {
    const tree = HomeView(makeHomeProps({ joinMode: false }));
    const text = flattenText(tree);
    expect(text).toContain("Host a Game");
  });

  it("9. renders 'Join a Game' button", () => {
    const tree = HomeView(makeHomeProps({ joinMode: false }));
    const text = flattenText(tree);
    expect(text).toContain("Join a Game");
  });

  it("10. onHostGame called when 'Host a Game' clicked", () => {
    const onHostGame = vi.fn();
    const tree = HomeView(makeHomeProps({ joinMode: false, onHostGame }));
    const all = flattenElements(tree);
    const buttons = findButtons(all, "startBtn");
    const hostBtn = buttons.find((el) => {
      return flattenText(el).includes("Host a Game");
    });
    expect(hostBtn).toBeDefined();
    const p = hostBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onHostGame).toHaveBeenCalledOnce();
  });

  it("11. onShowJoin called when 'Join a Game' clicked", () => {
    const onShowJoin = vi.fn();
    const tree = HomeView(makeHomeProps({ joinMode: false, onShowJoin }));
    const all = flattenElements(tree);
    const buttons = findButtons(all, "onlineBtn");
    const joinBtn = buttons.find((el) => flattenText(el).includes("Join a Game"));
    expect(joinBtn).toBeDefined();
    const p = joinBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onShowJoin).toHaveBeenCalledOnce();
  });

  it("12. no room code input when joinMode=false", () => {
    const tree = HomeView(makeHomeProps({ joinMode: false }));
    const all = flattenElements(tree);
    const inputs = findInputs(all);
    expect(inputs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HomeView joinMode tests (13–17)
// ---------------------------------------------------------------------------

describe("HomeView — joinMode", () => {
  it("13. renders room code input", () => {
    const tree = HomeView(makeHomeProps({ joinMode: true, codeInput: "" }));
    const all = flattenElements(tree);
    const inputs = findInputs(all);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("14. Join button disabled when codeInput.length < 6", () => {
    const tree = HomeView(makeHomeProps({ joinMode: true, codeInput: "AB" }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const joinBtn = buttons.find((el) => flattenText(el).includes("Join"));
    expect(joinBtn).toBeDefined();
    const p = joinBtn!.props as Record<string, unknown>;
    expect(p.disabled).toBe(true);
  });

  it("15. Join button enabled when codeInput.length === 6", () => {
    const tree = HomeView(makeHomeProps({ joinMode: true, codeInput: "ABC123" }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const joinBtn = buttons.find((el) => flattenText(el).includes("Join"));
    expect(joinBtn).toBeDefined();
    const p = joinBtn!.props as Record<string, unknown>;
    expect(p.disabled).toBeFalsy();
  });

  it("16. onCancelJoin called by Back button", () => {
    const onCancelJoin = vi.fn();
    const tree = HomeView(makeHomeProps({ joinMode: true, onCancelJoin }));
    const all = flattenElements(tree);
    const buttons = findButtons(all, "onlineBtn");
    const backBtn = buttons.find((el) => flattenText(el).includes("Back"));
    expect(backBtn).toBeDefined();
    const p = backBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onCancelJoin).toHaveBeenCalledOnce();
  });

  it("17. onJoinSubmit called by Join button when length===6", () => {
    const onJoinSubmit = vi.fn();
    const tree = HomeView(makeHomeProps({ joinMode: true, codeInput: "ABC123", onJoinSubmit }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const joinBtn = buttons.find((el) => flattenText(el).includes("Join"));
    expect(joinBtn).toBeDefined();
    const p = joinBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onJoinSubmit).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// ConnectingView tests (18–22)
// ---------------------------------------------------------------------------

describe("ConnectingView", () => {
  it("18. renders roomCode text", () => {
    const tree = ConnectingView(makeConnectingProps({ roomCode: "XYZ789" }));
    const text = flattenText(tree);
    expect(text).toContain("XYZ789");
  });

  it("19. spinner rendered when no error", () => {
    const tree = ConnectingView(makeConnectingProps({ connectionError: null }));
    const all = flattenElements(tree);
    const spinners = findByClass(all, "spinner");
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it("20. spinner NOT rendered when error present", () => {
    const tree = ConnectingView(makeConnectingProps({ connectionError: "Connection failed" }));
    const all = flattenElements(tree);
    const spinners = findByClass(all, "spinner");
    expect(spinners).toHaveLength(0);
  });

  it("21. error message rendered when connectionError set", () => {
    const tree = ConnectingView(makeConnectingProps({ connectionError: "Connection failed" }));
    const all = flattenElements(tree);
    const errors = findByClass(all, "errorMsg");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const errText = flattenText(errors[0]);
    expect(errText).toContain("Connection failed");
  });

  it("22. onBack called by Back button", () => {
    const onBack = vi.fn();
    const tree = ConnectingView(makeConnectingProps({ onBack }));
    const all = flattenElements(tree);
    const buttons = findButtons(all, "onlineBtn");
    const backBtn = buttons.find((el) => flattenText(el).includes("Back"));
    expect(backBtn).toBeDefined();
    const p = backBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// LobbyView tests (23–41)
// ---------------------------------------------------------------------------

describe("LobbyView", () => {
  it("23. renders 4 seat cards", () => {
    const tree = LobbyView(makeLobbyProps());
    const all = flattenElements(tree);
    const seatCards = findByClass(all, "seatCard");
    expect(seatCards).toHaveLength(4);
  });

  it("24. empty seat shows 'Sit Here' button", () => {
    const tree = LobbyView(makeLobbyProps({ seats: makeAllEmptySeats() }));
    const all = flattenElements(tree);
    const sitBtns = findButtons(all, "seatBtn").filter((el) =>
      flattenText(el).includes("Sit Here"),
    );
    expect(sitBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("25. occupied seat (not mine) does NOT show 'Sit Here'", () => {
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "E"
        ? makeSeatInfo({ seat: "E", playerId: "other-player", displayName: "OtherGuy", connected: true })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats, mySeat: null }));
    const all = flattenElements(tree);
    const allSeatBtns = findButtons(all, "seatBtn");
    // The E seat should NOT have a Sit Here button, only N/S/W should
    const sitBtns = allSeatBtns.filter((el) => flattenText(el).includes("Sit Here"));
    expect(sitBtns.length).toBe(3); // N, S, W empty — E is occupied
  });

  it("26. my seat shows 'Leave' button", () => {
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "N"
        ? makeSeatInfo({ seat: "N", playerId: "me", displayName: "Me", connected: true })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats, mySeat: "N" }));
    const all = flattenElements(tree);
    const leaveBtns = findButtons(all, "seatBtn").filter((el) =>
      flattenText(el).includes("Leave"),
    );
    expect(leaveBtns).toHaveLength(1);
  });

  it("27. my seat does NOT show 'Sit Here'", () => {
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "N"
        ? makeSeatInfo({ seat: "N", playerId: "me", displayName: "Me", connected: true })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats, mySeat: "N" }));
    const all = flattenElements(tree);
    // The N seat should NOT have a Sit Here button
    const sitBtns = findButtons(all, "seatBtn").filter((el) =>
      flattenText(el).includes("Sit Here"),
    );
    // Only E, S, W should have Sit Here
    expect(sitBtns.length).toBe(3);
  });

  it("28. bot seat shows '(bot)' indicator in name", () => {
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "S"
        ? makeSeatInfo({ seat: "S", playerId: "bot-1", displayName: "Bot", connected: true, isBot: true })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats }));
    const text = flattenText(tree);
    expect(text).toContain("(bot)");
  });

  it("29. 'Start Game' rendered when isHost=true", () => {
    const tree = LobbyView(makeLobbyProps({ isHost: true, mySeat: "N" }));
    const text = flattenText(tree);
    expect(text).toContain("Start Game");
  });

  it("30. 'Start Game' NOT rendered when isHost=false", () => {
    const tree = LobbyView(makeLobbyProps({ isHost: false }));
    const text = flattenText(tree);
    expect(text).not.toContain("Start Game");
  });

  it("31. 'Start Game' disabled when mySeat=null", () => {
    const tree = LobbyView(makeLobbyProps({ isHost: true, mySeat: null }));
    const all = flattenElements(tree);
    const startBtns = findButtons(all, "startBtn").filter((el) =>
      flattenText(el).includes("Start Game"),
    );
    expect(startBtns).toHaveLength(1);
    const p = startBtns[0].props as Record<string, unknown>;
    expect(p.disabled).toBe(true);
  });

  it("32. 'Start Game' enabled when mySeat='N'", () => {
    const tree = LobbyView(makeLobbyProps({ isHost: true, mySeat: "N" }));
    const all = flattenElements(tree);
    const startBtns = findButtons(all, "startBtn").filter((el) =>
      flattenText(el).includes("Start Game"),
    );
    expect(startBtns).toHaveLength(1);
    const p = startBtns[0].props as Record<string, unknown>;
    expect(p.disabled).toBeFalsy();
  });

  it("33. displays roomCode", () => {
    const tree = LobbyView(makeLobbyProps({ roomCode: "MYROOM" }));
    const text = flattenText(tree);
    expect(text).toContain("MYROOM");
  });

  it("34. displays shareUrl", () => {
    const tree = LobbyView(makeLobbyProps({ shareUrl: "https://example.com/online/MYROOM" }));
    const text = flattenText(tree);
    expect(text).toContain("https://example.com/online/MYROOM");
  });

  it("35. error rendered when connectionError set", () => {
    const tree = LobbyView(makeLobbyProps({ connectionError: "Disconnected!" }));
    const all = flattenElements(tree);
    const errors = findByClass(all, "errorMsg");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(flattenText(errors[0])).toContain("Disconnected!");
  });

  it("36. error NOT rendered when null", () => {
    const tree = LobbyView(makeLobbyProps({ connectionError: null }));
    const all = flattenElements(tree);
    const errors = findByClass(all, "errorMsg");
    expect(errors).toHaveLength(0);
  });

  it("37. onClaimSeat called with 'N' when 'Sit Here' clicked for N", () => {
    const onClaimSeat = vi.fn();
    const tree = LobbyView(makeLobbyProps({ onClaimSeat, mySeat: null }));
    const all = flattenElements(tree);
    const sitBtns = findButtons(all, "seatBtn").filter((el) =>
      flattenText(el).includes("Sit Here"),
    );
    // N is the first seat — first Sit Here button
    expect(sitBtns.length).toBeGreaterThanOrEqual(1);
    const p = sitBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onClaimSeat).toHaveBeenCalledWith("N");
  });

  it("38. onLeaveSeat called when 'Leave' clicked", () => {
    const onLeaveSeat = vi.fn();
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "N"
        ? makeSeatInfo({ seat: "N", playerId: "me", displayName: "Me", connected: true })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats, mySeat: "N", onLeaveSeat }));
    const all = flattenElements(tree);
    const leaveBtns = findButtons(all, "seatBtn").filter((el) =>
      flattenText(el).includes("Leave"),
    );
    expect(leaveBtns).toHaveLength(1);
    const p = leaveBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onLeaveSeat).toHaveBeenCalledOnce();
  });

  it("39. onStartGame called when 'Start Game' clicked", () => {
    const onStartGame = vi.fn();
    const tree = LobbyView(makeLobbyProps({ isHost: true, mySeat: "N", onStartGame }));
    const all = flattenElements(tree);
    const startBtns = findButtons(all, "startBtn").filter((el) =>
      flattenText(el).includes("Start Game"),
    );
    expect(startBtns).toHaveLength(1);
    const p = startBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onStartGame).toHaveBeenCalledOnce();
  });

  it("40. onBack called when 'Back to Menu' clicked", () => {
    const onBack = vi.fn();
    const tree = LobbyView(makeLobbyProps({ onBack }));
    const all = flattenElements(tree);
    const backBtns = findButtons(all, "onlineBtn").filter((el) =>
      flattenText(el).includes("Back to Menu"),
    );
    expect(backBtns).toHaveLength(1);
    const p = backBtns[0].props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("41. disconnected human seat shows '(disconnected)' in name", () => {
    const seats = makeAllEmptySeats().map((s) =>
      s.seat === "W"
        ? makeSeatInfo({
            seat: "W",
            playerId: "other",
            displayName: "Bob",
            connected: false,
            isBot: false,
          })
        : s,
    );
    const tree = LobbyView(makeLobbyProps({ seats }));
    const text = flattenText(tree);
    expect(text).toContain("(disconnected)");
  });
});

// Suppress unused import warning
void collectTree;
