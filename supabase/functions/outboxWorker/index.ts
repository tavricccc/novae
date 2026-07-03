import { createClient } from "npm:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/env.ts";
import { sendFcmMessage } from "../_shared/fcm.ts";
import {
  markNotionPageDeleted,
  syncAnnouncementCreatedToNotion,
  syncIssueCommentToNotion,
  syncIssueCreatedToNotion,
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
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function preview(value: unknown) {
  const text = asString(value).replace(/\s+/gu, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function notificationForEvent(event: OutboxEvent) {
  const title = asString(event.payload.title, event.event_type);
  if (event.event_type === "issue.created") {
    return {
      source: "broadcast",
      type: "issue_created",
      target_type: "issue",
      target_id: event.target_id,
      title: `新增提案：${title}`,
      actor_uid: event.actor_uid,
      body_preview: preview(event.payload.content),
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
      body_preview: preview(event.payload.content),
    };
  }
  if (event.event_type === "issue.status_changed") {
    return {
      source: "user",
      type: "issue_status_changed",
      target_type: "issue",
      target_id: event.target_id,
      title: `提案狀態已更新：${title}`,
      actor_uid: event.actor_uid,
      old_status: asString(event.payload.old_status),
      new_status: asString(event.payload.new_status),
      issue_category: asString(event.payload.issue_category),
    };
  }
  if (event.event_type === "issue.deleted") {
    return {
      source: "user",
      type: "issue_deleted",
      target_type: "issue",
      target_id: event.target_id,
      title: "提案已刪除",
      actor_uid: event.actor_uid,
    };
  }
  if (event.event_type === "announcement.created") {
    return {
      source: "broadcast",
      type: "announcement_created",
      target_type: "announcement",
      target_id: event.target_id,
      title: `新增公告：${title}`,
      actor_uid: event.actor_uid,
      body_preview: preview(event.payload.content),
    };
  }
  if (event.event_type === "announcement.comment_created") {
    return {
      source: "broadcast",
      type: "announcement_comment_created",
      target_type: "announcement",
      target_id: event.target_id,
      title: "公告有新的留言",
      actor_uid: event.actor_uid,
      body_preview: preview(event.payload.content),
    };
  }
  return null;
}

async function syncNotionForEvent(
  supabase: ReturnType<typeof createClient>,
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
      await syncIssueCommentToNotion(supabase, event.target_id);
      break;
    case "issue.deleted":
    case "announcement.deleted": {
      const { data, error } = await supabase
        .schema("app_private")
        .from("notion_pages")
        .select("notion_page_id")
        .eq("target_type", event.target_type)
        .eq("target_id", event.target_id)
        .maybeSingle();
      if (error) throw error;
      if (data?.notion_page_id) {
        await markNotionPageDeleted(String(data.notion_page_id));
      }
      break;
    }
    case "announcement.created":
      await syncAnnouncementCreatedToNotion(supabase, event.target_id, event.payload);
      break;
    default:
      break;
  }
}

async function sendPushes(
  supabase: ReturnType<typeof createClient>,
  notification: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .schema("app_private")
    .from("push_tokens")
    .select("token")
    .limit(200);
  if (error) throw error;

  await Promise.allSettled((data ?? []).map((row) => sendFcmMessage({
    token: row.token,
    notification: {
      title: asString(notification.title),
      body: asString(notification.body_preview),
    },
    data: {
      target_id: asString(notification.target_id),
      target_type: asString(notification.target_type),
      type: asString(notification.type),
    },
  })));
}

async function processEvent(supabase: ReturnType<typeof createClient>, event: OutboxEvent) {
  await syncNotionForEvent(supabase, event);

  const notification = notificationForEvent(event);
  if (notification) {
    const { error } = await supabase
      .schema("app_private")
      .from("notifications")
      .insert(notification);
    if (error) throw error;
    await sendPushes(supabase, notification);
    return;
  }

  if (
    event.event_type === "announcement.updated"
    || event.event_type === "announcement.deleted"
    || event.event_type === "support.created"
    || event.event_type === "support.deleted"
  ) {
    return;
  }

  throw new Error(`Outbox handler is not implemented for ${event.event_type}.`);
}

Deno.serve(async (request) => {
  const authFailure = requireBearerSecret(request);
  if (authFailure) return authFailure;

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
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
          error_message: error instanceof Error ? error.message : String(error),
        });
      if (failError) throw failError;
    }
  }

  return Response.json({ ok: true, processedCount: events.length });
});
