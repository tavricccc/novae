import assert from "node:assert/strict";
import { DATA_RETENTION } from "../../supabase/functions/_shared/data-retention.ts";
import {
  asRecord,
  callAction,
  integrationTest,
  requestId,
  seedActor,
  supabase,
  tableRow,
} from "./helpers.ts";

const DAY_MS = 86_400_000;

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required for local integration tests.`);
  return value;
}

async function expectPresent(table: Parameters<typeof tableRow>[0], column: string, value: string) {
  assert.ok(await tableRow(table, column, value), `${table}.${column}=${value} should be retained`);
}

async function expectRemoved(table: Parameters<typeof tableRow>[0], column: string, value: string) {
  assert.equal(await tableRow(table, column, value), null, `${table}.${column}=${value} should be removed`);
}

integrationTest("configured retention cleanup removes every expired data class and preserves fresh rows", async () => {
  const runId = crypto.randomUUID();
  const expiredAt = new Date(Date.now() - 4_000 * DAY_MS).toISOString();
  const recentAt = new Date(Date.now() - 60_000).toISOString();
  const futureAt = new Date(Date.now() + DAY_MS).toISOString();
  const admin = await seedActor(`retention-admin-${runId}`, { roles: ["platform-admin"] });
  const owner = await seedActor(`retention-owner-${runId}`);
  const avatarOwner = await seedActor(`retention-avatar-${runId}`);

  const { data: issueCategories, error: issueCategoryError } = await supabase.schema("app_private")
    .from("issue_categories").select("id").eq("is_active", true).order("sort_order");
  if (issueCategoryError) throw issueCategoryError;
  const { data: facilityCategories, error: facilityCategoryError } = await supabase.schema("app_private")
    .from("facility_categories").select("id").eq("is_active", true).order("sort_order");
  if (facilityCategoryError) throw facilityCategoryError;
  const issueCategoryIds = (issueCategories ?? []).map((row) => String(row.id));
  const facilityCategoryId = String(facilityCategories?.[0]?.id ?? "");
  assert.ok(issueCategoryIds.length > 0);
  assert.ok(facilityCategoryId);

  const createClosedIssue = async (label: string, closedAt: string) => {
    const created = asRecord(await callAction("createIssue", {
      category: issueCategoryIds[0],
      content: `Retention ${label} issue content`,
      requestId: requestId(`retention-${label}-issue`),
      title: `Retention ${label} issue`,
    }, owner.auth));
    const id = String(asRecord(created.issue).id);
    const { error } = await supabase.schema("app_private").from("issues").update({
      closed_at: closedAt,
      status: "completed",
    }).eq("id", id);
    if (error) throw error;
    return id;
  };
  const createClosedFacility = async (label: string, closedAt: string) => {
    const created = asRecord(await callAction("createFacility", {
      categoryId: facilityCategoryId,
      content: `Retention ${label} facility content`,
      location: "Retention room",
      requestId: requestId(`retention-${label}-facility`),
      title: `Retention ${label} facility`,
    }, owner.auth));
    const id = String(asRecord(created.facility).id);
    const { error } = await supabase.schema("app_private").from("facility_reports").update({
      closed_at: closedAt,
      status: "completed",
    }).eq("id", id);
    if (error) throw error;
    return id;
  };

  const expiredIssueId = await createClosedIssue("expired", expiredAt);
  const recentIssueId = await createClosedIssue("recent", recentAt);
  const expiredFacilityId = await createClosedFacility("expired", expiredAt);
  const recentFacilityId = await createClosedFacility("recent", recentAt);
  const { error: notionError } = await supabase.schema("app_private").from("notion_pages").insert([
    { notion_page_id: `notion-issue-${runId}`, target_id: expiredIssueId, target_type: "issue" },
    { notion_page_id: `notion-facility-${runId}`, target_id: expiredFacilityId, target_type: "facility" },
  ]);
  if (notionError) throw notionError;

  const expiredNotificationId = crypto.randomUUID();
  const recentNotificationId = crypto.randomUUID();
  const { error: notificationError } = await supabase.schema("app_private").from("notifications").insert([
    {
      created_at: expiredAt,
      expires_at: futureAt,
      id: expiredNotificationId,
      recipient_uid: owner.auth.uid,
      source: "user",
      target_id: `retention-expired-${runId}`,
      target_type: "issue",
      title: "Expired retention notification",
      type: "integration_retention",
    },
    {
      created_at: recentAt,
      expires_at: expiredAt,
      id: recentNotificationId,
      recipient_uid: owner.auth.uid,
      source: "user",
      target_id: `retention-recent-${runId}`,
      target_type: "issue",
      title: "Recent retention notification",
      type: "integration_retention",
    },
  ]);
  if (notificationError) throw notificationError;

  const expiredRealtimeId = crypto.randomUUID();
  const recentRealtimeId = crypto.randomUUID();
  const { error: realtimeError } = await supabase.schema("app_private").from("realtime_events").insert([
    {
      created_at: expiredAt,
      event_type: "issue_changed",
      expires_at: futureAt,
      id: expiredRealtimeId,
      target_id: `retention-expired-${runId}`,
      target_type: "issue",
    },
    {
      created_at: recentAt,
      event_type: "issue_changed",
      expires_at: expiredAt,
      id: recentRealtimeId,
      target_id: `retention-recent-${runId}`,
      target_type: "issue",
    },
  ]);
  if (realtimeError) throw realtimeError;

  const outboxIds = {
    expiredCompleted: crypto.randomUUID(),
    expiredFailed: crypto.randomUUID(),
    recentCompleted: crypto.randomUUID(),
    recentFailed: crypto.randomUUID(),
  };
  const { error: outboxError } = await supabase.schema("app_private").from("outbox_events").insert([
    { actor_uid: owner.auth.uid, event_type: "facility.deleted", expires_at: futureAt, id: outboxIds.expiredCompleted, payload: { retention_cleanup: true }, status: "completed", target_id: `expired-completed-${runId}`, target_type: "facility", updated_at: expiredAt },
    { actor_uid: owner.auth.uid, event_type: "facility.deleted", expires_at: futureAt, id: outboxIds.expiredFailed, payload: { retention_cleanup: true }, status: "failed", target_id: `expired-failed-${runId}`, target_type: "facility", updated_at: expiredAt },
    { actor_uid: owner.auth.uid, event_type: "facility.deleted", expires_at: expiredAt, id: outboxIds.recentCompleted, payload: { retention_cleanup: true }, status: "completed", target_id: `recent-completed-${runId}`, target_type: "facility", updated_at: recentAt },
    { actor_uid: owner.auth.uid, event_type: "facility.deleted", expires_at: expiredAt, id: outboxIds.recentFailed, payload: { retention_cleanup: true }, status: "failed", target_id: `recent-failed-${runId}`, target_type: "facility", updated_at: recentAt },
  ]);
  if (outboxError) throw outboxError;

  const pushLogIds = { expiredFailed: crypto.randomUUID(), expiredSent: crypto.randomUUID(), recent: crypto.randomUUID() };
  const { error: pushLogError } = await supabase.schema("app_private").from("push_delivery_logs").insert([
    { id: pushLogIds.expiredSent, notification_type: "retention", status: "sent", target_id: runId, target_type: "issue", token_uid: owner.auth.uid, updated_at: expiredAt },
    { id: pushLogIds.expiredFailed, notification_type: "retention", status: "failed", target_id: runId, target_type: "issue", token_uid: owner.auth.uid, updated_at: expiredAt },
    { id: pushLogIds.recent, notification_type: "retention", status: "sent", target_id: runId, target_type: "issue", token_uid: owner.auth.uid, updated_at: recentAt },
  ]);
  if (pushLogError) throw pushLogError;

  const idempotencyRequests = { expired: `expired-${runId}`, recent: `recent-${runId}` };
  const { error: idempotencyError } = await supabase.schema("app_private").from("idempotency_keys").insert([
    { action: "retention-test", expires_at: futureAt, request_id: idempotencyRequests.expired, status: "completed", uid: owner.auth.uid, updated_at: expiredAt },
    { action: "retention-test", expires_at: expiredAt, request_id: idempotencyRequests.recent, status: "completed", uid: owner.auth.uid, updated_at: recentAt },
  ]);
  if (idempotencyError) throw idempotencyError;

  const tokenDevices = { denied: `denied-${runId}`, expired: `expired-${runId}`, recent: `recent-${runId}` };
  const { error: tokenError } = await supabase.schema("app_private").from("push_tokens").insert([
    { device_id: tokenDevices.expired, permission: "granted", platform: "integration", token: `expired-${runId}`, uid: owner.auth.uid, updated_at: expiredAt, user_agent: "retention" },
    { device_id: tokenDevices.denied, permission: "denied", platform: "integration", token: `denied-${runId}`, uid: owner.auth.uid, updated_at: recentAt, user_agent: "retention" },
    { device_id: tokenDevices.recent, permission: "granted", platform: "integration", token: `recent-${runId}`, uid: owner.auth.uid, updated_at: recentAt, user_agent: "retention" },
  ]);
  if (tokenError) throw tokenError;

  const deletionTargets = {
    expiredCompleted: `expired-completed-${runId}`,
    expiredFailed: `expired-failed-${runId}`,
    recentCompleted: `recent-completed-${runId}`,
    recentFailed: `recent-failed-${runId}`,
  };
  const { error: deletionError } = await supabase.schema("app_private").from("deletion_jobs").insert([
    { status: "completed", target_id: deletionTargets.expiredCompleted, target_type: "integration", updated_at: expiredAt },
    { status: "failed", target_id: deletionTargets.expiredFailed, target_type: "integration", updated_at: expiredAt },
    { status: "completed", target_id: deletionTargets.recentCompleted, target_type: "integration", updated_at: recentAt },
    { status: "failed", target_id: deletionTargets.recentFailed, target_type: "integration", updated_at: recentAt },
  ]);
  if (deletionError) throw deletionError;

  const auditUids = { expired: `audit-expired-${runId}`, recent: `audit-recent-${runId}` };
  const { error: auditError } = await supabase.schema("app_private").from("role_assignment_audit").insert([
    { actor_uid: admin.auth.uid, created_at: expiredAt, operation: "grant", role_code: "announcement-manager", uid: auditUids.expired },
    { actor_uid: admin.auth.uid, created_at: recentAt, operation: "grant", role_code: "announcement-manager", uid: auditUids.recent },
  ]);
  if (auditError) throw auditError;

  const oldMaintenanceId = crypto.randomUUID();
  const recentMaintenanceId = crypto.randomUUID();
  const { error: maintenanceSeedError } = await supabase.schema("app_private").from("maintenance_runs").insert([
    { id: oldMaintenanceId, started_at: expiredAt, status: "success", task_name: "maintenance.cleanup" },
    { id: recentMaintenanceId, started_at: recentAt, status: "success", task_name: "maintenance.cleanup" },
  ]);
  if (maintenanceSeedError) throw maintenanceSeedError;

  const uploadIds = {
    attached: crypto.randomUUID(),
    failed: crypto.randomUUID(),
    pending: crypto.randomUUID(),
    readyUnattached: crypto.randomUUID(),
    recentPending: crypto.randomUUID(),
  };
  const upload = (id: string, status: string, timestamp: string, attached = false) => ({
    attached_target_id: attached ? crypto.randomUUID() : null,
    attached_target_type: attached ? "issue" : null,
    cloudinary_public_id: `retention/${id}`,
    created_at: timestamp,
    id,
    owner_uid: owner.auth.uid,
    status,
    updated_at: timestamp,
    visibility: "authenticated",
  });
  const { error: uploadError } = await supabase.schema("app_private").from("uploads").insert([
    upload(uploadIds.pending, "pending", expiredAt),
    upload(uploadIds.readyUnattached, "ready", expiredAt),
    upload(uploadIds.failed, "failed", expiredAt),
    upload(uploadIds.recentPending, "pending", recentAt),
    upload(uploadIds.attached, "ready", recentAt, true),
  ]);
  if (uploadError) throw uploadError;

  const { data: cleanup, error: cleanupError } = await supabase.schema("app_api")
    .rpc("run_maintenance_cleanup", {
      retention_config: DATA_RETENTION,
      valid_issue_categories: issueCategoryIds,
    });
  if (cleanupError) throw cleanupError;
  const result = asRecord(cleanup);
  const details = asRecord(result.details);
  assert.equal(result.ok, true);
  assert.equal(result.status, "attention");
  for (const [key, minimum] of Object.entries({
    deletion_jobs_deleted: 2,
    expired_closed_facilities_deleted: 1,
    expired_closed_facility_notion_deletions_queued: 1,
    expired_closed_issues_deleted: 1,
    expired_closed_issue_notion_deletions_queued: 1,
    idempotency_keys_deleted: 1,
    maintenance_runs_deleted: 0,
    notifications_deleted: 1,
    outbox_events_deleted: 2,
    push_delivery_logs_deleted: 2,
    push_tokens_deleted: 2,
    realtime_events_deleted: 1,
    role_assignment_audit_deleted: 1,
    uploads_deleted: 3,
    uploads_queued_for_deletion: 3,
  })) {
    if (key === "maintenance_runs_deleted") continue;
    assert.ok(Number(details[key]) >= minimum, `${key} should be at least ${minimum}`);
  }

  await expectRemoved("issues", "id", expiredIssueId);
  await expectPresent("issues", "id", recentIssueId);
  await expectRemoved("facility_reports", "id", expiredFacilityId);
  await expectPresent("facility_reports", "id", recentFacilityId);
  await expectRemoved("notifications", "id", expiredNotificationId);
  await expectPresent("notifications", "id", recentNotificationId);
  await expectRemoved("realtime_events", "id", expiredRealtimeId);
  await expectPresent("realtime_events", "id", recentRealtimeId);
  await expectRemoved("outbox_events", "id", outboxIds.expiredCompleted);
  await expectRemoved("outbox_events", "id", outboxIds.expiredFailed);
  await expectPresent("outbox_events", "id", outboxIds.recentCompleted);
  await expectPresent("outbox_events", "id", outboxIds.recentFailed);
  await expectRemoved("push_delivery_logs", "id", pushLogIds.expiredSent);
  await expectRemoved("push_delivery_logs", "id", pushLogIds.expiredFailed);
  await expectPresent("push_delivery_logs", "id", pushLogIds.recent);
  await expectRemoved("idempotency_keys", "request_id", idempotencyRequests.expired);
  await expectPresent("idempotency_keys", "request_id", idempotencyRequests.recent);
  await expectRemoved("push_tokens", "device_id", tokenDevices.expired);
  await expectRemoved("push_tokens", "device_id", tokenDevices.denied);
  await expectPresent("push_tokens", "device_id", tokenDevices.recent);
  await expectRemoved("deletion_jobs", "target_id", deletionTargets.expiredCompleted);
  await expectRemoved("deletion_jobs", "target_id", deletionTargets.expiredFailed);
  await expectPresent("deletion_jobs", "target_id", deletionTargets.recentCompleted);
  await expectPresent("deletion_jobs", "target_id", deletionTargets.recentFailed);
  await expectRemoved("role_assignment_audit", "uid", auditUids.expired);
  await expectPresent("role_assignment_audit", "uid", auditUids.recent);
  await expectRemoved("maintenance_runs", "id", oldMaintenanceId);
  await expectPresent("maintenance_runs", "id", recentMaintenanceId);
  await expectRemoved("uploads", "id", uploadIds.pending);
  await expectRemoved("uploads", "id", uploadIds.readyUnattached);
  await expectRemoved("uploads", "id", uploadIds.failed);
  await expectPresent("uploads", "id", uploadIds.recentPending);
  await expectPresent("uploads", "id", uploadIds.attached);
  for (const id of [uploadIds.pending, uploadIds.readyUnattached, uploadIds.failed]) {
    await expectPresent("deletion_jobs", "target_id", id);
  }

  const { data: retentionEvents, error: retentionEventError } = await supabase.schema("app_private")
    .from("outbox_events").select("event_type,payload,target_id")
    .in("target_id", [expiredIssueId, expiredFacilityId]);
  if (retentionEventError) throw retentionEventError;
  const scheduledDeletionEvents = (retentionEvents ?? []).filter((event) =>
    asRecord(event.payload).retention_cleanup === true
  );
  assert.equal(scheduledDeletionEvents.length, 2);
  assert.deepEqual(
    new Set(scheduledDeletionEvents.map((event) => event.event_type)),
    new Set(["issue.deleted", "facility.deleted"]),
  );
  const { count: retentionNotificationCount, error: retentionNotificationError } = await supabase
    .schema("app_private").from("notifications").select("id", { count: "exact", head: true })
    .in("target_id", [expiredIssueId, expiredFacilityId]);
  if (retentionNotificationError) throw retentionNotificationError;
  assert.equal(retentionNotificationCount, 0, "scheduled retention deletion must not notify users");

  const headers = {
    authorization: `Bearer ${requiredEnv("WEBHOOK_SECRET")}`,
    "x-novae-origin-secret": requiredEnv("EDGE_ORIGIN_SECRET"),
  };
  const functionsUrl = requiredEnv("SUPABASE_FUNCTIONS_URL").replace(/\/+$/u, "");
  const staleUploadIds = [uploadIds.pending, uploadIds.readyUnattached, uploadIds.failed];
  const currentAvatarPublicId = `srp/avatars/${avatarOwner.auth.uid}_current`;
  const oldAvatarPublicId = `srp/avatars/${owner.auth.uid}_old`;
  const { error: avatarProfileError } = await supabase.schema("app_private").from("user_profiles")
    .update({ avatar_public_id: currentAvatarPublicId }).eq("uid", avatarOwner.auth.uid);
  if (avatarProfileError) throw avatarProfileError;
  const { error: avatarJobsError } = await supabase.schema("app_private").from("deletion_jobs").insert([
    {
      cloudinary_public_id: currentAvatarPublicId,
      target_id: avatarOwner.auth.uid,
      target_type: "avatar",
    },
    {
      cloudinary_public_id: oldAvatarPublicId,
      target_id: owner.auth.uid,
      target_type: "avatar",
    },
  ]);
  if (avatarJobsError) throw avatarJobsError;
  const deletionTargetIds = [...staleUploadIds, avatarOwner.auth.uid, owner.auth.uid];
  let completedUploadJobs: Array<{ status: string; target_id: string }> = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${functionsUrl}/processDeletionJobs`, { headers, method: "POST" });
    assert.ok(response.ok || response.status === 429, `deletion worker returned ${response.status}`);
    const { data, error } = await supabase.schema("app_private").from("deletion_jobs")
      .select("status,target_id").in("target_id", deletionTargetIds);
    if (error) throw error;
    completedUploadJobs = data ?? [];
    if (completedUploadJobs.length === deletionTargetIds.length
      && completedUploadJobs.every((job) => job.status === "completed")) break;
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  assert.equal(completedUploadJobs.length, deletionTargetIds.length);
  assert.ok(completedUploadJobs.every((job) => job.status === "completed"));

  const providerUrl = requiredEnv("FCM_EMULATOR_URL").replace("host.docker.internal", "127.0.0.1");
  const providerResponse = await fetch(`${providerUrl}/__requests`);
  assert.equal(providerResponse.status, 200);
  const providerRequests = (await providerResponse.json()) as {
    requests: Array<{ body: Record<string, unknown>; path: string }>;
  };
  const destroyedPublicIds = new Set(providerRequests.requests
    .filter((request) => request.path.endsWith("/image/destroy"))
    .map((request) => String(request.body.public_id)));
  for (const id of staleUploadIds) assert.ok(destroyedPublicIds.has(`retention/${id}`));
  assert.ok(destroyedPublicIds.has(oldAvatarPublicId), "superseded avatar must be deleted");
  assert.equal(destroyedPublicIds.has(currentAvatarPublicId), false, "current avatar must never be deleted");

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const maintenanceResponse = await fetch(`${functionsUrl}/maintenanceCleanup`, { headers, method: "POST" });
  assert.equal(maintenanceResponse.status, 200);
  const maintenanceBody = asRecord(await maintenanceResponse.json());
  assert.equal(maintenanceBody.ok, true);
  assert.equal(Array.isArray(maintenanceBody.workers), true);
  assert.equal((maintenanceBody.workers as unknown[]).length, 2);
  const { count: postWorkerDeletionNotificationCount, error: postWorkerNotificationError } = await supabase
    .schema("app_private").from("notifications").select("id", { count: "exact", head: true })
    .eq("target_id", expiredIssueId)
    .eq("type", "issue_deleted");
  if (postWorkerNotificationError) throw postWorkerNotificationError;
  assert.equal(postWorkerDeletionNotificationCount, 0, "retention deletion must stay silent after outbox processing");
  const { count: retainedNotionMappings, error: retainedNotionMappingError } = await supabase
    .schema("app_private").from("notion_pages").select("target_id", { count: "exact", head: true })
    .in("target_id", [expiredIssueId, expiredFacilityId]);
  if (retainedNotionMappingError) throw retainedNotionMappingError;
  assert.equal(retainedNotionMappings, 0, "retention cleanup should forget local Notion mappings");

  const postMaintenanceProviderResponse = await fetch(`${providerUrl}/__requests`);
  assert.equal(postMaintenanceProviderResponse.status, 200);
  const postMaintenanceProviderRequests = (await postMaintenanceProviderResponse.json()) as {
    requests: Array<{ body: Record<string, unknown>; path: string }>;
  };
  const retainedNotionPageIds = [`notion-issue-${runId}`, `notion-facility-${runId}`];
  assert.equal(
    postMaintenanceProviderRequests.requests.some((request) =>
      retainedNotionPageIds.some((pageId) => request.path.includes(`/pages/${pageId}`))
    ),
    false,
    "retention cleanup must leave the Notion archive pages untouched",
  );
});
