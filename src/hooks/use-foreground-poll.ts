"use client";

import { useEffect, useRef } from "react";

/** Poll only while someone can see the result, with no overlapping requests. */
export function useForegroundPoll(
  callback: () => unknown | Promise<unknown>,
  enabled: boolean,
  { initialDelayMs = 1_000, maxDelayMs = 30_000 }: { initialDelayMs?: number; maxDelayMs?: number } = {},
) {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let timer = 0;
    let delay = initialDelayMs;
    const available = () => document.visibilityState === "visible" && navigator.onLine;
    const clear = () => { window.clearTimeout(timer); timer = 0; };
    const schedule = (wait: number) => {
      clear();
      if (!stopped && available()) timer = window.setTimeout(() => void tick(), wait);
    };
    const tick = async () => {
      clear();
      if (stopped || running || !available()) return;
      running = true;
      try {
        await callbackRef.current();
      } catch {
        // The caller owns its error presentation. A transient failure must not
        // permanently stop progress tracking or cause an unhandled rejection.
      } finally {
        running = false;
        delay = Math.min(maxDelayMs, delay * 2);
        schedule(delay);
      }
    };
    const resume = () => {
      clear();
      if (!available()) return;
      delay = initialDelayMs;
      if (!running) void tick();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    schedule(initialDelayMs);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [enabled, initialDelayMs, maxDelayMs]);
}
