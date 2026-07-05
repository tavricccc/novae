import { asString } from "../_shared/http.ts";
import {
  isIssueCategory,
  issueIsPrivateToOwner,
  issueRequiresReview,
} from "../_shared/issue-categories.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import {
  applyDescendingDateCursor,
  asNumber,
  asUuid,
  cursorRange,
  readCursor,
  readCursorDate,
} from "./utils.ts";
import { canReadIssue, issueToReadableResponse, selectIssue } from "./issue-shared.ts";
import { INPUT_LIMITS, optionalText } from "./validation.ts";

const ACTIVE_PUBLIC_STATUSES = ["pending", "processing"];
const ACTIVE_PRIVATE_STATUSES = ["under-review", "pending", "processing"];
const CLOSED_PUBLIC_STATUSES = ["auto-rejected", "infeasible", "completed"];
const CLOSED_PRIVATE_STATUSES = ["auto-rejected", "review-rejected", "infeasible", "completed"];

function getStatusValues(statusBucket: string, includePrivate: boolean) {
  if (statusBucket === "closed") {
    return includePrivate ? CLOSED_PRIVATE_STATUSES : CLOSED_PUBLIC_STATUSES;
  }
  return includePrivate ? ACTIVE_PRIVATE_STATUSES : ACTIVE_PUBLIC_STATUSES;
}

async function listIssues(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 20)), 1), 50);
  const range = cursorRange(pageSize);
  const sort = asString(payload.sort) === "most-supported"
    ? "most-supported"
    : asString(payload.sort) === "ending-soon"
      ? "ending-soon"
      : "latest";
  const category = asString(payload.activeFilter);
  if (!isIssueCategory(category)) throw new Error("invalid-issue-category");

  let query = supabase.schema("app_private").from("issues").select("*").eq("category", category);
  if (issueIsPrivateToOwner(category) && !auth.isAdmin) {
    query = query.eq("author_uid", auth.uid);
  }
  if (sort === "most-supported") {
    query = query.order("support_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  } else if (sort === "ending-soon") {
    query = query.order("support_deadline_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  const statusBucket = asString(payload.statusBucket, "active");
  if (auth.isAdmin || issueIsPrivateToOwner(category)) {
    query = query.in("status", getStatusValues(statusBucket, true));
  } else {
    const publicStatuses = getStatusValues(statusBucket, false);
    if (issueRequiresReview(category)) {
      const privateStatuses = getStatusValues(statusBucket, true)
        .filter((status) => !publicStatuses.includes(status));
      query = query.or(
        `status.in.(${publicStatuses.join(",")}),and(author_uid.eq.${auth.uid},status.in.(${privateStatuses.join(",")}))`,
      );
    } else {
      query = query.in("status", publicStatuses);
    }
  }
  if (action === "searchIssues") {
    const titleQuery = optionalText(payload.titleQuery, "search", INPUT_LIMITS.search).toLowerCase();
    query = query.ilike("title_search", `%${titleQuery.replace(/[%_]/gu, "\\$&")}%`);
  }

  const cursor = readCursor(payload);
  const cursorId = asUuid(cursor.id);
  const cursorCreatedAt = readCursorDate(cursor, "created_at");
  if (action === "listIssues" && cursorId && cursorCreatedAt) {
    if (sort === "most-supported") {
      const supportCount = asNumber(cursor.sort_number, Number.NaN);
      if (Number.isFinite(supportCount)) {
        query = query.or(`support_count.lt.${supportCount},and(support_count.eq.${supportCount},created_at.lt.${cursorCreatedAt}),and(support_count.eq.${supportCount},created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
      }
    } else if (sort === "ending-soon") {
      const supportDeadlineAt = readCursorDate(cursor, "sort_date");
      if (supportDeadlineAt) {
        query = query.or(`support_deadline_at.gt.${supportDeadlineAt},and(support_deadline_at.eq.${supportDeadlineAt},created_at.lt.${cursorCreatedAt}),and(support_deadline_at.eq.${supportDeadlineAt},created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
      } else {
        query = query.is("support_deadline_at", null).or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
      }
    } else {
      query = applyDescendingDateCursor(query, cursor, "created_at");
    }
  }

  const { data, error } = await query.range(range.from, range.to);
  if (error) throw error;
  const rows = (data ?? [])
    .filter((issue) => canReadIssue(issue as JsonRecord, auth))
    .map((issue) => issueToReadableResponse(issue as JsonRecord, auth));
  const lastIssue = rows[Math.min(pageSize - 1, rows.length - 1)];
  return {
    cursor: rows.length > pageSize && lastIssue
      ? {
        id: lastIssue.id,
        created_at: lastIssue.created_at_ms,
        sort_date: sort === "ending-soon" ? lastIssue.support_deadline_at_ms : undefined,
        sort_number: sort === "most-supported" ? lastIssue.support_count : undefined,
      }
      : null,
    hasMore: rows.length > pageSize,
    issues: rows.slice(0, pageSize),
    limited: rows.length > pageSize,
  };
}

async function listUserIssues(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 20)), 1), 50);
  const sort = asString(payload.sort, "latest");
  let query = supabase
    .schema("app_private")
    .from("issues")
    .select("*")
    .eq("author_uid", auth.uid);
  const orderColumn = sort === "most-supported" ? "support_count" : sort === "ending-soon" ? "support_deadline_at" : "created_at";
  query = query.order(orderColumn, { ascending: sort === "ending-soon", nullsFirst: false });
  if (orderColumn !== "created_at") query = query.order("created_at", { ascending: false });
  query = query.order("id", { ascending: false });
  const cursor = readCursor(payload);
  const cursorId = asUuid(cursor.id);
  const cursorCreatedAt = readCursorDate(cursor, "created_at");
  if (cursorId && cursorCreatedAt) {
    if (sort === "most-supported") {
      const count = asNumber(cursor.sort_number, Number.NaN);
      if (Number.isFinite(count)) query = query.or(`support_count.lt.${count},and(support_count.eq.${count},created_at.lt.${cursorCreatedAt}),and(support_count.eq.${count},created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
    } else if (sort === "ending-soon") {
      const deadline = readCursorDate(cursor, "sort_date");
      if (deadline) query = query.or(`support_deadline_at.gt.${deadline},and(support_deadline_at.eq.${deadline},created_at.lt.${cursorCreatedAt}),and(support_deadline_at.eq.${deadline},created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
    } else {
      query = applyDescendingDateCursor(query, cursor, "created_at");
    }
  }
  const { data, error } = await query.limit(pageSize + 1);
  if (error) throw error;
  const rows = (data ?? []).map((issue) => issueToReadableResponse(issue as JsonRecord, auth));
  const last = rows[Math.min(pageSize - 1, rows.length - 1)];
  return {
    issues: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
    cursor: rows.length > pageSize && last ? {
      id: last.id,
      created_at: last.created_at_ms,
      sort_date: sort === "ending-soon" ? last.support_deadline_at_ms : undefined,
      sort_number: sort === "most-supported" ? last.support_count : undefined,
    } : null,
  };
}

async function listSupportedIssueIds(auth: AuthContext, supabase: BackendSupabase) {
  const { data, error } = await supabase
    .schema("app_private")
    .from("supports")
    .select("issue_id")
    .eq("uid", auth.uid)
    .limit(500);
  if (error) throw error;
  return { issueIds: (data ?? []).map((support) => support.issue_id) };
}

async function getPrivateIssueAuthors(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const ids = action === "getPrivateIssueAuthor"
    ? [asString(payload.issueId)]
    : (Array.isArray(payload.issueIds) ? payload.issueIds.map((id) => asString(id)).filter(Boolean) : []);
  const { data, error } = await supabase.schema("app_private").from("private_issue_authors").select("*").in("issue_id", ids);
  if (error) throw error;
  const authors = Object.fromEntries((data ?? [])
    .filter((author) => auth.isAdmin || author.author_uid === auth.uid)
    .map((author) => [author.issue_id, author]));
  return action === "getPrivateIssueAuthor" ? { author: authors[ids[0]] ?? {} } : { authors };
}

export function isIssueReadAction(action: string) {
  return action === "getIssue"
    || action === "listIssues"
    || action === "searchIssues"
    || action === "listUserIssues"
    || action === "listMySupportedIssueIds"
    || action === "getPrivateIssueAuthor"
    || action === "batchGetPrivateIssueAuthors";
}

export async function handleIssueReadAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "getIssue") {
    const issue = await selectIssue(supabase, asString(payload.issueId));
    if (!canReadIssue(issue, auth)) throw new Error("not-found");
    return { issue: issueToReadableResponse(issue, auth) };
  }
  if (action === "listIssues" || action === "searchIssues") return listIssues(action, payload, auth, supabase);
  if (action === "listUserIssues") return listUserIssues(payload, auth, supabase);
  if (action === "listMySupportedIssueIds") return listSupportedIssueIds(auth, supabase);
  if (action === "getPrivateIssueAuthor" || action === "batchGetPrivateIssueAuthors") {
    return getPrivateIssueAuthors(action, payload, auth, supabase);
  }
  throw new Error("unsupported-action");
}
