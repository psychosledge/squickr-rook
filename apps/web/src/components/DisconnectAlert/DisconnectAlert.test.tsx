import { describe, it, expect, vi } from "vitest";
import React from "react";
import type { Seat } from "@rook/engine";
import { DisconnectAlert } from "./DisconnectAlert";
import type { DisconnectAlertProps } from "./DisconnectAlert";

// Mock CSS modules
vi.mock("./DisconnectAlert.module.css", () => ({
  default: { banner: "banner", message: "message", btn: "btn" },
}));

// ---------------------------------------------------------------------------
// Tree helpers (same pattern as OnlineLobbyPage.test.tsx)
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<DisconnectAlertProps> = {}): DisconnectAlertProps {
  return {
    displayName: "Alice",
    seat: "N" as Seat,
    isHost: false,
    onReplaceWithBot: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DisconnectAlert", () => {
  it("1. renders display name and 'has disconnected.' message", () => {
    const tree = DisconnectAlert(makeProps({ displayName: "Bob" }));
    const text = flattenText(tree);
    expect(text).toContain("Bob");
    expect(text).toContain("has disconnected.");
  });

  it("2. renders 'Replace with Bot' button when isHost=true", () => {
    const tree = DisconnectAlert(makeProps({ isHost: true }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const replaceBtn = buttons.find((el) => flattenText(el).includes("Replace with Bot"));
    expect(replaceBtn).toBeDefined();
  });

  it("3. does NOT render 'Replace with Bot' button when isHost=false", () => {
    const tree = DisconnectAlert(makeProps({ isHost: false }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const replaceBtn = buttons.find((el) => flattenText(el).includes("Replace with Bot"));
    expect(replaceBtn).toBeUndefined();
  });

  it("4. renders 'Dismiss' button when isHost=false", () => {
    const tree = DisconnectAlert(makeProps({ isHost: false }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const dismissBtn = buttons.find((el) => flattenText(el).includes("Dismiss"));
    expect(dismissBtn).toBeDefined();
  });

  it("5. clicking 'Replace with Bot' calls onReplaceWithBot(seat) AND onDismiss", () => {
    const onReplaceWithBot = vi.fn();
    const onDismiss = vi.fn();
    const seat: Seat = "E";
    const tree = DisconnectAlert(makeProps({ isHost: true, seat, onReplaceWithBot, onDismiss }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const replaceBtn = buttons.find((el) => flattenText(el).includes("Replace with Bot"));
    expect(replaceBtn).toBeDefined();
    const p = replaceBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onReplaceWithBot).toHaveBeenCalledWith(seat);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("6. clicking 'Dismiss' calls onDismiss", () => {
    const onDismiss = vi.fn();
    const tree = DisconnectAlert(makeProps({ isHost: false, onDismiss }));
    const all = flattenElements(tree);
    const buttons = all.filter((el) => el.type === "button");
    const dismissBtn = buttons.find((el) => flattenText(el).includes("Dismiss"));
    expect(dismissBtn).toBeDefined();
    const p = dismissBtn!.props as Record<string, unknown>;
    (p.onClick as () => void)();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("7. has role='alert' on the banner element", () => {
    const tree = DisconnectAlert(makeProps());
    const all = flattenElements(tree);
    const alertEl = all.find((el) => {
      const p = el.props as Record<string, unknown>;
      return p.role === "alert";
    });
    expect(alertEl).toBeDefined();
  });
});
