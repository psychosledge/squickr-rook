import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import UpdateBanner from "./UpdateBanner";

// Mock CSS modules — Vitest doesn't process them
vi.mock("./UpdateBanner.module.css", () => ({
  default: {
    banner: "banner",
    reloadBtn: "reloadBtn",
  },
}));

// Helper: flatten a React element tree into an array of all elements (depth-first)
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

const mockUseRegisterSW = vi.mocked(useRegisterSW);

describe("UpdateBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when needRefresh is false", () => {
    it("renders null", () => {
      mockUseRegisterSW.mockReturnValue({
        needRefresh: [false, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      });

      const result = UpdateBanner();

      expect(result).toBeNull();
    });
  });

  describe("when needRefresh is true", () => {
    it("renders the update banner with role=alert (no redundant aria-live)", () => {
      mockUseRegisterSW.mockReturnValue({
        needRefresh: [true, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      });

      const result = UpdateBanner();
      const elements = flattenElements(result);

      const bannerDiv = elements.find(
        (el) =>
          el.type === "div" &&
          (el.props as Record<string, unknown>).role === "alert"
      );

      expect(bannerDiv).toBeDefined();
      // aria-live must NOT be set — role="alert" implies it per ARIA spec
      expect((bannerDiv!.props as Record<string, unknown>)["aria-live"]).toBeUndefined();
    });

    it("renders a Reload button", () => {
      mockUseRegisterSW.mockReturnValue({
        needRefresh: [true, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      });

      const result = UpdateBanner();
      const elements = flattenElements(result);

      const reloadButton = elements.find(
        (el) =>
          el.type === "button" &&
          (el.props as Record<string, unknown>).children === "Reload"
      );

      expect(reloadButton).toBeDefined();
    });

    it("clicking Reload calls updateServiceWorker(true)", () => {
      const mockUpdateSW = vi.fn().mockResolvedValue(undefined);
      mockUseRegisterSW.mockReturnValue({
        needRefresh: [true, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker: mockUpdateSW,
      });

      const result = UpdateBanner();
      const elements = flattenElements(result);

      const reloadButton = elements.find(
        (el) =>
          el.type === "button" &&
          (el.props as Record<string, unknown>).children === "Reload"
      );

      expect(reloadButton).toBeDefined();

      const onClick = (reloadButton!.props as Record<string, unknown>).onClick as () => void;
      onClick();

      expect(mockUpdateSW).toHaveBeenCalledWith(true);
    });
  });
});
