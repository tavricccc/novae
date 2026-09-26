import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useForegroundPoll } from "@/hooks/use-foreground-poll";

let root: Root;
let visible = true;
let online = true;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  visible = true; online = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

function Probe({ callback, enabled = true }: { callback: () => unknown; enabled?: boolean }) {
  useForegroundPoll(callback, enabled, { initialDelayMs: 3_000, maxDelayMs: 30_000 });
  return null;
}

it("backs off from 3 seconds to a bounded 30 seconds", async () => {
  const callback = vi.fn();
  await act(async () => root.render(createElement(Probe, { callback })));
  for (const wait of [3_000, 6_000, 12_000, 24_000, 30_000, 30_000]) {
    const count = callback.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(wait - 1));
    expect(callback).toHaveBeenCalledTimes(count);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(callback).toHaveBeenCalledTimes(count + 1);
  }
});

it("pauses in the background/offline and resumes promptly", async () => {
  const callback = vi.fn();
  await act(async () => root.render(createElement(Probe, { callback })));
  visible = false;
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(callback).not.toHaveBeenCalled();
  visible = true; online = false;
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(callback).not.toHaveBeenCalled();
  online = true;
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(callback).toHaveBeenCalledTimes(1);
});

it("does not overlap slow requests or continue after disabled", async () => {
  let resolve!: () => void;
  const callback = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  await act(async () => root.render(createElement(Probe, { callback })));
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  window.dispatchEvent(new Event("online"));
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => root.render(createElement(Probe, { callback, enabled: false })));
  await act(async () => { resolve(); await vi.advanceTimersByTimeAsync(60_000); });
  expect(callback).toHaveBeenCalledTimes(1);
});

it("recovers after a transient failure", async () => {
  const callback = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  await act(async () => root.render(createElement(Probe, { callback })));
  await act(async () => vi.advanceTimersByTimeAsync(9_000));
  expect(callback).toHaveBeenCalledTimes(2);
});
