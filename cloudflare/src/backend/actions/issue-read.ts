import { asString } from "../shared/http.ts";
import { createMediaDeliveryUrl } from "../shared/media-delivery.ts";
import type { AuthContext, BackendDatabase, JsonRecord } from "./types.ts";
import { getIssueCategory, issueCategoryPolicyLists } from "./category-catalog.ts";
import {
  asNumber,
  asUuid,
  readCursor,
  readCursorDate,
} from "./utils.ts";
import { INPUT_LIMITS, optionalText } from "./validation.ts";
import { canManageIssueCategory } from "./auth.ts";
import { selectIssue } from "./issue-shared.ts";

function readSort(payload: JsonRecord) {
  const sort = asString(payload.sort);
  return sort === "most-supported" || sort === "ending-soon" ? sort : "latest";
}

function readPageSize(payload: JsonRecord) {
  return Math.min(Math.max(Math.round(asNumber(payload.pageSize, 20)), 1), 50);
}

async function issueReadPolicyParams(database: BackendDatabase, auth: AuthContext, actorCanManage = false) {
  const policy = await issueCategoryPolicyLists(database);
  return {
    actor_uid: auth.uid,
    actor_is_admin: actorCanManage,
    private_to_owner_categories: policy.privateToOwnerCategoryIds,
    review_required_categories: policy.reviewRequiredCategoryIds,
    author_private_categories: policy.authorPrivateCategoryIds,
  };
}

function compactIssueListResult(data: unknown): JsonRecord {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const result = data as JsonRecord;
  if (!Array.isArray(result.issues)) return result;
  return {
    ...result,
    issues: result.issues.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const issue = { ...(value as JsonRecord) };
      delete issue.content;
      return issue;
    }),
  };
}

async function getIssue(
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const [storedIssue, policyParams] = await Promise.all([
    selectIssue(database, issueId),
    issueReadPolicyParams(database, auth),
  ]);
  const category = await getIssueCategory(database, storedIssue.category);
  const actorCanManage = canManageIssueCategory(auth, category.id);
  const canDeleteIssue = actorCanManage
    || (storedIssue.author_uid === auth.uid && category.authorDeleteEnabled);

  const { data, error } = await database.call("app_api", "backend_get_issue", {
    issue_id: issueId,
    ...policyParams,
    actor_is_admin: actorCanManage,
  });
  if (error) throw error;
  return {
    issue: data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as JsonRecord), canDeleteIssue, canManageIssue: actorCanManage }
      : data,
  };
}

async function listIssues(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  const category = asString(payload.activeFilter);

  const cursor = readCursor(payload);
  const titleQuery = action === "searchIssues"
    ? optionalText(payload.titleQuery, "search", INPUT_LIMITS.search).toLowerCase()
    : null;
  const { data, error } = await database.call("app_api", "backend_list_issues_snapshot", {
    action_name: action,
    actor_can_manage: canManageIssueCategory(auth, category),
    actor_uid: auth.uid,
    active_filter: category,
    status_bucket: asString(payload.statusBucket, "active"),
    sort_name: readSort(payload),
    page_size: readPageSize(payload),
    title_query: titleQuery,
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "createdAt") || null,
    cursor_sort_date: readCursorDate(cursor, "sortDate") || null,
    cursor_sort_number: Number.isFinite(asNumber(cursor.sortNumber, Number.NaN))
      ? asNumber(cursor.sortNumber, Number.NaN)
      : null,
  });
  if (error) throw error;
  return compactIssueListResult(data);
}

async function listUserIssues(
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  const cursor = readCursor(payload);
  const { data, error } = await database.call("app_api", "backend_list_user_issues_snapshot", {
    actor_is_admin: auth.isAdmin,
    actor_uid: auth.uid,
    title_query: optionalText(payload.titleQuery, "search", INPUT_LIMITS.search).toLowerCase(),
    status_bucket: asString(payload.statusBucket, "active"),
    sort_name: readSort(payload),
    page_size: readPageSize(payload),
    cursor_id: asUuid(cursor.id) || null,
    cursor_created_at: readCursorDate(cursor, "createdAt") || null,
    cursor_sort_date: readCursorDate(cursor, "sortDate") || null,
    cursor_sort_number: Number.isFinite(asNumber(cursor.sortNumber, Number.NaN))
      ? asNumber(cursor.sortNumber, Number.NaN)
      : null,
  });
  if (error) throw error;
  return compactIssueListResult(data);
}

interface IssueSupporterRow {
  avatar_public_id: string | null;
  display_name: string | null;
  implicit: boolean;
  photo_url: string | null;
  uid: string;
}

async function listIssueSupporters(
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  const issueId = asUuid(payload.issueId);
  if (!issueId) throw new Error("not-found");
  const issue = await selectIssue(database, issueId);
  if (
    !auth.isAdmin
    && !canManageIssueCategory(auth, issue.category)
    && issue.author_uid !== auth.uid
  ) throw new Error("permission-denied");
  if (!issue.support_enabled) return { supporters: [] };

  const { rows } = await database.sql<IssueSupporterRow>`
    with supporter_ids as (
      select ${issue.author_uid}::text as uid, true as implicit, null::timestamptz as supported_at
      union all
      select support.uid, false, support.created_at
      from app_private.supports support
      where support.issue_id = ${issueId}
    )
    select supporter.uid, supporter.implicit, profile.display_name,
      profile.avatar_public_id, profile.photo_url
    from supporter_ids supporter
    left join app_private.user_profiles profile on profile.uid = supporter.uid
    order by supporter.implicit desc, supporter.supported_at asc nulls first, supporter.uid`;

  const supporters = await Promise.all(rows.map(async (supporter) => {
    const media = supporter.avatar_public_id
      ? await createMediaDeliveryUrl(supporter.avatar_public_id, "avatar", false, auth.uid)
      : null;
    return {
      uid: supporter.uid,
      displayName: supporter.display_name || supporter.uid,
      photoUrl: media?.url ?? supporter.photo_url ?? null,
      isAuthor: supporter.implicit,
    };
  }));
  return { supporters };
}

export function isIssueReadAction(action: string) {
  return action === "getIssue"
    || action === "listIssues"
    || action === "listIssueSupporters"
    || action === "searchIssues"
    || action === "listUserIssues";
}

export async function handleIssueReadAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  if (action === "getIssue") return getIssue(payload, auth, database);
  if (action === "listIssueSupporters") return listIssueSupporters(payload, auth, database);
  if (action === "listIssues" || action === "searchIssues") return listIssues(action, payload, auth, database);
  if (action === "listUserIssues") return listUserIssues(payload, auth, database);
  throw new Error("invalid-action");
}
