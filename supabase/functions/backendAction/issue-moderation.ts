import { asString } from "../_shared/http.ts";
import { getIssueCategoryConfigOrDefault, issueRequiresReview } from "../_shared/issue-categories.ts";
import { requireAdmin } from "./auth.ts";
import { issueToReadableResponse, selectIssue } from "./issue-shared.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { INPUT_LIMITS, optionalText } from "./validation.ts";

const VALID_STATUSES = new Set([
  "under-review", "pending", "processing", "auto-rejected",
  "review-rejected", "infeasible", "completed",
]);

export async function moderateIssueStatus(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requireAdmin(auth);
  const issueId = asString(payload.issueId);
  const oldIssue = await selectIssue(supabase, issueId);
  const nextStatus = asString(payload.status, "pending");
  if (!VALID_STATUSES.has(nextStatus)) throw new Error("invalid-status");
  const category = asString(oldIssue.category);
  const oldStatus = asString(oldIssue.status);
  const categoryConfig = getIssueCategoryConfigOrDefault(category);
  const now = new Date();
  const updateFields: JsonRecord = {
    last_actor_uid: auth.uid,
    review_rejection_reason: optionalText(payload.reason, "reason", INPUT_LIMITS.rejectionReason) || null,
    status: nextStatus,
  };
  if (nextStatus === "pending" && categoryConfig.responseDeadline.start === "support-met") {
    if (issueRequiresReview(category) && (oldStatus === "under-review" || oldStatus === "review-rejected")) {
      updateFields.review_approved_at = now.toISOString();
    }
    updateFields.support_deadline_at = categoryConfig.support.deadlineDays !== null
      ? new Date(now.getTime() + categoryConfig.support.deadlineDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  }
  if (nextStatus === "under-review" || nextStatus === "review-rejected") {
    updateFields.review_approved_at = null;
    updateFields.support_deadline_at = null;
  }
  if (nextStatus === "processing" && categoryConfig.responseDeadline.days !== null) {
    updateFields.response_deadline_at = new Date(now.getTime() + categoryConfig.responseDeadline.days * 24 * 60 * 60 * 1000).toISOString();
  }
  const { data, error } = await supabase.schema("app_private").from("issues").update(updateFields).eq("id", issueId).select("*").single();
  if (error) throw error;
  return { issue: issueToReadableResponse(data as JsonRecord, auth) };
}

export async function updateIssueResult(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requireAdmin(auth);
  const issueId = asString(payload.issueId);
  await selectIssue(supabase, issueId);
  const resultContent = optionalText(payload.resultContent, "issue-result", INPUT_LIMITS.issueResult).trim();
  const updateFields: JsonRecord = {
    last_actor_uid: auth.uid,
    result_content: resultContent || null,
    result_updated_at: resultContent ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .schema("app_private")
    .from("issues")
    .update(updateFields)
    .eq("id", issueId)
    .select("*")
    .single();
  if (error) throw error;
  return { issue: issueToReadableResponse(data as JsonRecord, auth) };
}
