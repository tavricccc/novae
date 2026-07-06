import { asString } from "../_shared/http.ts";
import { issueAllowsCommentsForStatus } from "../_shared/issue-categories.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import { canReadIssue, commentCursor, commentToResponse, selectIssue } from "./issue-shared.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { markMarkdownUploadsAttached, queueAttachedUploadsForDeletion } from "./uploads.ts";
import { applyAscendingDateCursor, readCursor, utcHourWindow } from "./utils.ts";
import { INPUT_LIMITS, requiredText } from "./validation.ts";

function attachReplies(comments: JsonRecord[], replies: JsonRecord[]) {
  const groupedReplies = new Map<string, JsonRecord[]>();
  for (const reply of replies) {
    const parentId = asString(reply.parent_comment_id);
    if (!parentId) continue;
    groupedReplies.set(parentId, [...(groupedReplies.get(parentId) ?? []), reply]);
  }
  return comments.map((comment) => ({
    ...comment,
    replies: groupedReplies.get(asString(comment.id)) ?? [],
  }));
}

async function listComments(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const pageSize = 20;
  const issue = await selectIssue(supabase, asString(payload.issueId));
  if (!canReadIssue(issue, auth) || !issueAllowsCommentsForStatus(asString(issue.category), asString(issue.status))) {
    throw new Error("not-found");
  }
  let query = supabase
    .schema("app_private")
    .from("comments")
    .select("*")
    .eq("issue_id", asString(payload.issueId))
    .is("parent_comment_id", null);
  query = applyAscendingDateCursor(query, readCursor(payload), "created_at");
  const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(pageSize + 1);
  if (error) throw error;
  const rootComments = (data ?? []).slice(0, pageSize).map((comment) => comment as JsonRecord);
  const rootIds = rootComments.map((comment) => asString(comment.id)).filter(Boolean);
  const { data: replyData, error: replyError } = rootIds.length
    ? await supabase
      .schema("app_private")
      .from("comments")
      .select("*")
      .in("parent_comment_id", rootIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
    : { data: [], error: null };
  if (replyError) throw replyError;
  const comments = attachReplies(rootComments, (replyData ?? []).map((reply) => reply as JsonRecord))
    .map((comment) => commentToResponse(comment));
  const lastComment = rootComments[Math.min(pageSize - 1, rootComments.length - 1)];
  return {
    comments: comments.slice(0, pageSize),
    cursor: (data ?? []).length > pageSize && lastComment ? commentCursor(commentToResponse(lastComment)) : null,
    hasMore: (data ?? []).length > pageSize,
  };
}

async function createComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  await claimFixedWindowRateLimit(auth.uid, "comment.create", utcHourWindow(), RATE_LIMITS.commentCreateHourly);
  const issueId = asString(payload.issueId);
  const issue = await selectIssue(supabase, issueId);
  if (!canReadIssue(issue, auth) || !issueAllowsCommentsForStatus(asString(issue.category), asString(issue.status))) {
    throw new Error("permission-denied");
  }
  const content = requiredText(payload.content, "comment", INPUT_LIMITS.comment);
  const parentCommentId = asString(payload.parentCommentId);
  if (parentCommentId) {
    const { data: parentComment, error: parentError } = await supabase
      .schema("app_private")
      .from("comments")
      .select("id, issue_id, parent_comment_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (
      !parentComment
      || parentComment.issue_id !== issueId
      || parentComment.parent_comment_id !== null
    ) {
      throw new Error("invalid-parent-comment");
    }
  }
  const { data, error } = await supabase.schema("app_private").from("comments").insert({
    issue_id: issueId,
    parent_comment_id: parentCommentId || null,
    author_uid: auth.uid,
    author_name: auth.name,
    author_photo_url: auth.photoUrl,
    content,
    is_admin_comment: false,
  }).select("*").single();
  if (error) throw error;
  await markMarkdownUploadsAttached(supabase, auth.uid, content, "comment", data.id);
  return { comment: commentToResponse(data as JsonRecord) };
}

async function deleteComment(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const commentId = asString(payload.commentId);
  const { data } = await supabase.schema("app_private").from("comments").select("*").eq("id", commentId).maybeSingle();
  if (data && data.author_uid !== auth.uid && !auth.isAdmin) throw new Error("permission-denied");
  if (data) {
    const { data: replies, error: repliesError } = await supabase
      .schema("app_private")
      .from("comments")
      .select("id")
      .eq("parent_comment_id", commentId);
    if (repliesError) throw repliesError;
    await queueAttachedUploadsForDeletion(supabase, [
      { id: commentId, type: "comment" },
      ...(replies ?? []).map((reply) => ({ id: asString(reply.id), type: "comment" as const })),
    ]);
  }
  const { error } = await supabase.schema("app_private").from("comments").delete().eq("id", commentId);
  if (error) throw error;
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
