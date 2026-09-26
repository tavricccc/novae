"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getUnsavedChanges, subscribeUnsavedChanges } from "@/hooks/unsaved-changes-store";

export function hasUpdateDeferral() {
  return getUnsavedChanges().count > 0
    || document.visibilityState !== "visible"
    || !navigator.onLine
    || Boolean(document.querySelector('[data-sheet-surface][data-state="open"], [data-update-defer="true"]'));
}

/** Defer version replacement until editing, overlays and offline work have ended. */
export function useUpdateDeferral() {
  const unsaved = useSyncExternalStore(subscribeUnsavedChanges, getUnsavedChanges, getUnsavedChanges);
  const [deferred, setDeferred] = useState(true);
  useEffect(() => {
    const sync = () => setDeferred(hasUpdateDeferral());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-state", "data-update-defer"],
      childList: true,
      subtree: true,
    });
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [unsaved]);
  return deferred;
}
