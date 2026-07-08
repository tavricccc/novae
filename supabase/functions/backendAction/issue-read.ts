import { asString } from "../_shared/http.ts";
import {
  isIssueCategory,
  ISSUE_CATEGORIES,
} from "../_shared/issue-categories.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import {
  asNumber,
  asUuid,
  readCursor,
  readCursorDate,
} from "./utils.ts";
import { INPUT_LIMITS, optionalText } from "./validation.ts";

const PRIVATE_TO_OWNER_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "owner-admin")
  .map((category) => category.id);
const REVIEW_REQUIRED_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.readAccess === "reviewed-school")
  .map((category) => category.id);
const AUTHOR_PRIVATE_CATEGORIES = ISSUE_CATEGORIES
  .filter((category) => category.authorStorage === "private")
  .map((category) => category.id);

function readSort(payload: JsonRecord) {
  const sort = asString(payload.sort);
  return sort === "most-supported" || sort === "ending-soon" ? sort : "latest";
}

function readPageSize(payload: JsonRecord) {
  return Math.min(Math.max(Math.round(asNumber(payload.pageSize, 20)), 1), 50);
}

function issueReadPolicyParams(auth: AuthContext) {
  return {
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
    private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES,
    review_required_categories: REVIEW_REQUIRED_CATEGORIES,
    author_private_categories: AUTHOR_PRIVATE_CATEGORIES,
  };
}

async function getIssue(
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");

  const { data, error } = await supabase.schema("app_api").rpc("backend_get_issue", {
    issue_id: issueId,
    ...issueReadPolicyParams(auth),
  });
  if (error) throw error;
  return { issue: data };
}

async function listIssues(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const category = asString(payload.activeFilter);
  if (!isIssueCategory(category)) throw new Error("invalid-issue-category");

  const cursor = readCursor(payload);
  const titleQuery = action === "searchIssues"
    ? optionalText(payload.titleQuery, "search", INPUT_LIMITS.search).toLowerCase()
    : null;
  const { data, error } = await supabase.schema("app_api").rpc("backend_list_issues", {
    action_name: action,
    active_filter: category,
    status_bucket: asString(payload.statusBucket, "active"),
    sort_name: readSort(payload),
    page_size: readPageSize(payload),
    title_query: titleQuery,
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "created_at") || null,
    cursor_sort_date: readCursorDate(cursor, "sort_date") || null,
    cursor_sort_number: Number.isFinite(asNumber(cursor.sort_number, Number.NaN))
      ? asNumber(cursor.sort_number, Number.NaN)
      : null,
    ...issueReadPolicyParams(auth),
  });
  if (error) throw error;
  return data;
}

async function listUserIssues(
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const cursor = readCursor(payload);
  const { data, error } = await supabase.schema("app_api").rpc("backend_list_user_issues", {
    sort_name: readSort(payload),
    page_size: readPageSize(payload),
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "created_at") || null,
    cursor_sort_date: readCursorDate(cursor, "sort_date") || null,
    cursor_sort_number: Number.isFinite(asNumber(cursor.sort_number, Number.NaN))
      ? asNumber(cursor.sort_number, Number.NaN)
      : null,
    ...issueReadPolicyParams(auth),
  });
  if (error) throw error;
  return data;
}

export function isIssueReadAction(action: string) {
  return action === "getIssue"
    || action === "listIssues"
    || action === "searchIssues"
    || action === "listUserIssues";
}

export async function handleIssueReadAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "getIssue") return getIssue(payload, auth, supabase);
  if (action === "listIssues" || action === "searchIssues") return listIssues(action, payload, auth, supabase);
  if (action === "listUserIssues") return listUserIssues(payload, auth, supabase);
  throw new Error("unsupported-action");
}
