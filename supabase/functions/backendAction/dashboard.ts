import { asRecord, asString } from "../_shared/http.ts";
import { ISSUE_CATEGORIES } from "../_shared/issue-categories.ts";
import type { BackendSupabase } from "./types.ts";
import { toMs } from "./utils.ts";

function asCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function categoryCounts(value: unknown) {
  const source = asRecord(value);
  return Object.fromEntries(ISSUE_CATEGORIES.map((category) => [
    category.id,
    asCount(source[category.id]),
  ]));
}

export async function getPlatformDashboard(supabase: BackendSupabase) {
  const { data, error } = await supabase.schema("app_api").rpc("get_platform_dashboard_snapshot");
  if (error) throw error;
  const snapshot = asRecord(data);
  const counters = asRecord(snapshot.counters);
  const maintenance = asRecord(snapshot.maintenance);
  const maintenanceDetails = asRecord(maintenance.details);
  const failedDeletionJobs = Math.max(
    asCount(maintenanceDetails.failed_deletion_jobs),
    asCount(maintenanceDetails.failed_deletion_jobs_too_old),
  );
  const failedMaintenanceTasks = failedDeletionJobs > 0
    ? ["刪除工作失敗過久"]
    : [];
  const outboxFailed = asCount(snapshot.outbox_failed);
  const outboxPending = asCount(snapshot.outbox_pending);
  const pushFailed = asCount(snapshot.push_failed);
  const deletionFailed = asCount(snapshot.deletion_failed);
  const deletionPending = asCount(snapshot.deletion_pending);
  const uploadPending = asCount(snapshot.upload_pending);
  const recentFailures = Array.isArray(snapshot.recent_failures)
    ? snapshot.recent_failures.map((entry) => {
      const failure = asRecord(entry);
      return {
        id: asString(failure.id),
        attempt_count: asCount(failure.attempt_count),
        created_at_ms: toMs(failure.created_at),
        detail_type: asString(failure.detail_type),
        message: asString(failure.message),
        next_attempt_at_ms: toMs(failure.next_attempt_at),
        source: asString(failure.source, "outbox"),
        status: asString(failure.status),
        target_id: asString(failure.target_id),
        target_type: asString(failure.target_type),
        updated_at_ms: toMs(failure.updated_at),
      };
    })
    : [];

  return {
    stats: {
      comments_by_category: categoryCounts(snapshot.comments_by_category),
      issues_by_category: categoryCounts(snapshot.issues_by_category),
      last_activity_at_ms: toMs(snapshot.last_activity_at),
      total_comments_created: asCount(counters.comments_created),
      total_comments_deleted: asCount(counters.comments_deleted),
      total_issues_created: asCount(counters.issues_created),
      total_issues_deleted: asCount(counters.issues_deleted),
      total_supports_added: asCount(counters.supports_added),
      total_supports_removed: asCount(counters.supports_removed),
      total_users_seen: asCount(snapshot.users_seen),
      updated_at_ms: Date.now(),
    },
    operations: {
      cleanup_backlog_capped: false,
      cleanup_backlog_count: deletionPending,
      failed_notion_sync_capped: false,
      failed_notion_sync_count: asCount(snapshot.notion_failed),
      failed_outbox_capped: false,
      failed_outbox_count: outboxFailed,
      failed_push_delivery_capped: false,
      failed_push_delivery_count: pushFailed,
      next_sync_count: asCount(snapshot.notion_pending),
      oldest_pending_sync_at_ms: toMs(snapshot.oldest_pending_notion_at),
      overall_status: outboxFailed > 0 || pushFailed > 0 || deletionFailed > 0
        ? "critical"
        : outboxPending > 0 || deletionPending > 0 || uploadPending > 0
          ? "attention"
          : "healthy",
      pending_notion_sync_capped: false,
      pending_notion_sync_count: asCount(snapshot.notion_pending),
      recent_failures: recentFailures,
      scheduled_maintenance: {
        completed_at_ms: toMs(maintenance.completed_at),
        error: asString(maintenance.error),
        failed_tasks: failedMaintenanceTasks,
        started_at_ms: toMs(maintenance.started_at),
        status: asString(maintenance.status, "idle"),
        updated_at_ms: toMs(maintenance.completed_at ?? maintenance.started_at),
      },
      stuck_upload_capped: false,
      stuck_upload_count: uploadPending,
    },
  };
}
