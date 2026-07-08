import { asRecord, asString } from "../_shared/http.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { markMarkdownUploadsAttached, queueAttachedUploadsForDeletion } from "./uploads.ts";
import { asUuid, readCursor, readCursorDate, utcHourWindow } from "./utils.ts";
import { INPUT_LIMITS, requiredText } from "./validation.ts";

function uploadTargetsFromResult(
  data: unknown,
  fallback: { id: string; type: "announcement_comment" },
) {
  const result = asRecord(data);
  return Array.isArray(result.upload_targets)
    ? result.upload_targets.map((target) => {
      const record = asRecord(target);
      return {
        id: asString(record.id),
        type: asString(record.type) as "announcement_comment",
      };
    }).filter((target) => target.id && target.type === "announcement_comment")
    : [fallback];
}

async function listAnnouncementComments(payload: JsonRecord, supabase: BackendSupabase) {
  const announcementId = asUuid(payload.announcementId);
  if (!announcementId) throw new Error("not-found");
  const cursor = readCursor(payload);
  const { data, error } = await supabase.schema("app_api").rpc("backend_list_announcement_comments", {
    announcement_id: announcementId,
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "createdAtMs", "created_at") || null,
  });
  if (error) throw error;
  return data;
}

async function createAnnouncementComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  await claimFixedWindowRateLimit(auth.uid, "comment.create", utcHourWindow(), RATE_LIMITS.commentCreateHourly);
  const announcementId = asUuid(payload.announcementId);
  if (!announcementId) throw new Error("not-found");
  const content = requiredText(payload.content, "comment", INPUT_LIMITS.comment);
  const parentCommentId = asUuid(payload.parentCommentId) || null;
  const { data, error } = await supabase.schema("app_api").rpc("backend_create_announcement_comment", {
    announcement_id: announcementId,
    parent_comment_id: parentCommentId,
    actor_uid: auth.uid,
    actor_name: auth.name,
    actor_photo_url: auth.photoUrl,
    comment_content: content,
  });
  if (error) throw error;
  const result = asRecord(data);
  const comment = asRecord(result.comment);
  await markMarkdownUploadsAttached(supabase, auth.uid, content, "announcement_comment", asString(comment.id));
  return { comment, comment_count: result.comment_count };
}

async function deleteAnnouncementComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const commentId = asUuid(payload.commentId);
  if (!commentId) return { success: true, announcement_id: "", comment_count: 0 };
  const { data, error } = await supabase.schema("app_api").rpc("backend_delete_announcement_comment", {
    comment_id: commentId,
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
  });
  if (error) throw error;
  await queueAttachedUploadsForDeletion(supabase, uploadTargetsFromResult(data, { id: commentId, type: "announcement_comment" }));
  const result = asRecord(data);
  return {
    success: true,
    announcement_id: asString(result.announcement_id),
    comment_count: typeof result.comment_count === "number" ? result.comment_count : 0,
  };
}

export function isAnnouncementCommentAction(action: string) {
  return action === "listAnnouncementComments"
    || action === "createAnnouncementComment"
    || action === "deleteAnnouncementComment";
}

export async function handleAnnouncementCommentAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "listAnnouncementComments") return listAnnouncementComments(payload, supabase);
  if (action === "createAnnouncementComment") return createAnnouncementComment(payload, auth, supabase);
  if (action === "deleteAnnouncementComment") return deleteAnnouncementComment(payload, auth, supabase);
  throw new Error("unsupported-action");
}
