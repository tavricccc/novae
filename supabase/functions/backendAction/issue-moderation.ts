import { asRecord, asString } from "../_shared/http.ts";
import { getIssueCategoryConfigOrDefault, ISSUE_CATEGORIES, issueRequiresReview } from "../_shared/issue-categories.ts";
import { requireAdmin } from "./auth.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asUuid } from "./utils.ts";
import { INPUT_LIMITS, optionalText } from "./validation.ts";

const VALID_STATUSES = new Set([
  "under-review", "pending", "processing", "auto-rejected",
  "review-rejected", "infeasible", "completed",
]);

const PRIVATE_TO_OWNER_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "owner-admin")
  .map((category) => category.id);
const REVIEW_REQUIRED_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "reviewed-school")
  .map((category) => category.id);
const AUTHOR_PRIVATE_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.authorStorage === "private")
  .map((category) => category.id);

function issuePolicyParams(auth: AuthContext) {
  return {
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
    private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES,
    review_required_categories: REVIEW_REQUIRED_CATEGORIES,
    author_private_categories: AUTHOR_PRIVATE_CATEGORIES,
  };
}

async function readIssueForAdmin(supabase: BackendSupabase, issueId: string, auth: AuthContext) {
  const { data, error } = await supabase.schema("app_api").rpc("backend_get_issue", {
    issue_id: issueId,
    ...issuePolicyParams(auth),
  });
  if (error) throw error;
  return asRecord(data);
}

export async function moderateIssueStatus(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requireAdmin(auth);
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const oldIssue = await readIssueForAdmin(supabase, issueId, auth);
  const nextStatus = asString(payload.status, "pending");
  if (!VALID_STATUSES.has(nextStatus)) throw new Error("invalid-status");
  const category = asString(oldIssue.category);
  const oldStatus = asString(oldIssue.status);
  const categoryConfig = getIssueCategoryConfigOrDefault(category);
  const now = new Date();
  let reviewApprovedAt = typeof oldIssue.review_approved_at === "string" ? oldIssue.review_approved_at : null;
  let supportDeadlineAt = typeof oldIssue.support_deadline_at === "string" ? oldIssue.support_deadline_at : null;
  let responseDeadlineAt: string | null = null;
  if (nextStatus === "pending" && categoryConfig.responseDeadline.start === "support-met") {
    if (issueRequiresReview(category) && (oldStatus === "under-review" || oldStatus === "review-rejected")) {
      reviewApprovedAt = now.toISOString();
    }
    supportDeadlineAt = categoryConfig.support.deadlineDays !== null
      ? new Date(now.getTime() + categoryConfig.support.deadlineDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  }
  if (nextStatus === "under-review" || nextStatus === "review-rejected") {
    reviewApprovedAt = null;
    supportDeadlineAt = null;
  }
  if (nextStatus === "processing" && categoryConfig.responseDeadline.days !== null) {
    responseDeadlineAt = new Date(now.getTime() + categoryConfig.responseDeadline.days * 24 * 60 * 60 * 1000).toISOString();
  }
  const { data, error } = await supabase.schema("app_api").rpc("backend_moderate_issue_status", {
    issue_id: issueId,
    next_status: nextStatus,
    review_rejection_reason: optionalText(payload.reason, "reason", INPUT_LIMITS.rejectionReason) || null,
    review_approved_at: reviewApprovedAt,
    support_deadline_at: supportDeadlineAt,
    response_deadline_at: responseDeadlineAt,
    ...issuePolicyParams(auth),
  });
  if (error) throw error;
  return { issue: data };
}

export async function updateIssueResult(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requireAdmin(auth);
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const resultContent = optionalText(payload.resultContent, "issue-result", INPUT_LIMITS.issueResult).trim();
  const { data, error } = await supabase.schema("app_api").rpc("backend_update_issue_result", {
    issue_id: issueId,
    result_content: resultContent || null,
    result_updated_at: resultContent ? new Date().toISOString() : null,
    ...issuePolicyParams(auth),
  });
  if (error) throw error;
  return { issue: data };
}
