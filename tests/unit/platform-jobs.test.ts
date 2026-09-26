import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlatformJobs } from "@/hooks/use-platform-jobs";
import { listPlatformJobs } from "@/services/categories";
import { notifyPlatformJobsChanged } from "@/lib/platform-job-events";

vi.mock("@/services/categories", () => ({ listPlatformJobs: vi.fn() }));
vi.mock("@/i18n", () => {
  const t = (key: string) => key;
  return { useI18n: () => ({ t }) };
});
let root: Root;
let state: ReturnType<typeof usePlatformJobs>;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  root = createRoot(document.createElement("div"));
  function Probe() { state = usePlatformJobs(); return null; }
  await act(async () => root.render(createElement(Probe)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("continues tracking after failed reads instead of treating failure as completion", async () => {
  vi.mocked(listPlatformJobs).mockRejectedValue(new Error("temporary"));
  await act(async () => notifyPlatformJobsChanged());
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(state.watching).toBe(true);
  expect(state.error).toBe("temporary");
  vi.mocked(listPlatformJobs).mockResolvedValue({ entries: [] });
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(state.watching).toBe(false);
  expect(state.error).toBe("");
});

it("coalesces repeated job events with a pending progress read", async () => {
  let resolve!: (value: { entries: [] }) => void;
  vi.mocked(listPlatformJobs).mockReturnValue(new Promise((done) => { resolve = done; }));
  await act(async () => { notifyPlatformJobsChanged(); notifyPlatformJobsChanged(); });
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(listPlatformJobs).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ entries: [] }));
  expect(state.watching).toBe(false);
});

it("does not issue reads while offline", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => notifyPlatformJobsChanged());
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(listPlatformJobs).not.toHaveBeenCalled();
});
