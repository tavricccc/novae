import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { requireEnv } from "../_shared/env.ts";
import { isInvalidFcmTokenError, sendFcmMessage } from "../_shared/fcm.ts";
import { errorMessage, jsonResponse, operationalErrorSummary, requireMethod } from "../_shared/http.ts";
import {
  markNotionPageDeleted,
  syncAnnouncementCreatedToNotion,
  syncIssueCommentToNotion,
  syncIssueCreatedToNotion,
  syncIssueSupportToNotion,
  syncIssueStatusChangedToNotion,
} from "../_shared/notion.ts";
import { requireBearerSecret } from "../_shared/webhook.ts";

interface OutboxEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  target_id: string;
  target_type: string;
  actor_uid: string;
  notification_completed_at?: string | null;
  notion_completed_at?: string | null;
}

const NOTIFICATION_ID_NAMESPACE = "52c06670-c364-4c0f-82d9-8f18bb9f311e";
const ISSUE_STATUS_LABELS: Record<string, string> = {
  "auto-rejected": "未通過",
  "completed": "已完成",
  "infeasible": "無法實行",
  "pending": "未回覆",
  "processing": "處理中",
  "review-rejected": "審核未通過",
  "under-review": "待審核",
};
type AppSupabase = SupabaseClient<Database>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function preview(value: unknown) {
  const text = asString(value).replace(/\s+/gu, " ").trim();
  return text.slice(0, 80);
}

function issueStatusLabel(status: string) {
  return ISSUE_STATUS_LABELS[status] ?? status;
}

function notificationForEvent(event: OutboxEvent): Record<string, unknown> | null {
  const title = asString(event.payload.title, event.event_type);
  if (event.event_type === "issue.created") {
    if (asString(event.payload.status) === "under-review") {
      return {
      source: "admin",
      type: "issue_created",
      target_type: "issue",
      target_id: event.target_id,
      title: "新提案待審核",
      actor_uid: event.actor_uid,
      body_preview: title,
      issue_category: asString(event.payload.category),
    };
  }
  return {
      source: "admin",
      type: "issue_created",
      target_type: "issue",
      target_id: event.target_id,
      title: "新提案待處理",
      actor_uid: event.actor_uid,
      body_preview: title,
      issue_category: asString(event.payload.category),
    };
  }
  if (event.event_type === "issue.comment_created") {
    return {
      source: "user",
      type: "issue_comment_created",
      target_type: "issue",
      target_id: event.target_id,
      title: "提案有新的留言",
      actor_uid: event.actor_uid,
      actor_name: asString(event.payload.author_name),
      actor_photo_url: asString(event.payload.author_photo_url),
      body_preview: preview(event.payload.content),
      issue_category: asString(event.payload.issue_category),
    };
  }
  if (event.event_type === "support.goal_met") {
    return {
      source: "user",
      type: "support_goal_met",
      target_type: "issue",
      target_id: event.target_id,
      title: "提案已達附議門檻",
      actor_uid: event.actor_uid,
      body_preview: title,
      issue_category: asString(event.payload.issue_category),
    };
  }
  if (event.event_type === "issue.status_changed") {
    const oldStatus = asString(event.payload.old_status);
    const newStatus = asString(event.payload.new_status);
    const isReviewApproved = oldStatus === "under-review" && newStatus === "pending";
    return {
      source: "user",
      type: "issue_status_changed",
      target_type: "issue",
      target_id: event.target_id,
      title: isReviewApproved ? "提案審核已通過" : "提案狀態已變更",
      actor_uid: event.actor_uid,
      body_preview: isReviewApproved
        ? `${title} 已通過審核並開放附議。`
        : `${title} 現在狀態為 ${issueStatusLabel(newStatus)}`,
      old_status: oldStatus,
      new_status: newStatus,
      issue_category: asString(event.payload.issue_category),
    };
  }
  if (event.event_type === "issue.deleted") {
    return {
      source: "user",
      type: "issue_deleted",
      target_type: "issue",
      target_id: event.target_id,
      title: "提案已被刪除",
      actor_uid: event.actor_uid,
      body_preview: title,
    };
  }
  if (event.event_type === "announcement.created") {
    return {
      source: "broadcast",
      type: "announcement_created",
      target_type: "announcement",
      target_id: event.target_id,
      title: "有新的公告",
      actor_uid: event.actor_uid,
      body_preview: title,
    };
  }
  if (event.event_type === "announcement.comment_created") {
    return {
      source: "admin",
      type: "announcement_comment_created",
      target_type: "announcement",
      target_id: event.target_id,
      title: "公告有新的留言",
      actor_uid: event.actor_uid,
      actor_name: asString(event.payload.author_name),
      actor_photo_url: asString(event.payload.author_photo_url),
      body_preview: preview(event.payload.content),
    };
  }
  return null;
}

function uuidToBytes(uuid: string) {
  return Uint8Array.from(uuid.replace(/-/gu, "").match(/.{2}/gu)?.map((byte) => parseInt(byte, 16)) ?? []);
}

function bytesToUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function deterministicNotificationId(eventId: string, kind: string) {
  const namespaceBytes = uuidToBytes(NOTIFICATION_ID_NAMESPACE);
  const nameBytes = new TextEncoder().encode(`${eventId}:${kind}`);
  const bytes = new Uint8Array(namespaceBytes.length + nameBytes.length);
  bytes.set(namespaceBytes);
  bytes.set(nameBytes, namespaceBytes.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  const uuidBytes = hash.slice(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  return bytesToUuid(uuidBytes);
}

async function findIssueAuthorUid(
  supabase: AppSupabase,
  event: OutboxEvent,
) {
  const payloadAuthorUid = asString(event.payload.author_uid)
    || asString(event.payload.issue_author_uid);
  if (payloadAuthorUid) return payloadAuthorUid;

  const { data, error } = await supabase
    .schema("app_private")
    .from("issues")
    .select("author_uid")
    .eq("id", event.target_id)
    .maybeSingle();
  if (error) throw error;
  return asString(data?.author_uid);
}

async function findCachedAvatarUrl(supabase: AppSupabase, uid: string) {
  if (!uid) return "";
  const { data, error } = await supabase
    .schema("app_private")
    .from("user_profiles")
    .select("cached_photo_url")
    .eq("uid", uid)
    .maybeSingle();
  if (error) throw error;
  return asString(data?.cached_photo_url);
}

async function resolveNotification(
  supabase: AppSupabase,
  event: OutboxEvent,
) {
  let notification = notificationForEvent(event);
  if (!notification) return null;
  const actorPhotoUrl = await findCachedAvatarUrl(supabase, event.actor_uid);
  if (actorPhotoUrl) {
    notification = { ...notification, actor_photo_url: actorPhotoUrl };
  }

  if (
    event.event_type === "issue.comment_created"
    || event.event_type === "issue.status_changed"
    || event.event_type === "issue.deleted"
    || event.event_type === "support.goal_met"
  ) {
    const recipientUid = await findIssueAuthorUid(supabase, event);
    if (!recipientUid) return null;
    if (recipientUid === event.actor_uid && event.event_type !== "support.goal_met") return null;
    return { ...notification, recipient_uid: recipientUid };
  }

  return notification;
}

async function markMappedNotionPageDeleted(
  supabase: AppSupabase,
  targetType: string,
  targetId: string,
) {
  const { data, error } = await supabase
    .schema("app_private")
    .from("notion_pages")
    .select("notion_page_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();
  if (error) throw error;
  if (data?.notion_page_id) {
    await markNotionPageDeleted(String(data.notion_page_id));
  }
}

async function syncNotionForEvent(
  supabase: AppSupabase,
  event: OutboxEvent,
): Promise<void> {
  switch (event.event_type) {
    case "issue.created":
      await syncIssueCreatedToNotion(supabase, event.target_id, event.payload);
      break;
    case "issue.status_changed":
      await syncIssueStatusChangedToNotion(supabase, event.target_id, event.payload);
      break;
    case "issue.comment_created":
      await syncIssueCommentToNotion(supabase, event.target_id, event.payload);
      break;
    case "support.created":
    case "support.deleted":
    case "support.goal_met":
      await syncIssueSupportToNotion(supabase, event.target_id);
      break;
    case "issue.deleted":
    case "announcement.deleted": {
      await markMappedNotionPageDeleted(supabase, event.target_type, event.target_id);
      break;
    }
    case "announcement.created":
    case "announcement.updated":
      await syncAnnouncementCreatedToNotion(supabase, event.target_id, event.payload);
      break;
    default:
      break;
  }
}

async function sendPushes(
  supabase: AppSupabase,
  notification: Record<string, unknown>,
) {
  let query = supabase
    .schema("app_private")
    .from("push_tokens")
    .select("uid,token")
    .limit(200);
  const source = asString(notification.source);
  const recipientUid = asString(notification.recipient_uid);
  if (recipientUid) {
    query = query.eq("uid", recipientUid);
  } else if (source === "admin") {
    const { data: roles, error: roleError } = await supabase
      .schema("app_private")
      .from("user_roles")
      .select("uid")
      .eq("role", "admin")
      .limit(200);
    if (roleError) throw roleError;
    const adminUids = (roles ?? []).map((role) => asString(role.uid)).filter(Boolean);
    if (adminUids.length === 0) return;
    query = query.in("uid", adminUids);
  }
  const { data, error } = await query;
  if (error) throw error;

  const notificationType = asString(notification.type);
  const targetType = asString(notification.target_type);
  const targetId = asString(notification.target_id);
  const category = asString(notification.issue_category);
  const link = targetType === "announcement"
    ? `/announcements/${encodeURIComponent(targetId)}`
    : `/issues/${encodeURIComponent(category || "public-issues")}/${encodeURIComponent(targetId)}`;
  const recipientUids = [...new Set((data ?? []).map((row) => asString(row.uid)).filter(Boolean))];
  const preferences = new Map<string, { comments: boolean; issueUpdates: boolean }>();
  if (recipientUids.length > 0) {
    const { data: states, error: stateError } = await supabase
      .schema("app_private")
      .from("notification_states")
      .select("uid,push_comments_enabled,push_issue_updates_enabled")
      .in("uid", recipientUids);
    if (stateError) throw stateError;
    for (const state of states ?? []) {
      preferences.set(String(state.uid), {
        comments: state.push_comments_enabled !== false,
        issueUpdates: state.push_issue_updates_enabled !== false,
      });
    }
  }

  await Promise.all((data ?? []).map(async (row) => {
    const uid = asString(row.uid);
    const preference = preferences.get(uid) ?? { comments: true, issueUpdates: true };
    const isComment = notificationType === "issue_comment_created" || notificationType === "announcement_comment_created";
    const isIssueUpdate = notificationType === "issue_status_changed" || notificationType === "issue_deleted" || notificationType === "support_goal_met";
    if ((isComment && !preference.comments) || (isIssueUpdate && !preference.issueUpdates)) return;

    try {
      await sendFcmMessage({
        token: row.token,
        notification: {
          title: asString(notification.title),
          body: asString(notification.body_preview),
        },
        data: {
          body: asString(notification.body_preview),
          issue_category: category,
          link,
          target_id: targetId,
          target_type: targetType,
          title: asString(notification.title),
          type: notificationType,
        },
      });
      await supabase.schema("app_private").from("push_delivery_logs").insert({
        notification_type: notificationType,
        status: "sent",
        target_id: asString(notification.target_id),
        target_type: asString(notification.target_type),
        token_uid: uid,
      });
    } catch (error) {
      if (isInvalidFcmTokenError(error)) {
        await supabase.schema("app_private").from("push_tokens").delete().eq("token", row.token);
      }
      await supabase.schema("app_private").from("push_delivery_logs").insert({
        error_message: operationalErrorSummary(error),
        notification_type: notificationType,
        status: "failed",
        target_id: asString(notification.target_id),
        target_type: asString(notification.target_type),
        token_uid: uid,
      });
    }
  }));
}

async function insertNotification(
  supabase: AppSupabase,
  notification: Record<string, unknown>,
) {
  const { error } = await supabase
    .schema("app_private")
    .from("notifications")
    .insert(notification);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function sendPushesWithoutBlockingOutbox(
  supabase: AppSupabase,
  notification: Record<string, unknown>,
) {
  try {
    await sendPushes(supabase, notification);
  } catch (error) {
    await supabase.schema("app_private").from("push_delivery_logs").insert({
      error_message: operationalErrorSummary(error),
      notification_type: asString(notification.type),
      status: "failed",
      target_id: asString(notification.target_id),
      target_type: asString(notification.target_type),
      token_uid: "",
    });
  }
}

async function createNotificationsForEvent(
  supabase: AppSupabase,
  event: OutboxEvent,
) {
  const notification = await resolveNotification(supabase, event);
  if (notification) {
    const notificationWithId = {
      ...notification,
      id: await deterministicNotificationId(event.id, "primary"),
    };
    const inserted = await insertNotification(supabase, notificationWithId);
    if (inserted) {
      await sendPushesWithoutBlockingOutbox(supabase, notificationWithId);
    }
  }

  return {
    hasNotification: Boolean(notification),
  };
}

async function processEvent(supabase: AppSupabase, event: OutboxEvent) {
  let hasNotification: boolean;
  if (!event.notification_completed_at) {
    ({ hasNotification } = await createNotificationsForEvent(supabase, event));
    const { error } = await supabase.schema("app_private").from("outbox_events")
      .update({ notification_completed_at: new Date().toISOString() }).eq("id", event.id);
    if (error) throw error;
  } else {
    hasNotification = Boolean(notificationForEvent(event));
  }

  if (!event.notion_completed_at) {
    await syncNotionForEvent(supabase, event);
    const { error } = await supabase.schema("app_private").from("outbox_events")
      .update({ notion_completed_at: new Date().toISOString() }).eq("id", event.id);
    if (error) throw error;
  }

  if (hasNotification) return;

  if (
    event.event_type === "announcement.updated"
    || event.event_type === "announcement.deleted"
    || event.event_type === "support.created"
    || event.event_type === "support.deleted"
    || event.event_type === "support.goal_met"
  ) {
    return;
  }

  throw new Error(`Outbox handler is not implemented for ${event.event_type}.`);
}

Deno.serve(async (request) => {
  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  const authFailure = requireBearerSecret(request);
  if (authFailure) return authFailure;

  try {
    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .schema("app_api")
      .rpc("claim_outbox_events", { batch_size: 100 });
    if (error) {
      throw error;
    }

    const events = (data ?? []) as OutboxEvent[];
    for (const event of events) {
      try {
        await processEvent(supabase, event);
        const { error: completeError } = await supabase
          .schema("app_api")
          .rpc("complete_outbox_event", { event_id: event.id });
        if (completeError) throw completeError;
      } catch (error) {
        const { error: failError } = await supabase
          .schema("app_api")
          .rpc("fail_outbox_event", {
            event_id: event.id,
            error_message: operationalErrorSummary(error),
          });
        if (failError) throw failError;
      }
    }

    return jsonResponse({ ok: true, processedCount: events.length });
  } catch (error) {
    console.error(errorMessage(error));
    return jsonResponse({ ok: false, error: "worker-failed" }, { status: 500 });
  }
});
