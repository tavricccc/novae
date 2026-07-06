import { asString } from "../_shared/http.ts";
import {
  issueIsPrivateToOwner,
  issueRequiresReview,
  issueStoresAuthorPrivately,
} from "../_shared/issue-categories.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { toMs } from "./utils.ts";

export function issueToResponse(issue: JsonRecord): JsonRecord {
  return {
    ...issue,
    created_at_ms: toMs(issue.created_at),
    updated_at_ms: toMs(issue.updated_at),
    support_deadline_at_ms: toMs(issue.support_deadline_at),
    response_deadline_at_ms: toMs(issue.response_deadline_at),
    result_updated_at_ms: toMs(issue.result_updated_at),
    support_met_at_ms: toMs(issue.support_met_at),
  };
}

export function canReadIssue(issue: JsonRecord, auth: AuthContext) {
  const category = asString(issue.category);
  const authorUid = asString(issue.author_uid);
  const status = asString(issue.status);
  if (auth.isAdmin || authorUid === auth.uid) return true;
  if (issueIsPrivateToOwner(category)) return false;
  if (issueRequiresReview(category) && (status === "under-review" || status === "review-rejected")) return false;
  return true;
}

export function issueToReadableResponse(issue: JsonRecord, auth: AuthContext): JsonRecord {
  const response = issueToResponse(issue);
  const authorUid = asString(issue.author_uid);
  const shouldHideAuthor = issueStoresAuthorPrivately(asString(issue.category))
    && !auth.isAdmin
    && authorUid !== auth.uid;
  if (!shouldHideAuthor) return response;

  const { author_uid, author_name, author_photo_url, ...publicIssue } = response;
  void author_uid;
  void author_name;
  void author_photo_url;
  return publicIssue;
}

export function commentToResponse(comment: JsonRecord): JsonRecord {
  return {
    ...comment,
    created_at_ms: toMs(comment.created_at),
    updated_at_ms: toMs(comment.updated_at),
    replies: Array.isArray(comment.replies)
      ? comment.replies.map((reply) => commentToResponse(reply as JsonRecord))
      : [],
  };
}

export function commentCursor(comment: JsonRecord) {
  return { id: comment.id, createdAtMs: comment.created_at_ms };
}

export async function selectIssue(supabase: BackendSupabase, issueId: string) {
  const { data, error } = await supabase
    .schema("app_private")
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not-found");
  return data as JsonRecord;
}
