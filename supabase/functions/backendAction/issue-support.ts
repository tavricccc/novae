import { asRecord, asString } from "../_shared/http.ts";
import { getIssueCategoryConfigOrDefault, ISSUE_CATEGORIES, issueAllowsSupport } from "../_shared/issue-categories.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asUuid, utcHourWindow } from "./utils.ts";

const PRIVATE_TO_OWNER_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "owner-admin")
  .map((category) => category.id);
const REVIEW_REQUIRED_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "reviewed-school")
  .map((category) => category.id);
const AUTHOR_PRIVATE_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.authorStorage === "private")
  .map((category) => category.id);

export async function updateSupport(action: string, payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  await claimFixedWindowRateLimit(auth.uid, "support.toggle", utcHourWindow(), RATE_LIMITS.supportToggleHourly);
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const { data: issueData, error: issueError } = await supabase.schema("app_api").rpc("backend_get_issue", {
    issue_id: issueId,
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
    private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES,
    review_required_categories: REVIEW_REQUIRED_CATEGORIES,
    author_private_categories: AUTHOR_PRIVATE_CATEGORIES,
  });
  if (issueError) throw issueError;
  const issue = asRecord(issueData);
  if (
    asString(issue.status) !== "pending"
    || issue.support_enabled !== true
    || !issueAllowsSupport(asString(issue.category))
    || (typeof issue.support_deadline_at === "string" && Date.parse(issue.support_deadline_at) <= Date.now())
  ) throw new Error("support-not-available");

  const categoryConfig = getIssueCategoryConfigOrDefault(asString(issue.category));
  const { data: result, error: toggleError } = await supabase.schema("app_api")
    .rpc("backend_toggle_support", {
      issue_id: issueId,
      actor_uid: auth.uid,
      remove_support: action === "removeSupport",
      response_deadline_days: categoryConfig.responseDeadline.days,
    })
    .single();
  if (toggleError) throw toggleError;
  const toggleResult = result as { goal_met: boolean; support_count: number; supported: boolean };
  return { success: true, supported: toggleResult.supported, support_count: toggleResult.support_count };
}
