import { asRecord, asString } from "../_shared/http.ts";
import {
  getIssueCategoryConfigOrDefault,
  isIssueCategory,
  ISSUE_CATEGORIES,
  issueRequiresReview,
  issueStoresAuthorPrivately,
} from "../_shared/issue-categories.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { markMarkdownUploadsAttached } from "./uploads.ts";
import { taipeiDayWindow } from "./utils.ts";
import { INPUT_LIMITS, requiredText } from "./validation.ts";

const PRIVATE_TO_OWNER_CATEGORIES = ISSUE_CATEGORIES
  .filter((categoryConfig) => categoryConfig.readAccess === "owner-admin")
  .map((categoryConfig) => categoryConfig.id);
const REVIEW_REQUIRED_CATEGORIES = ISSUE_CATEGORIES
  .filter((categoryConfig) => categoryConfig.readAccess === "reviewed-school")
  .map((categoryConfig) => categoryConfig.id);
const AUTHOR_PRIVATE_CATEGORIES = ISSUE_CATEGORIES
  .filter((categoryConfig) => categoryConfig.authorStorage === "private")
  .map((categoryConfig) => categoryConfig.id);

export async function createIssue(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  await claimFixedWindowRateLimit(auth.uid, "issue.create", taipeiDayWindow(), RATE_LIMITS.issueCreateDaily);
  const title = requiredText(payload.title, "title", INPUT_LIMITS.title);
  const content = requiredText(payload.content, "content", INPUT_LIMITS.content);
  const category = asString(payload.category, "general");
  if (!isIssueCategory(category)) throw new Error("invalid-issue-category");

  const categoryConfig = getIssueCategoryConfigOrDefault(category);
  const now = new Date();
  const requiresReview = issueRequiresReview(category);
  const supportDeadlineAt = !requiresReview && categoryConfig.support.deadlineDays !== null
    ? new Date(now.getTime() + categoryConfig.support.deadlineDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const responseDeadlineAt = categoryConfig.responseDeadline.start === "created" && categoryConfig.responseDeadline.days !== null
    ? new Date(now.getTime() + categoryConfig.responseDeadline.days * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { data, error } = await supabase.schema("app_api").rpc("backend_create_issue", {
    actor_uid: auth.uid,
    actor_name: auth.name,
    actor_photo_url: auth.photoUrl,
    issue_title: title,
    issue_content: content,
    issue_category: category,
    issue_status: requiresReview ? "under-review" : "pending",
    support_enabled: categoryConfig.support.enabled,
    support_goal: categoryConfig.support.goal,
    support_deadline_at: supportDeadlineAt,
    response_deadline_at: responseDeadlineAt,
    author_is_private: issueStoresAuthorPrivately(category),
    actor_is_admin: auth.isAdmin,
    private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES,
    review_required_categories: REVIEW_REQUIRED_CATEGORIES,
    author_private_categories: AUTHOR_PRIVATE_CATEGORIES,
  });
  if (error) throw error;
  const issue = asRecord(data);
  await markMarkdownUploadsAttached(supabase, auth.uid, content, "issue", asString(issue.id));
  return { issue: data };
}
