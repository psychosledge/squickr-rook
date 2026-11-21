import { describe, it, expect, vi, beforeEach } from "vitest";
import { INITIAL_STATE } from "@rook/engine";
import type { OnlineStoreState } from "@/store/onlineGameStore.types";
import OnlineGamePage, { OnlineGamePageView } from "./OnlineGamePage";

const fake = vi.hoisted(() => ({
  hookCalls: 0,
  previousRenderHookCount: null as number | null,
  store: {} as Record<string, unknown>,
}));

function countHook() {
  fake.hookCalls++;
  if (fake.previousRenderHookCount !== null && fake.hookCalls > fake.previousRenderHookCount) {
    throw new Error("Rendered more hooks than during the previous render.");
  }
}

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      countHook();
      return [initial, () => {}];
    },
    useEffect: () => {
      countHook();
    },
  };
});

vi.mock("react-router", () => ({
  useParams: () => ({ code: "ABCD" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/store/onlineGameStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/onlineGameStore")>();
  return {
    ...actual,
    useOnlineGameStore: (selector: (s: Record<string, unknown>) => unknown) => selector(fake.store),
  };
});

function renderPage() {
  fake.hookCalls = 0;
  const output = OnlineGamePage();
  fake.previousRenderHookCount = fake.hookCalls;
  return output;
}

describe("OnlineGamePage — hook order across renders", () => {
  beforeEach(async () => {
    const { INITIAL_ONLINE_STATE } = await import("@/store/onlineGameStore");
    fake.previousRenderHookCount = null;
    fake.store = { ...INITIAL_ONLINE_STATE };
  });

  it("renders the game table after reconnect restores game state on a mid-game reload", () => {
    const reconnecting: Partial<OnlineStoreState> = { isReconnecting: true, gameState: null };
    Object.assign(fake.store, reconnecting);
    renderPage();

    const restored: Partial<OnlineStoreState> = {
      isReconnecting: false,
      lobbyPhase: "playing",
      mySeat: "N",
      _socket: {} as WebSocket,
      gameState: { ...INITIAL_STATE, phase: "playing", handNumber: 1 },
    };
    Object.assign(fake.store, restored);
    const output = renderPage();

    expect(output?.type).toBe(OnlineGamePageView);
  });
});
