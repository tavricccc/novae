"use client";

import * as React from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { useRememberedState } from "@/hooks/use-remembered-state";
import { useForegroundPoll } from "@/hooks/use-foreground-poll";
import {
  clearOperationalErrors,
  clearScheduledWork,
  fetchOperationsConsole,
  fetchOperationsProgress,
  queueNotionArchiveRebuild,
  retryOperationalWork,
  type OperationsConsole,
} from "@/services/operations-console";

export type { OperationsConsole } from "@/services/operations-console";

export type RetryKind = "cleanup" | "delivery" | "job";

const isRunning = (job: { status: string }) =>
  job.status === "pending" || job.status === "processing";

interface SystemReading {
  page: number;
  snapshot: Partial<OperationsConsole> | null;
}

/**
 * Everything the platform is currently failing to finish, in one place.
 *
 * Retries used to live in three unrelated screens, each with its own idea of
 * what happens afterwards. Here a retry removes the row it belongs to and
 * leaves the rest of the screen alone, because re-reading the whole console to
 * learn that one entry is gone is how the expanded rows and the scroll position
 * used to disappear. The reading itself is kept, so returning to the screen
 * shows what it last said instead of asking again. The ten readings behind it
 * arrive one at a time, and each panel fills in as its own lands.
 */
export function useSystemConsole() {
  const { t } = useI18n();
  const { cold, remember, value } = useRememberedState<SystemReading>("admin-system", {
    page: 0,
    snapshot: null,
  });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [retrying, setRetrying] = React.useState("");
  const [clearing, setClearing] = React.useState<"errors" | "schedules" | "">("");
  const [rebuildingNotion, setRebuildingNotion] = React.useState(false);
  const readingVersion = React.useRef(0);

  const read = React.useCallback(
    async (nextPage: number) => {
      readingVersion.current += 1;
      const console_ = await fetchOperationsConsole({ page: nextPage }, {
        onPanel: (panel) => remember((current) => ({
          ...current,
          page: nextPage,
          snapshot: { ...current.snapshot, ...panel },
        })),
      });
      remember({ page: nextPage, snapshot: console_ });
    },
    [remember],
  );

  const load = React.useCallback(
    async (nextPage = 0) => {
      setLoading(true);
      setError("");
      try {
        await read(nextPage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
    },
    [read],
  );

  React.useEffect(() => {
    if (cold) void load();
  }, [cold, load]);

  const working = (value.snapshot?.jobs ?? []).some(isRunning);
  useForegroundPoll(async () => {
    const version = readingVersion.current;
    const { jobs } = await fetchOperationsProgress(value.page);
    // An explicit refresh owns its result even if an earlier poll finishes later.
    if (version !== readingVersion.current) return;
    remember((current) => current.page !== value.page ? current : {
      ...current,
      snapshot: current.snapshot && { ...current.snapshot, jobs },
    });
  }, working && !loading, { initialDelayMs: 4000 });

  const retry = React.useCallback(
    async (kind: RetryKind, id: string) => {
      setRetrying(id);
      try {
        await retryOperationalWork({ id, kind });
        remember((current) => ({
          ...current,
          snapshot: current.snapshot && {
            ...current.snapshot,
            cleanupBacklog: current.snapshot.cleanupBacklog?.filter(
              (entry) => entry.jobId !== id,
            ),
            failedDeliveries: current.snapshot.failedDeliveries?.filter(
              (entry) => entry.id !== id,
            ),
            jobs: current.snapshot.jobs?.filter((entry) => entry.id !== id),
          },
        }));
        toast.success(t("admin.retryQueued"));
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : t("ui.common.operationFailed"));
      } finally {
        setRetrying("");
      }
    },
    [remember, t],
  );

  /**
   * Everything that failed, asked for again in one write.
   *
   * Row by row this was one admin write per failure, and an outage that left a
   * page of them behind ran the administrator into their own rate limit before
   * the list was clear. The whole reading is taken again afterwards, because
   * this changes every panel on the screen rather than one row of one.
   */
  const retryAll = React.useCallback(async () => {
    setRetrying("all");
    try {
      const result = await retryOperationalWork({ kind: "all" });
      toast.success(t("admin.retryAllQueued", { count: result.retried ?? 0 }));
      await load(value.page);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("ui.common.operationFailed"));
    } finally {
      setRetrying("");
    }
  }, [load, t, value.page]);

  const clearErrors = React.useCallback(async () => {
    setClearing("errors");
    try {
      const result = await clearOperationalErrors({});
      toast.success(t("admin.clearErrorsDone", { count: result.cleared }));
      await load(value.page);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("ui.common.operationFailed"));
    } finally {
      setClearing("");
    }
  }, [load, t, value.page]);

  const clearSchedules = React.useCallback(async () => {
    setClearing("schedules");
    try {
      const result = await clearScheduledWork({});
      toast.success(t("admin.clearSchedulesDone", { count: result.cleared }));
      await load(value.page);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("ui.common.operationFailed"));
    } finally {
      setClearing("");
    }
  }, [load, t, value.page]);

  const rebuildNotion = React.useCallback(async () => {
    setRebuildingNotion(true);
    try {
      const result = await queueNotionArchiveRebuild({});
      const cleared = result.cleared;
      // The console refreshes one panel at a time. Without an immediate jobs
      // replacement, the previous reading stays on screen until the jobs panel
      // happens to arrive, which made superseded deletion work look as if it
      // were the rebuild itself. Seed the one job this action just created; the
      // streamed jobs panel will replace it with the real progress moments later.
      remember((current) => ({
        ...current,
        page: 0,
        snapshot: current.snapshot && {
          ...current.snapshot,
          jobs: [{
            affectedRows: 0,
            attemptCount: 0,
            errorDetail: null,
            estimatedRows: 0,
            id: result.jobId,
            jobType: "notion_reconcile",
            lastAttemptId: null,
            processedRows: 0,
            status: "pending",
            updatedAt: new Date().toISOString(),
          }],
        },
      }));
      toast.success(t("ui.operations.notionRebuildQueued", {
        cleared: cleared.cleanup + cleared.deliveries + cleared.jobs + cleared.mappings,
      }));
      await load(0);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("ui.operations.notionRebuildFailed"));
    } finally {
      setRebuildingNotion(false);
    }
  }, [load, remember, t]);

  return {
    clearErrors,
    clearSchedules,
    clearing,
    error,
    load,
    loading,
    notionJob: (value.snapshot?.jobs ?? []).find(
      (job) => job.jobType === "notion_reconcile" && isRunning(job),
    ) ?? null,
    page: value.page,
    rebuildNotion,
    rebuildingNotion,
    retry,
    retryAll,
    retrying,
    snapshot: value.snapshot,
  };
}
