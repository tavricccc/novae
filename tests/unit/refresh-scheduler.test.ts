import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRefreshScheduler } from "@/lib/refresh-scheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("coalesces separate event turns into one refresh", async () => {
  const refresh = vi.fn();
  const scheduler = createRefreshScheduler(refresh, () => true);
  for (let index = 0; index < 10; index++) {
    scheduler.request();
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  scheduler.dispose();
});

it("bounds staleness during a continuous event stream", async () => {
  const refresh = vi.fn();
  const scheduler = createRefreshScheduler(refresh, () => true);
  for (let index = 0; index < 10; index++) {
    scheduler.request();
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(refresh).toHaveBeenCalledTimes(1);
  scheduler.dispose();
});

it("queues only one follow-up behind a slow request", async () => {
  let resolve!: () => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  const scheduler = createRefreshScheduler(refresh, () => true);
  scheduler.request();
  await vi.advanceTimersByTimeAsync(200);
  for (let index = 0; index < 10; index++) scheduler.request();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  resolve();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});

it("defers hidden/offline work and flushes once when available", async () => {
  let available = false;
  const refresh = vi.fn();
  const scheduler = createRefreshScheduler(refresh, () => available);
  scheduler.request(); scheduler.request();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).not.toHaveBeenCalled();
  available = true;
  scheduler.resume();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  scheduler.request();
  scheduler.dispose();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
