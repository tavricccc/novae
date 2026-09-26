"use client";

import * as React from "react";
import { subscribeContentCacheInvalidations } from "@/services/content-read-cache";
import { createRefreshScheduler } from "@/lib/refresh-scheduler";

export function useContentInvalidationRefresh(
  prefixes: readonly string[],
  refresh: () => void | Promise<void>,
) {
  const refreshRef = React.useRef(refresh);

  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  React.useEffect(() => {
    const scheduler = createRefreshScheduler(
      () => refreshRef.current(),
      () => document.visibilityState === "visible" && navigator.onLine,
    );
    const unsubscribe = subscribeContentCacheInvalidations((invalidatedPrefix) => {
      if (!prefixes.some((prefix) => invalidatedPrefix.startsWith(prefix))) return;
      scheduler.request();
    });
    document.addEventListener("visibilitychange", scheduler.resume);
    window.addEventListener("online", scheduler.resume);
    window.addEventListener("offline", scheduler.resume);
    return () => {
      unsubscribe();
      scheduler.dispose();
      document.removeEventListener("visibilitychange", scheduler.resume);
      window.removeEventListener("online", scheduler.resume);
      window.removeEventListener("offline", scheduler.resume);
    };
  }, [prefixes]);
}
