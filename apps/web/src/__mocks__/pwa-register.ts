import { vi } from "vitest";

export const useRegisterSW = vi.fn(() => ({
  needRefresh: [false, vi.fn()] as [boolean, ReturnType<typeof vi.fn>],
  offlineReady: [false, vi.fn()] as [boolean, ReturnType<typeof vi.fn>],
  updateServiceWorker: vi.fn(),
}));
