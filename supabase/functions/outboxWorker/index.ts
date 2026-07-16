import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { requireEnv } from "../_shared/env.ts";
import { isInvalidFcmTokenError, sendFcmMessage, sendFcmTopicMessage } from "../_shared/fcm.ts";
import { errorMessage, errorStatus, jsonResponse, publicError, requireMethod } from "../_shared/http.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimits, utcMinuteWindow, utcSecondWindow } from "../_shared/upstash-rate-limit.ts";
import {
  markNotionPageDeleted,
  syncAnnouncementCreatedToNotion,
  syncIssueCommentToNotion,
  syncIssueCreatedToNotion,
  syncIssueResultUpdatedToNotion,
  syncIssueSupportToNotion,
  syncIssueStatusChangedToNotion,
  syncFacilityCreatedToNotion,
  syncFacilityStatusToNotion,
} from "../_shared/notion.ts";
import { requireBearerSecret } from "../_shared/webhook.ts";
import { requireOriginSecret } from "../_shared/origin.ts";

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
  "unable-to-handle": "無法處理",
};
type AppSupabase = SupabaseClient<Database>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function preview(value: unknown) {
  const text = asString(value).replace(/\s+/gu, " ").trim();
  return text.slice(0, 80);
}

function issueStatusLabel(status: string) {
  return ISSUE_STATUS_LABELS[status] ?? status;
}

function isCommentNotificationType(type: string) {
  return type === "issue_comment_created" || type === "announcement_comment_created";
}

function isIssueUpdateNotificationType(type: string) {
  return type === "issue_status_changed"
    || type === "facility_status_changed"
    || type === "issue_deleted"
    || type === "support_goal_met";
}

function commentIdForEvent(event: OutboxEvent) {
  if (event.event_type !== "issue.comment_created" && event.event_type !== "announcement.comment_created") {
    return null;
  }
  return asString(event.payload.comment_id) || asString(event.payload.id) || null;
}

function notificationForEvent(event: OutboxEvent): Record<string, unknown> | null {
  if (event.payload.retention_cleanup === true) return null;
  const title = asString(event.payload.title, event.event_type);
  if (event.event_type === "issue.created") return null;
  if (event.event_type === "facility.status_changed") {
    const newStatus = asString(event.payload.new_status);
    return {
      source: "user", type: "facility_status_changed", target_type: "facility", target_id: event.target_id,
      title: "設備狀態已變更", actor_uid: event.actor_uid,
      body_preview: `${title} 現在狀態為 ${issueStatusLabel(newStatus)}`,
      old_status: asString(event.payload.old_status), new_status: newStatus,
    };
  }
  if (event.event_type === "issue.comment_created") {
    const authorName = asString(event.payload.author_name).trim() || "匿名使用者";
    return {
      source: "user",
      type: "issue_comment_created",
      target_type: "issue",
      target_id: event.target_id,
      comment_id: commentIdForEvent(event),
      title: `來自 ${authorName} 的留言`,
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
    const authorName = asString(event.payload.author_name).trim() || "匿名使用者";
    return {
      source: "user",
      type: "announcement_comment_created",
      target_type: "announcement",
      target_id: event.target_id,
      comment_id: commentIdForEvent(event),
      title: `來自 ${authorName} 的留言`,
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
  const replyRecipientUid = asString(event.payload.parent_author_uid);
  if (replyRecipientUid) return replyRecipientUid;

  const payloadAuthorUid = asString(event.payload.issue_author_uid)
    || asString(event.payload.author_uid);
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

async function findAnnouncementCommentRecipientUid(
  supabase: AppSupabase,
  event: OutboxEvent,
) {
  const replyRecipientUid = asString(event.payload.parent_author_uid);
  if (replyRecipientUid) return replyRecipientUid;

  const payloadAuthorUid = asString(event.payload.announcement_author_uid);
  if (payloadAuthorUid) return payloadAuthorUid;

  const { data, error } = await supabase
    .schema("app_private")
    .from("announcements")
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

  if (event.event_type === "issue.comment_created") {
    const recipientUid = await findIssueAuthorUid(supabase, event);
    if (!recipientUid) return null;
    if (recipientUid === event.actor_uid) return null;
    return { ...notification, recipient_uid: recipientUid };
  }

  if (event.event_type === "announcement.comment_created") {
    const recipientUid = await findAnnouncementCommentRecipientUid(supabase, event);
    if (!recipientUid || recipientUid === event.actor_uid) return null;
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
    case "facility.created":
      await syncFacilityCreatedToNotion(supabase, event.target_id, event.payload);
      break;
    case "facility.status_changed":
      await syncFacilityStatusToNotion(supabase, event.target_id, event.payload);
      break;
    case "issue.status_changed":
      await syncIssueStatusChangedToNotion(supabase, event.target_id, event.payload);
      break;
    case "issue.result_updated":
      await syncIssueResultUpdatedToNotion(supabase, event.target_id, event.payload);
      break;
    case "issue.comment_created":
      await syncIssueCommentToNotion(supabase, event.target_id, event.payload);
      break;
    case "support.goal_met":
      await syncIssueSupportToNotion(supabase, event.target_id);
      break;
    case "issue.deleted":
    case "announcement.deleted":
    case "facility.deleted": {
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
  const source = asString(notification.source);
  const recipientUid = asString(notification.recipient_uid);
  const notificationType = asString(notification.type);
  const topic = !recipientUid && source === "broadcast" && notificationType === "announcement_created"
    ? "srp-broadcast"
    : "";
  const tokens: Array<{ token: string; uid: string }> = [];
  const seenTokens = new Set<string>();
  for (let offset = 0; ; offset += 200) {
    let query = supabase.schema("app_private").from("push_tokens")
      .select("uid,token,topic_broadcast").order("uid", { ascending: true }).order("device_id", { ascending: true })
      .range(offset, offset + 199);
    if (recipientUid) query = query.eq("uid", recipientUid);
    if (topic === "srp-broadcast") query = query.eq("topic_broadcast", false);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      const token = asString(row.token);
      if (!token || seenTokens.has(token)) continue;
      seenTokens.add(token);
      tokens.push({ token, uid: asString(row.uid) });
    }
    if ((data ?? []).length < 200) break;
  }

  const targetType = asString(notification.target_type);
  const targetId = asString(notification.target_id);
  const commentId = asString(notification.comment_id);
  const category = asString(notification.issue_category);
  const isComment = isCommentNotificationType(notificationType);
  const commentQuery = isComment && commentId ? `&comment=${encodeURIComponent(commentId)}` : "";
  const link = notificationType === "issue_deleted"
    ? "/notifications"
    : targetType === "announcement"
    ? `/announcements/${encodeURIComponent(targetId)}${isComment ? `?tab=comments${commentQuery}` : ""}`
    : targetType === "facility"
    ? `/facilities/${encodeURIComponent(targetId)}`
    : `/issues/${encodeURIComponent(category || "public-issues")}/${encodeURIComponent(targetId)}${isComment ? `?tab=comments${commentQuery}` : ""}`;
  const topicData = {
    body: asString(notification.body_preview), comment_id: commentId, issue_category: category, link,
    target_id: targetId, target_type: targetType, title: asString(notification.title),
    type: notificationType, view: isComment ? "comment" : "detail", tab: isComment ? "comments" : "details",
  };
  if (topic) {
    try {
      await sendFcmTopicMessage(topic, topicData);
    } catch (error) {
      console.error(JSON.stringify({ error: errorMessage(error), notificationType, operation: "fcm-topic-send", topic }));
      // Topic subscribers must be included in the token fallback when fanout fails.
      tokens.length = 0;
      let fallbackQuery = supabase.schema("app_private").from("push_tokens").select("uid,token").limit(1000);
      if (recipientUid) fallbackQuery = fallbackQuery.eq("uid", recipientUid);
      const { data: fallbackTokens, error: fallbackError } = await fallbackQuery;
      if (fallbackError) throw fallbackError;
      for (const row of fallbackTokens ?? []) tokens.push({ token: row.token, uid: row.uid });
    }
  }
  const recipientUids = [...new Set(tokens.map((row) => asString(row.uid)).filter(Boolean))];
  const preferences = new Map<string, { comments: boolean; facilityUpdates: boolean; issueUpdates: boolean }>();
  let pushFailureTraceCode = "";
  if (recipientUids.length > 0) {
    const { data: states, error: stateError } = await supabase
      .schema("app_private")
      .from("notification_states")
      .select("uid,push_comments_enabled,push_facility_updates_enabled,push_issue_updates_enabled")
      .in("uid", recipientUids);
    if (stateError) throw stateError;
    for (const state of states ?? []) {
      preferences.set(String(state.uid), {
        comments: state.push_comments_enabled !== false,
        facilityUpdates: state.push_facility_updates_enabled !== false,
        issueUpdates: state.push_issue_updates_enabled !== false,
      });
    }
  }

  const sendToken = async (row: { token: string; uid: string }) => {
    const uid = asString(row.uid);
    const preference = preferences.get(uid) ?? { comments: true, facilityUpdates: true, issueUpdates: true };
    const isComment = isCommentNotificationType(notificationType);
    const isIssueUpdate = isIssueUpdateNotificationType(notificationType);
    const isFacilityUpdate = notificationType === "facility_status_changed";
    if ((isComment && !preference.comments) || (isFacilityUpdate && !preference.facilityUpdates) || (isIssueUpdate && !isFacilityUpdate && !preference.issueUpdates)) return;

    const title = asString(notification.title);
    const body = asString(notification.body_preview);
    const view = isComment ? "comment" : "detail";
    const tab = isComment ? "comments" : "details";
    try {
      await sendFcmMessage({
        token: row.token,
        data: {
          body,
          comment_id: commentId,
          issue_category: category,
          link,
          target_id: targetId,
          target_type: targetType,
          title,
          type: notificationType,
          view,
          tab,
        },
      });
    } catch (error) {
      pushFailureTraceCode ||= crypto.randomUUID();
      console.error(JSON.stringify({
        error: errorMessage(error),
        notificationType,
        targetId,
        targetType,
        traceCode: pushFailureTraceCode,
        uid,
      }));
      if (isInvalidFcmTokenError(error)) {
        await supabase.schema("app_private").from("push_tokens").delete().eq("token", row.token);
      }
    }
  };
  for (let offset = 0; offset < tokens.length; offset += 20) {
    await Promise.all(tokens.slice(offset, offset + 20).map(sendToken));
  }
  if (pushFailureTraceCode) {
    await supabase.schema("app_private").from("push_delivery_logs").insert({
      error_message: pushFailureTraceCode,
      notification_type: notificationType,
      status: "failed",
      target_id: targetId,
      target_type: targetType,
      token_uid: "",
    });
  }
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
    const traceCode = crypto.randomUUID();
    console.error(JSON.stringify({
      error: errorMessage(error),
      notificationType: asString(notification.type),
      traceCode,
    }));
    await supabase.schema("app_private").from("push_delivery_logs").insert({
      error_message: traceCode,
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
  if (event.event_type === "facility.status_changed") {
    const base = notificationForEvent(event);
    if (!base) return { hasNotification: false };
    const authorUid = asString(event.payload.author_uid);
    const { data, error } = await supabase.schema("app_private").from("facility_report_affected_users")
      .select("uid").eq("facility_id", event.target_id);
    if (error) throw error;
    const recipients = [...new Set([authorUid, ...(data ?? []).map((row) => asString(row.uid))].filter(Boolean))];
    for (const recipientUid of recipients) {
      const notification = { ...base, recipient_uid: recipientUid, id: await deterministicNotificationId(event.id, recipientUid) };
      const inserted = await insertNotification(supabase, notification);
      if (inserted) await sendPushesWithoutBlockingOutbox(supabase, notification);
    }
    return { hasNotification: recipients.length > 0 };
  }
  if (
    event.event_type === "issue.status_changed"
    || event.event_type === "support.goal_met"
    || event.event_type === "issue.deleted"
  ) {
    let base = notificationForEvent(event);
    if (!base) return { hasNotification: false };
    const actorPhotoUrl = await findCachedAvatarUrl(supabase, event.actor_uid);
    if (actorPhotoUrl) base = { ...base, actor_photo_url: actorPhotoUrl };

    const authorUid = await findIssueAuthorUid(supabase, event);
    let supporterUids = asStringArray(event.payload.supporter_uids);
    if (event.event_type !== "issue.deleted") {
      const { data, error } = await supabase.schema("app_private").from("supports")
        .select("uid").eq("issue_id", event.target_id);
      if (error) throw error;
      supporterUids = (data ?? []).map((row) => asString(row.uid)).filter(Boolean);
    }

    const recipients = [...new Set([authorUid, ...supporterUids].filter(Boolean))]
      .filter((uid) => event.event_type === "support.goal_met" || uid !== event.actor_uid);
    for (const recipientUid of recipients) {
      const notification = {
        ...base,
        recipient_uid: recipientUid,
        id: await deterministicNotificationId(event.id, recipientUid),
      };
      const inserted = await insertNotification(supabase, notification);
      if (inserted) await sendPushesWithoutBlockingOutbox(supabase, notification);
    }
    return { hasNotification: recipients.length > 0 };
  }
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
    || event.event_type === "issue.status_changed"
    || event.event_type === "issue.result_updated"
    || event.event_type === "support.goal_met"
    || event.event_type === "issue.created"
    || event.event_type === "issue.comment_created"
    || event.event_type === "issue.deleted"
    || event.event_type === "announcement.created"
    || event.event_type === "announcement.comment_created"
    || event.event_type === "facility.created"
    || event.event_type === "facility.status_changed"
    || event.event_type === "facility.deleted"
  ) {
    return;
  }

  throw new Error(`Outbox handler is not implemented for ${event.event_type}.`);
}

Deno.serve(async (request) => {
  const originFailure = requireOriginSecret(request);
  if (originFailure) return originFailure;
  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  const authFailure = requireBearerSecret(request);
  if (authFailure) return authFailure;

  try {
    await claimFixedWindowRateLimits([
      { identifier: "global", actionName: "worker.outbox.second", window: utcSecondWindow(), config: RATE_LIMITS.workerRunSecond },
      { identifier: "global", actionName: "worker.outbox", window: utcMinuteWindow(), config: RATE_LIMITS.workerRunMinute },
    ]);
    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .schema("app_api")
      .rpc("claim_outbox_events", { batch_size: 10 });
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
        const traceCode = crypto.randomUUID();
        console.error("outbox event failed", {
          event_id: event.id,
          event_type: event.event_type,
          notification_completed_at: event.notification_completed_at ?? null,
          notion_completed_at: event.notion_completed_at ?? null,
          target_id: event.target_id,
          target_type: event.target_type,
          error: errorMessage(error),
          traceCode,
        });
        const { error: failError } = await supabase
          .schema("app_api")
          .rpc("fail_outbox_event", {
            event_id: event.id,
            error_message: traceCode,
          });
        if (failError) throw failError;
      }
    }
    if (events.length === 10) {
      const { error: resignalError } = await supabase.schema("app_api")
        .rpc("resignal_background_worker", { worker_name: "outbox" });
      if (resignalError) {
        console.error("outbox backlog resignal failed", errorMessage(resignalError));
      }
    }

    return jsonResponse({ ok: true, processedCount: events.length });
  } catch (error) {
    console.error(errorMessage(error));
    return jsonResponse({ ok: false, error: publicError(error) }, { status: errorStatus(error) });
  }
});
