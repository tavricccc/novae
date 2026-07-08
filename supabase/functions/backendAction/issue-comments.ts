import { asRecord, asString } from "../_shared/http.ts";
import { ISSUE_CATEGORIES } from "../_shared/issue-categories.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { markMarkdownUploadsAttached, queueAttachedUploadsForDeletion } from "./uploads.ts";
import { asUuid, readCursor, readCursorDate, utcHourWindow } from "./utils.ts";
import { INPUT_LIMITS, requiredText } from "./validation.ts";

const PRIVATE_TO_OWNER_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "owner-admin")
  .map((category) => category.id);
const REVIEW_REQUIRED_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "reviewed-school")
  .map((category) => category.id);
const PUBLIC_COMMENT_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.comments.enabledWhen === "public")
  .map((category) => category.id);

function issueCommentPolicyParams(auth: AuthContext) {
  return {
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
    private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES,
    review_required_categories: REVIEW_REQUIRED_CATEGORIES,
    public_comment_categories: PUBLIC_COMMENT_CATEGORIES,
  };
}

function uploadTargetsFromResult(
  data: unknown,
  fallback: { id: string; type: "comment" },
) {
  const result = asRecord(data);
  return Array.isArray(result.upload_targets)
    ? result.upload_targets.map((target) => {
      const record = asRecord(target);
      return {
        id: asString(record.id),
        type: asString(record.type) as "comment",
      };
    }).filter((target) => target.id && target.type === "comment")
    : [fallback];
}

async function listComments(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const cursor = readCursor(payload);
  const { data, error } = await supabase.schema("app_api").rpc("backend_list_issue_comments", {
    issue_id: issueId,
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "createdAtMs", "created_at") || null,
    ...issueCommentPolicyParams(auth),
  });
  if (error) throw error;
  return data;
}

async function createComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  await claimFixedWindowRateLimit(auth.uid, "comment.create", utcHourWindow(), RATE_LIMITS.commentCreateHourly);
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const content = requiredText(payload.content, "comment", INPUT_LIMITS.comment);
  const parentCommentId = asUuid(payload.parentCommentId) || null;
  const { data, error } = await supabase.schema("app_api").rpc("backend_create_issue_comment", {
    issue_id: issueId,
    parent_comment_id: parentCommentId,
    actor_name: auth.name,
    actor_photo_url: auth.photoUrl,
    comment_content: content,
    ...issueCommentPolicyParams(auth),
  });
  if (error) throw error;
  const comment = asRecord(data);
  await markMarkdownUploadsAttached(supabase, auth.uid, content, "comment", asString(comment.id));
  return { comment };
}

async function deleteComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const commentId = asUuid(payload.commentId);
  if (!commentId) return { success: true };
  const { data, error } = await supabase.schema("app_api").rpc("backend_delete_issue_comment", {
    comment_id: commentId,
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
  });
  if (error) throw error;
  await queueAttachedUploadsForDeletion(supabase, uploadTargetsFromResult(data, { id: commentId, type: "comment" }));
  return { success: true };
}

export function isIssueCommentAction(action: string) {
  return action === "listComments" || action === "createComment" || action === "deleteComment";
}

export async function handleIssueCommentAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "listComments") return listComments(payload, auth, supabase);
  if (action === "createComment") return createComment(payload, auth, supabase);
  if (action === "deleteComment") return deleteComment(payload, auth, supabase);
  throw new Error("unsupported-action");
}
