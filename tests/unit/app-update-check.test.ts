import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppUpdateGate } from "@/components/app-update-gate";

vi.mock("@/i18n", () => ({ t: (key: string) => key, useI18n: () => ({}) }));
vi.mock("@/components/turnstile-provider", () => ({ useTurnstile: () => ({ verifying: true }) }));
vi.mock("@/hooks/use-update-deferral", () => ({ useUpdateDeferral: () => true, hasUpdateDeferral: () => true }));
vi.mock("motion/react", () => ({ AnimatePresence: () => null, motion: { div: () => null } }));
vi.mock("@/components/ui/brand", () => ({ BrandLockup: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/action-feedback-icon", () => ({ ActionFeedbackIcon: () => null }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null, DialogContent: () => null, DialogDescription: () => null,
  DialogFooter: () => null, DialogHeader: () => null, DialogTitle: () => null,
}));

const key = "novae:last-version-check-at";
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("retries a failed version check on reconnection and retains successful throttling", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ version: "development" }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(createElement(AppUpdateGate)));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(key)).toBeNull();
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(key)).not.toBeNull();
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not clear a newer check timestamp written by another tab", async () => {
  const otherTabTimestamp = String(Date.now() + 1_000);
  vi.stubGlobal("fetch", vi.fn(async () => {
    localStorage.setItem(key, otherTabTimestamp);
    throw new Error("offline");
  }));
  await act(async () => root.render(createElement(AppUpdateGate)));
  expect(localStorage.getItem(key)).toBe(otherTabTimestamp);
});
