"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { timing } from "@/lib/motion-timing";
import { BrandLockup } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ActionFeedbackIcon } from "@/components/ui/action-feedback-icon";
import { raceWithAbort } from "@/lib/abort-signal";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";
import { useTurnstile } from "@/components/turnstile-provider";
import { hasUpdateDeferral, useUpdateDeferral } from "@/hooks/use-update-deferral";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || "development";
const AUTO_RELOAD_KEY = "novae:auto-update-reloaded-version";
const AUTO_RELOAD_COUNT_KEY = "novae:auto-update-reloaded-count";
const LAST_VERSION_CHECK_KEY = "novae:last-version-check-at";
const VERSION_CHECK_INTERVAL_MS = 30 * 60_000;
const VERSION_CHECK_TIMEOUT_MS = 2_000;
const SERVICE_WORKER_PREPARE_TIMEOUT_MS = 2_000;
const RELOAD_NAVIGATION_RETRY_MS = 4_000;
const RELOAD_RECOVERY_TIMEOUT_MS = 10_000;
const MAX_AUTO_RELOAD_ATTEMPTS = 2;
const UPDATE_SUCCESS_HOLD_MS = 500;

export function AppUpdateGate() {
  useLocaleSubscription();
  // A security check lives in an iframe that holds all of its own state, so
  // reloading the document while one is on screen throws the check away: the
  // visitor is left on a sign-in page with no check on it and no way past it.
  // A new version can wait for the few seconds an answer takes.
  const { verifying } = useTurnstile();
  const [availableVersion, setAvailableVersion] = React.useState("");
  const [reloading, setReloading] = React.useState(false);
  const [updateComplete, setUpdateComplete] = React.useState(false);
  const [promptVisible, setPromptVisible] = React.useState(false);
  const updateDeferred = useUpdateDeferral();
  const lastCheckedAt = React.useRef(0);
  const checking = React.useRef(false);
  const reloadInFlight = React.useRef(false);

  const check = React.useCallback(async () => {
    const now = Date.now();
    const storedCheckedAt = Number.parseInt(
      readLocalStorage(LAST_VERSION_CHECK_KEY) ?? "0",
      10,
    );
    const latestCheckedAt = Math.max(
      lastCheckedAt.current,
      Number.isFinite(storedCheckedAt) ? storedCheckedAt : 0,
    );
    if (
      checking.current ||
      now - latestCheckedAt < VERSION_CHECK_INTERVAL_MS
    ) {
      return;
    }
    checking.current = true;
    lastCheckedAt.current = now;
    writeLocalStorage(LAST_VERSION_CHECK_KEY, String(now));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS);
    try {
      const response = await fetch("/version.json", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const data = (await response.json()) as { version?: string };
      if (data.version && data.version !== currentVersion)
        setAvailableVersion(data.version);
    } catch {
      // Version checks are opportunistic and must never block the app.
    } finally {
      window.clearTimeout(timeout);
      checking.current = false;
    }
  }, []);

  React.useEffect(() => {
    void check();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, VERSION_CHECK_INTERVAL_MS);
    const online = () => void check();
    const resume = () => {
      if (Date.now() - lastCheckedAt.current >= VERSION_CHECK_INTERVAL_MS)
        void check();
    };
    window.addEventListener("online", online);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [check]);

  React.useEffect(() => {
    if (!availableVersion || verifying || updateDeferred) return;
    if (!canAutoReload(availableVersion)) {
      setPromptVisible(true);
      return;
    }
    void reload({ automatic: true });
    // The first unseen version automatically reloads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableVersion, updateDeferred, verifying]);

  function readReloadCount(version: string) {
    try {
      const storedVersion = sessionStorage.getItem(AUTO_RELOAD_KEY);
      if (storedVersion !== version) return 0;
      const count = Number.parseInt(sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || "0", 10);
      return Number.isFinite(count) && count > 0 ? count : 0;
    } catch {
      return 0;
    }
  }

  function canAutoReload(version: string) {
    return readReloadCount(version) < MAX_AUTO_RELOAD_ATTEMPTS;
  }

  function markAutoReload(version: string) {
    try {
      const count = readReloadCount(version);
      sessionStorage.setItem(AUTO_RELOAD_KEY, version);
      sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, String(count + 1));
    } catch {
      // Storage is optional; the navigation remains the source of truth.
    }
  }

  async function prepareServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      SERVICE_WORKER_PREPARE_TIMEOUT_MS,
    );
    try {
      const timeoutError = () => new Error("service worker update timed out");
      const registration = await raceWithAbort(
        controller.signal,
        () => navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          type: "module",
          updateViaCache: "none",
        }),
        timeoutError,
      );
      await raceWithAbort(
        controller.signal,
        () => registration.update(),
        timeoutError,
      );
      const candidate = registration.waiting ?? registration.installing;
      if (!candidate || controller.signal.aborted) return;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          candidate.removeEventListener("statechange", handleStateChange);
          navigator.serviceWorker.removeEventListener("controllerchange", finish);
          resolve();
        };
        const handleStateChange = () => {
          if (candidate.state === "activated" || candidate.state === "redundant") finish();
        };
        candidate.addEventListener("statechange", handleStateChange);
        navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
        controller.signal.addEventListener("abort", finish, { once: true });
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        handleStateChange();
      });
    } catch {
      // A failed SW update must not prevent the document from refreshing.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function reload(options: { automatic?: boolean } = {}) {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    setReloading(true);
    setUpdateComplete(false);
    await prepareServiceWorker();
    if (options.automatic && hasUpdateDeferral()) {
      reloadInFlight.current = false;
      setReloading(false);
      return;
    }
    if (options.automatic && availableVersion) markAutoReload(availableVersion);
    setUpdateComplete(true);
    await new Promise((resolve) =>
      window.setTimeout(resolve, UPDATE_SUCCESS_HOLD_MS),
    );
    window.setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        setPromptVisible(true);
        reloadInFlight.current = false;
        setReloading(false);
        setUpdateComplete(false);
      }
    }, RELOAD_NAVIGATION_RETRY_MS);
    window.setTimeout(() => {
      setPromptVisible(true);
      reloadInFlight.current = false;
      setReloading(false);
      setUpdateComplete(false);
    }, RELOAD_RECOVERY_TIMEOUT_MS);
    try {
      window.location.replace(window.location.href);
    } catch {
      window.location.reload();
    }
  }

  return (
    <>
      <Dialog open={promptVisible && !reloading && !verifying && !updateDeferred}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{translate('ui.update.title')}</DialogTitle>
            <DialogDescription>{translate('ui.update.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => void reload()}>
              <RefreshCw />{translate('ui.update.action')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnimatePresence>
      {reloading ? (
        <motion.div
          aria-live="assertive"
          className="fixed inset-0 z-[100] grid place-items-center bg-background/72 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={timing("sheetExit")}
        >
          <div className="t-update-stage flex w-[min(20rem,calc(100%-2rem))] flex-col items-center gap-4 text-center">
            <BrandLockup
              className="flex-col gap-2 [&>span:last-child]:text-xl"
              markClassName="size-20 rounded-3xl p-4"
            />
            <ActionFeedbackIcon
              className="[&>svg]:size-5"
              state={updateComplete ? "success" : "loading"}
              surface="disc"
            />
            <p
              className="t-shimmer text-sm font-medium"
              data-text={translate('ui.update.loading')}
            >{translate('ui.update.loading')}</p>
            <span className="t-progress-track" aria-hidden>
              <span />
            </span>
          </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}
