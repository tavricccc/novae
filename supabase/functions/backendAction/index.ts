import { createClient } from "npm:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/env.ts";
import { createCloudinaryUploadSignature } from "../_shared/cloudinary.ts";
import { requireEligibleFirebaseUser } from "../_shared/firebase-auth.ts";
import {
  asRecord,
  asString,
  errorMessage,
  errorStatus,
  handleCorsPreflight,
  jsonResponse,
  readJsonRecord,
  requireMethod,
} from "../_shared/http.ts";

type JsonRecord = Record<string, unknown>;

interface AuthContext {
  email: string;
  isAdmin: boolean;
  name: string;
  photoUrl: string | null;
  uid: string;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asDateIso(value: unknown) {
  const rawValue = typeof value === "number" || typeof value === "string" ? value : "";
  const date = new Date(rawValue);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function asUuid(value: unknown) {
  const text = asString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(text)
    ? text
    : "";
}

function toMs(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function issueToResponse(issue: JsonRecord) {
  return {
    ...issue,
    created_at_ms: toMs(issue.created_at),
    updated_at_ms: toMs(issue.updated_at),
    support_deadline_at_ms: toMs(issue.support_deadline_at),
    response_deadline_at_ms: toMs(issue.response_deadline_at),
    support_met_at_ms: toMs(issue.support_met_at),
  };
}

function commentToResponse(comment: JsonRecord) {
  return {
    ...comment,
    created_at_ms: toMs(comment.created_at),
    updated_at_ms: toMs(comment.updated_at),
  };
}

function notificationToResponse(notification: JsonRecord, openedAt: string | null) {
  return {
    ...notification,
    created_at_ms: toMs(notification.created_at),
    is_read: openedAt ? String(notification.created_at) <= openedAt : false,
  };
}

async function requireAuth(supabase: ReturnType<typeof createClient>, request: Request): Promise<AuthContext> {
  const firebaseUser = await requireEligibleFirebaseUser(request);

  const { data: role, error } = await supabase
    .schema("app_private")
    .from("user_roles")
    .select("role")
    .eq("uid", firebaseUser.uid)
    .maybeSingle();
  if (error) throw error;

  return {
    email: firebaseUser.email,
    isAdmin: role?.role === "admin",
    name: firebaseUser.name,
    photoUrl: firebaseUser.photoUrl,
    uid: firebaseUser.uid,
  };
}

function requireAdmin(auth: AuthContext) {
  if (!auth.isAdmin) throw new Error("permission-denied");
}

async function handleHealthcheck(request: Request, supabase: ReturnType<typeof createClient>) {
  const expected = requireEnv("WEBHOOK_SECRET");
  if (request.headers.get("x-healthcheck-secret") !== expected) {
    throw new Error("permission-denied");
  }

  requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("FIREBASE_WEB_API_KEY");
  requireEnv("ALLOWED_DOMAIN");

  const { error } = await supabase
    .schema("app_private")
    .from("user_roles")
    .select("uid")
    .limit(1);
  if (error) throw error;

  return { ok: true };
}

async function selectIssue(supabase: ReturnType<typeof createClient>, issueId: string) {
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

async function upsertNotificationState(supabase: ReturnType<typeof createClient>, uid: string) {
  const { data, error } = await supabase
    .schema("app_private")
    .from("notification_states")
    .upsert({ uid }, { onConflict: "uid" })
    .select("*")
    .single();
  if (error) throw error;
  return data as JsonRecord;
}

function cursorRange(pageSize: number) {
  return { from: 0, to: Math.max(0, Math.min(pageSize, 50)) };
}

function readCursor(payload: JsonRecord) {
  return asRecord(payload.cursor);
}

function readCursorDate(payload: JsonRecord, key: string, fallbackKey?: string) {
  return asDateIso(payload[key] ?? (fallbackKey ? payload[fallbackKey] : undefined));
}

function applyDescendingDateCursor<TQuery>(
  query: TQuery,
  cursor: JsonRecord,
  dateColumn: string,
) {
  const id = asUuid(cursor.id);
  const date = readCursorDate(cursor, `${dateColumn}Ms`, dateColumn);
  if (!id || !date || typeof query !== "object" || query === null || !("or" in query)) return query;
  return (query as { or: (filters: string) => TQuery }).or(
    `${dateColumn}.lt.${date},and(${dateColumn}.eq.${date},id.lt.${id})`,
  );
}

function applyAscendingDateCursor<TQuery>(
  query: TQuery,
  cursor: JsonRecord,
  dateColumn: string,
) {
  const id = asUuid(cursor.id);
  const date = readCursorDate(cursor, `${dateColumn}Ms`, dateColumn);
  if (!id || !date || typeof query !== "object" || query === null || !("or" in query)) return query;
  return (query as { or: (filters: string) => TQuery }).or(
    `${dateColumn}.gt.${date},and(${dateColumn}.eq.${date},id.gt.${id})`,
  );
}

function commentCursor(comment: JsonRecord) {
  return { id: comment.id, createdAtMs: comment.created_at_ms };
}

function announcementCursor(announcement: JsonRecord, sort: string) {
  const cursor: JsonRecord = {
    id: announcement.id,
    publishedAtMs: announcement.published_at_ms,
  };
  if (sort === "most-liked") cursor.sortNumber = announcement.like_count;
  if (sort === "most-commented") cursor.sortNumber = announcement.comment_count;
  return cursor;
}

function notificationCursor(notification: JsonRecord) {
  return { id: notification.id, createdAtMs: notification.created_at_ms };
}

const idempotentActions = new Set([
  "createImageUploadSession",
  "finalizeImageUpload",
  "deleteUploadedImage",
  "createIssue",
  "moderateIssueStatus",
  "toggleSupport",
  "deleteIssue",
  "createComment",
  "deleteComment",
  "createAnnouncement",
  "updateAnnouncement",
  "deleteAnnouncement",
  "createAnnouncementComment",
  "deleteAnnouncementComment",
]);

async function runWithIdempotency(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: ReturnType<typeof createClient>,
  execute: () => Promise<JsonRecord>,
) {
  const requestId = asString(payload.requestId);
  if (!requestId || !idempotentActions.has(action)) {
    return await execute();
  }

  const { data: claimData, error: claimError } = await supabase
    .schema("app_api")
    .rpc("claim_idempotency_key", {
      action_name: action,
      actor_uid: auth.uid,
      request_id: requestId,
    })
    .single();
  if (claimError) throw claimError;

  const claim = asRecord(claimData);
  if (claim.completed === true) return asRecord(claim.response);
  if (claim.claimed !== true) throw new Error("request-in-progress");

  try {
    const response = await execute();
    const { error: completeError } = await supabase
      .schema("app_api")
      .rpc("complete_idempotency_key", {
        action_name: action,
        action_response: response,
        actor_uid: auth.uid,
        request_id: requestId,
      });
    if (completeError) throw completeError;
    return response;
  } catch (error) {
    await supabase
      .schema("app_api")
      .rpc("release_idempotency_key", {
        action_name: action,
        actor_uid: auth.uid,
        request_id: requestId,
      });
    throw error;
  }
}

async function handleAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: ReturnType<typeof createClient>,
) {
  if (action === "recordPlatformVisit") {
    const { error } = await supabase.schema("app_private").from("user_profiles").upsert({
      uid: auth.uid,
      display_name: auth.name,
      photo_url: auth.photoUrl,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "uid" });
    if (error) throw error;
    return { success: true };
  }

  if (action === "getCurrentUserRole") {
    return { role: auth.isAdmin ? "admin" : "user" };
  }

  if (action === "cacheUserAvatar") {
    const photoURL = asString(payload.photoURL);
    const { error } = await supabase.schema("app_private").from("user_profiles").upsert({
      uid: auth.uid,
      display_name: auth.name,
      photo_url: photoURL || auth.photoUrl,
      cached_photo_url: photoURL || auth.photoUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "uid" });
    if (error) throw error;
    return { photoUrl: photoURL || auth.photoUrl };
  }

  if (action === "getUserAvatarUrls") {
    const uids = Array.isArray(payload.uids) ? payload.uids.map((uid) => asString(uid)).filter(Boolean).slice(0, 50) : [];
    const { data, error } = await supabase.schema("app_private").from("user_profiles").select("uid,cached_photo_url,photo_url").in("uid", uids);
    if (error) throw error;
    return {
      avatars: Object.fromEntries((data ?? []).map((profile) => [
        profile.uid,
        profile.cached_photo_url ?? profile.photo_url ?? null,
      ])),
    };
  }

  if (action === "createImageUploadSession") {
    const uploadId = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `srp/${auth.uid}`;
    const publicId = uploadId;
    const params = { folder, public_id: publicId, timestamp: String(timestamp) };
    const { error } = await supabase.schema("app_private").from("uploads").insert({
      id: uploadId,
      owner_uid: auth.uid,
      cloudinary_public_id: `${folder}/${publicId}`,
      status: "pending",
      visibility: "authenticated",
      width: Math.round(asNumber(payload.width, 0)),
      height: Math.round(asNumber(payload.height, 0)),
      size_bytes: Math.round(asNumber(payload.size, 0)),
      content_type: asString(payload.contentType, "image/webp"),
    });
    if (error) throw error;
    return {
      apiKey: requireEnv("CLOUDINARY_API_KEY"),
      cloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
      folder,
      publicId,
      signature: await createCloudinaryUploadSignature(params),
      timestamp,
      uploadId,
    };
  }

  if (action === "finalizeImageUpload") {
    const uploadId = asString(payload.uploadId);
    const { data, error } = await supabase.schema("app_private").from("uploads")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", uploadId)
      .eq("owner_uid", auth.uid)
      .select("*")
      .single();
    if (error) throw error;
    return {
      height: data.height ?? 0,
      storagePath: data.cloudinary_public_id,
      uploadId: data.id,
      width: data.width ?? 0,
    };
  }

  if (action === "deleteUploadedImage") {
    const storagePath = asString(payload.storagePath);
    const uploadId = asString(payload.uploadId);
    let query = supabase.schema("app_private").from("uploads").select("*").eq("owner_uid", auth.uid);
    query = uploadId ? query.eq("id", uploadId) : query.eq("cloudinary_public_id", storagePath);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) {
      const { error: jobError } = await supabase.schema("app_private").from("deletion_jobs").insert({
        target_type: "upload",
        target_id: data.id,
        cloudinary_public_id: data.cloudinary_public_id,
      });
      if (jobError) throw jobError;
      await supabase.schema("app_private").from("uploads").delete().eq("id", data.id);
    }
    return { success: true };
  }

  if (action === "resolveUploadImageUrls") {
    const uploadIds = Array.isArray(payload.uploadIds) ? payload.uploadIds.map((id) => asString(id)).filter(Boolean).slice(0, 50) : [];
    const { data, error } = await supabase.schema("app_private").from("uploads")
      .select("id,cloudinary_public_id")
      .in("id", uploadIds)
      .in("status", ["ready", "attached"]);
    if (error) throw error;
    const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
    const expiresAtMs = Date.now() + 15 * 60 * 1000;
    return {
      errors: {},
      expiresAtByUploadId: Object.fromEntries((data ?? []).map((upload) => [upload.id, expiresAtMs])),
      expiresAtMs,
      urls: Object.fromEntries((data ?? []).map((upload) => [
        upload.id,
        `https://res.cloudinary.com/${cloudName}/image/upload/${upload.cloudinary_public_id}`,
      ])),
    };
  }

  if (action === "createIssue") {
    const title = asString(payload.title);
    const content = asString(payload.content);
    const category = asString(payload.category, "general");
    const { data, error } = await supabase.schema("app_private").from("issues").insert({
      author_uid: auth.uid,
      author_name: auth.name,
      author_photo_url: auth.photoUrl,
      category,
      content,
      status: "pending",
      title,
      title_search: title.toLowerCase(),
    }).select("*").single();
    if (error) throw error;
    await supabase.schema("app_private").from("outbox_events").insert({
      event_type: "issue.created",
      target_type: "issue",
      target_id: data.id,
      actor_uid: auth.uid,
      payload: { category, content, issue_id: data.id, title },
    });
    return { issue: issueToResponse(data as JsonRecord) };
  }

  if (action === "getIssue") {
    return { issue: issueToResponse(await selectIssue(supabase, asString(payload.issueId))) };
  }

  if (action === "listIssues" || action === "searchIssues") {
    const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 20)), 1), 50);
    const range = cursorRange(pageSize);
    const sort = asString(payload.sort) === "most-supported"
      ? "most-supported"
      : asString(payload.sort) === "ending-soon"
        ? "ending-soon"
        : "latest";
    let query = supabase.schema("app_private").from("issues").select("*")
      .eq("category", asString(payload.activeFilter));
    if (sort === "most-supported") {
      query = query
        .order("support_count", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else if (sort === "ending-soon") {
      query = query
        .order("support_deadline_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      query = query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    }
    const statusBucket = asString(payload.statusBucket, "active");
    query = statusBucket === "closed"
      ? query.in("status", ["auto-rejected", "review-rejected", "infeasible", "completed"])
      : query.in("status", ["under-review", "pending", "processing"]);
    if (action === "searchIssues") {
      query = query.ilike("title_search", `%${asString(payload.titleQuery).toLowerCase()}%`);
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
          query = query.is("support_deadline_at", null)
            .or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
        }
      } else {
        query = applyDescendingDateCursor(query, cursor, "created_at");
      }
    }
    query = query.range(range.from, range.to);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((issue) => issueToResponse(issue as JsonRecord));
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

  if (action === "listUserIssues") {
    const { data, error } = await supabase.schema("app_private").from("issues").select("*").eq("author_uid", auth.uid).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { issues: (data ?? []).map((issue) => issueToResponse(issue as JsonRecord)) };
  }

  if (action === "listMySupportedIssueIds") {
    const { data, error } = await supabase.schema("app_private").from("supports").select("issue_id").eq("uid", auth.uid).limit(500);
    if (error) throw error;
    return { issueIds: (data ?? []).map((support) => support.issue_id) };
  }

  if (action === "getPrivateIssueAuthor" || action === "batchGetPrivateIssueAuthors") {
    const ids = action === "getPrivateIssueAuthor"
      ? [asString(payload.issueId)]
      : (Array.isArray(payload.issueIds) ? payload.issueIds.map((id) => asString(id)).filter(Boolean) : []);
    const { data, error } = await supabase.schema("app_private").from("private_issue_authors").select("*").in("issue_id", ids);
    if (error) throw error;
    const authors = Object.fromEntries((data ?? []).map((author) => [author.issue_id, author]));
    return action === "getPrivateIssueAuthor" ? { author: authors[ids[0]] ?? {} } : { authors };
  }

  if (action === "moderateIssueStatus") {
    requireAdmin(auth);
    const issueId = asString(payload.issueId);
    const oldIssue = await selectIssue(supabase, issueId);
    const { data, error } = await supabase.schema("app_private").from("issues")
      .update({ status: asString(payload.status, "pending"), review_rejection_reason: asString(payload.reason) || null })
      .eq("id", issueId)
      .select("*")
      .single();
    if (error) throw error;
    await supabase.schema("app_private").from("outbox_events").insert({
      event_type: "issue.status_changed",
      target_type: "issue",
      target_id: issueId,
      actor_uid: auth.uid,
      payload: { old_status: oldIssue.status, new_status: data.status, title: data.title, issue_category: data.category },
    });
    return { issue: issueToResponse(data as JsonRecord) };
  }

  if (action === "toggleSupport" || action === "removeSupport") {
    const issueId = asString(payload.issueId);
    const { data: existing, error: existingError } = await supabase.schema("app_private").from("supports").select("issue_id").eq("issue_id", issueId).eq("uid", auth.uid).maybeSingle();
    if (existingError) throw existingError;
    const shouldRemove = action === "removeSupport" || existing;
    if (shouldRemove) {
      await supabase.schema("app_private").from("supports").delete().eq("issue_id", issueId).eq("uid", auth.uid);
    } else {
      await supabase.schema("app_private").from("supports").insert({ issue_id: issueId, uid: auth.uid });
    }
    const { data: updatedIssue, error: updatedIssueError } = await supabase.schema("app_private").from("issues").select("support_count").eq("id", issueId).single();
    if (updatedIssueError) throw updatedIssueError;
    return { success: true, supported: !shouldRemove, support_count: updatedIssue.support_count ?? 0 };
  }

  if (action === "deleteIssue") {
    const issue = await selectIssue(supabase, asString(payload.issueId));
    if (issue.author_uid !== auth.uid && !auth.isAdmin) throw new Error("permission-denied");
    const { error: outboxError } = await supabase.schema("app_private").from("outbox_events").insert({
      event_type: "issue.deleted",
      target_type: "issue",
      target_id: issue.id,
      actor_uid: auth.uid,
      payload: { author_uid: issue.author_uid, issue_category: issue.category, issue_id: issue.id, title: issue.title },
    });
    if (outboxError) throw outboxError;
    const { error } = await supabase.schema("app_private").from("issues").delete().eq("id", issue.id);
    if (error) throw error;
    return { success: true, issueId: issue.id };
  }

  if (action === "listComments") {
    const pageSize = 20;
    let query = supabase.schema("app_private").from("comments").select("*").eq("issue_id", asString(payload.issueId));
    query = applyAscendingDateCursor(query, readCursor(payload), "created_at");
    const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(pageSize + 1);
    if (error) throw error;
    const comments = (data ?? []).map((comment) => commentToResponse(comment as JsonRecord));
    const lastComment = comments[Math.min(pageSize - 1, comments.length - 1)];
    return {
      comments: comments.slice(0, pageSize),
      cursor: comments.length > pageSize && lastComment ? commentCursor(lastComment) : null,
      hasMore: comments.length > pageSize,
    };
  }

  if (action === "createComment") {
    const issueId = asString(payload.issueId);
    const { data, error } = await supabase.schema("app_private").from("comments").insert({
      issue_id: issueId,
      author_uid: auth.uid,
      author_name: auth.name,
      author_photo_url: auth.photoUrl,
      content: asString(payload.content),
      is_admin_comment: asBoolean(payload.isAdminComment) && auth.isAdmin,
    }).select("*").single();
    if (error) throw error;
    await supabase.schema("app_private").from("outbox_events").insert({
      event_type: "issue.comment_created",
      target_type: "issue",
      target_id: issueId,
      actor_uid: auth.uid,
      payload: { content: data.content, issue_id: issueId },
    });
    return { comment: commentToResponse(data as JsonRecord) };
  }

  if (action === "deleteComment") {
    const commentId = asString(payload.commentId);
    const { data } = await supabase.schema("app_private").from("comments").select("*").eq("id", commentId).maybeSingle();
    if (data && data.author_uid !== auth.uid && !auth.isAdmin) throw new Error("permission-denied");
    await supabase.schema("app_private").from("comments").delete().eq("id", commentId);
    return { success: true };
  }

  if (action === "createAnnouncement" || action === "updateAnnouncement" || action === "deleteAnnouncement") {
    requireAdmin(auth);
  }

  if (action === "listAnnouncements") {
    const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 10)), 1), 30);
    const sort = asString(payload.sort, "latest");
    const orderColumn = sort === "most-liked" ? "like_count" : sort === "most-commented" ? "comment_count" : "published_at";
    let query = supabase.schema("app_private").from("announcements").select("*")
      .order(orderColumn, { ascending: false });
    if (orderColumn !== "published_at") {
      query = query.order("published_at", { ascending: false });
    }
    query = query.order("id", { ascending: false });
    const cursor = readCursor(payload);
    const cursorId = asUuid(cursor.id);
    const cursorPublishedAt = readCursorDate(cursor, "publishedAtMs", "published_at");
    if (cursorId && cursorPublishedAt) {
      if (sort === "most-liked" || sort === "most-commented") {
        const sortNumber = asNumber(cursor.sortNumber, Number.NaN);
        if (Number.isFinite(sortNumber)) {
          query = query.or(`${orderColumn}.lt.${sortNumber},and(${orderColumn}.eq.${sortNumber},published_at.lt.${cursorPublishedAt}),and(${orderColumn}.eq.${sortNumber},published_at.eq.${cursorPublishedAt},id.lt.${cursorId})`);
        }
      } else {
        query = query.or(`published_at.lt.${cursorPublishedAt},and(published_at.eq.${cursorPublishedAt},id.lt.${cursorId})`);
      }
    }
    const { data, error } = await query.limit(pageSize + 1);
    if (error) throw error;
    const ids = (data ?? []).map((item) => item.id);
    const { data: likes } = ids.length
      ? await supabase.schema("app_private").from("announcement_likes").select("announcement_id").eq("uid", auth.uid).in("announcement_id", ids)
      : { data: [] };
    const liked = new Set((likes ?? []).map((like) => like.announcement_id));
    const announcements = (data ?? []).map((item) => ({
      ...item,
      currentUserLiked: liked.has(item.id),
      created_at_ms: toMs(item.created_at),
      updated_at_ms: toMs(item.updated_at),
      published_at_ms: toMs(item.published_at),
    }));
    const lastAnnouncement = announcements[Math.min(pageSize - 1, announcements.length - 1)];
    return {
      announcements: announcements.slice(0, pageSize),
      cursor: announcements.length > pageSize && lastAnnouncement ? announcementCursor(lastAnnouncement, sort) : null,
      hasMore: announcements.length > pageSize,
    };
  }

  if (action === "getAnnouncement") {
    const { data, error } = await supabase.schema("app_private").from("announcements").select("*").eq("id", asString(payload.announcementId)).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("not-found");
    const { data: like } = await supabase.schema("app_private").from("announcement_likes").select("uid").eq("uid", auth.uid).eq("announcement_id", data.id).maybeSingle();
    return { announcement: { ...data, currentUserLiked: Boolean(like), created_at_ms: toMs(data.created_at), updated_at_ms: toMs(data.updated_at), published_at_ms: toMs(data.published_at) } };
  }

  if (action === "createAnnouncement") {
    const { data, error } = await supabase.schema("app_private").from("announcements").insert({
      author_uid: auth.uid,
      author_name: auth.name || "管理員",
      author_photo_url: auth.photoUrl,
      title: asString(payload.title),
      content: asString(payload.content),
    }).select("*").single();
    if (error) throw error;
    await supabase.schema("app_private").from("outbox_events").insert({ event_type: "announcement.created", target_type: "announcement", target_id: data.id, actor_uid: auth.uid, payload: { content: data.content, title: data.title } });
    return { announcement: { ...data, created_at_ms: toMs(data.created_at), updated_at_ms: toMs(data.updated_at), published_at_ms: toMs(data.published_at) } };
  }

  if (action === "updateAnnouncement") {
    const { data, error } = await supabase.schema("app_private").from("announcements").update({ title: asString(payload.title), content: asString(payload.content) }).eq("id", asString(payload.announcementId)).select("*").single();
    if (error) throw error;
    await supabase.schema("app_private").from("outbox_events").insert({ event_type: "announcement.updated", target_type: "announcement", target_id: data.id, actor_uid: auth.uid, payload: { title: data.title } });
    return { announcement: { ...data, created_at_ms: toMs(data.created_at), updated_at_ms: toMs(data.updated_at), published_at_ms: toMs(data.published_at) } };
  }

  if (action === "deleteAnnouncement") {
    const announcementId = asString(payload.announcementId);
    await supabase.schema("app_private").from("outbox_events").insert({ event_type: "announcement.deleted", target_type: "announcement", target_id: announcementId, actor_uid: auth.uid, payload: { announcement_id: announcementId } });
    const { error } = await supabase.schema("app_private").from("announcements").delete().eq("id", announcementId);
    if (error) throw error;
    return { success: true };
  }

  if (action === "setAnnouncementLike") {
    const announcementId = asString(payload.announcementId);
    const liked = asBoolean(payload.liked);
    if (liked) {
      await supabase.schema("app_private").from("announcement_likes").upsert({ announcement_id: announcementId, uid: auth.uid });
    } else {
      await supabase.schema("app_private").from("announcement_likes").delete().eq("announcement_id", announcementId).eq("uid", auth.uid);
    }
    const { data: announcement, error } = await supabase.schema("app_private").from("announcements").select("like_count").eq("id", announcementId).single();
    if (error) throw error;
    return { liked, like_count: announcement.like_count ?? 0 };
  }

  if (action === "listAnnouncementComments") {
    const pageSize = 20;
    let query = supabase.schema("app_private").from("announcement_comments").select("*").eq("announcement_id", asString(payload.announcementId));
    query = applyAscendingDateCursor(query, readCursor(payload), "created_at");
    const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(pageSize + 1);
    if (error) throw error;
    const comments = (data ?? []).map((comment) => commentToResponse(comment as JsonRecord));
    const lastComment = comments[Math.min(pageSize - 1, comments.length - 1)];
    return {
      comments: comments.slice(0, pageSize),
      cursor: comments.length > pageSize && lastComment ? commentCursor(lastComment) : null,
      hasMore: comments.length > pageSize,
    };
  }

  if (action === "createAnnouncementComment") {
    const announcementId = asString(payload.announcementId);
    const { data, error } = await supabase.schema("app_private").from("announcement_comments").insert({
      announcement_id: announcementId,
      author_uid: auth.uid,
      author_name: auth.name,
      author_photo_url: auth.photoUrl,
      content: asString(payload.content),
      is_admin_comment: asBoolean(payload.isAdminComment) && auth.isAdmin,
    }).select("*").single();
    if (error) throw error;
    const { data: announcement, error: announcementError } = await supabase.schema("app_private").from("announcements").select("comment_count,title").eq("id", announcementId).single();
    if (announcementError) throw announcementError;
    await supabase.schema("app_private").from("outbox_events").insert({
      event_type: "announcement.comment_created",
      target_type: "announcement",
      target_id: announcementId,
      actor_uid: auth.uid,
      payload: { announcement_id: announcementId, content: data.content, title: announcement.title },
    });
    return { comment: commentToResponse(data as JsonRecord), comment_count: announcement.comment_count ?? 0 };
  }

  if (action === "deleteAnnouncementComment") {
    const commentId = asString(payload.commentId);
    const { data } = await supabase.schema("app_private").from("announcement_comments").select("*").eq("id", commentId).maybeSingle();
    if (data && data.author_uid !== auth.uid && !auth.isAdmin) throw new Error("permission-denied");
    const announcementId = data?.announcement_id ?? "";
    await supabase.schema("app_private").from("announcement_comments").delete().eq("id", commentId);
    const { data: announcement } = announcementId
      ? await supabase.schema("app_private").from("announcements").select("comment_count").eq("id", announcementId).single()
      : { data: null };
    return { success: true, announcement_id: announcementId, comment_count: announcement?.comment_count ?? 0 };
  }

  if (action === "listNotifications") {
    const source = asString(payload.source, "broadcast");
    const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 10)), 1), 30);
    const state = await upsertNotificationState(supabase, auth.uid);
    const openedAt = source === "admin" ? state.admin_opened_at : source === "user" ? state.user_opened_at : state.broadcast_opened_at;
    let query = supabase.schema("app_private").from("notifications").select("*").eq("source", source);
    if (source === "user") query = query.eq("recipient_uid", auth.uid);
    if (source === "admin" && !auth.isAdmin) return { notifications: [], cursor: null, hasMore: false };
    query = applyDescendingDateCursor(query, readCursor(payload), "created_at");
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
    const { data, error } = await query;
    if (error) throw error;
    const notifications = (data ?? []).map((notification) => notificationToResponse(notification as JsonRecord, openedAt));
    const lastNotification = notifications[Math.min(pageSize - 1, notifications.length - 1)];
    return {
      notifications: notifications.slice(0, pageSize),
      cursor: notifications.length > pageSize && lastNotification ? notificationCursor(lastNotification) : null,
      hasMore: notifications.length > pageSize,
    };
  }

  if (action === "getNotificationReadState") {
    const state = await upsertNotificationState(supabase, auth.uid);
    return { state: {
      ...state,
      admin_opened_at_ms: toMs(state.admin_opened_at),
      broadcast_opened_at_ms: toMs(state.broadcast_opened_at),
      user_opened_at_ms: toMs(state.user_opened_at),
    } };
  }

  if (action === "markNotificationsOpened") {
    const openedAt = new Date().toISOString();
    const { error } = await supabase.schema("app_private").from("notification_states").upsert({
      uid: auth.uid,
      admin_opened_at: openedAt,
      broadcast_opened_at: openedAt,
      user_opened_at: openedAt,
      updated_at: openedAt,
    }, { onConflict: "uid" });
    if (error) throw error;
    return { openedAtMs: Date.parse(openedAt), success: true };
  }

  if (action === "getPushNotificationPreference" || action === "registerPushToken" || action === "unregisterPushToken" || action === "updatePushNotificationPreferences") {
    const state = await upsertNotificationState(supabase, auth.uid);
    if (action === "registerPushToken") {
      await supabase.schema("app_private").from("push_tokens").upsert({
        uid: auth.uid,
        device_id: asString(payload.deviceId),
        token: asString(payload.token),
        permission: asString(payload.permission, "default"),
        platform: asString(payload.platform),
        user_agent: asString(payload.userAgent),
        updated_at: new Date().toISOString(),
      }, { onConflict: "uid,device_id" });
    }
    if (action === "unregisterPushToken") {
      const deviceId = asString(payload.deviceId);
      if (deviceId) await supabase.schema("app_private").from("push_tokens").delete().eq("uid", auth.uid).eq("device_id", deviceId);
    }
    if (action === "updatePushNotificationPreferences") {
      const preferences = asRecord(payload.preferences);
      await supabase.schema("app_private").from("notification_states").update({
        push_comments_enabled: preferences.comments !== false,
        push_issue_updates_enabled: preferences.issueUpdates !== false,
        updated_at: new Date().toISOString(),
      }).eq("uid", auth.uid);
    }
    const { count } = await supabase.schema("app_private").from("push_tokens").select("*", { count: "exact", head: true }).eq("uid", auth.uid);
    return {
      deviceEnabled: Boolean(asString(payload.deviceId)),
      enabled: (count ?? 0) > 0,
      personalPreferences: {
        comments: state.push_comments_enabled !== false,
        issueUpdates: state.push_issue_updates_enabled !== false,
      },
      permission: asString(payload.permission, "default"),
      tokenCount: count ?? 0,
    };
  }

  if (action === "getPlatformDashboard") {
    requireAdmin(auth);
    const [{ count: userCount }, { count: issueCount }, { count: commentCount }, { count: supportCount }, { count: outboxFailed }, { count: uploadPending }, { count: deletionPending }] = await Promise.all([
      supabase.schema("app_private").from("user_profiles").select("*", { count: "exact", head: true }),
      supabase.schema("app_private").from("issues").select("*", { count: "exact", head: true }),
      supabase.schema("app_private").from("comments").select("*", { count: "exact", head: true }),
      supabase.schema("app_private").from("supports").select("*", { count: "exact", head: true }),
      supabase.schema("app_private").from("outbox_events").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabase.schema("app_private").from("uploads").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.schema("app_private").from("deletion_jobs").select("*", { count: "exact", head: true }).in("status", ["pending", "failed"]),
    ]);
    return {
      stats: {
        comments_by_category: {},
        issues_by_category: {},
        last_activity_at_ms: Date.now(),
        total_comments_created: commentCount ?? 0,
        total_comments_deleted: 0,
        total_issues_created: issueCount ?? 0,
        total_issues_deleted: 0,
        total_supports_added: supportCount ?? 0,
        total_supports_removed: 0,
        total_users_seen: userCount ?? 0,
        updated_at_ms: Date.now(),
      },
      operations: {
        cleanup_backlog_capped: false,
        cleanup_backlog_count: deletionPending ?? 0,
        failed_notion_sync_capped: false,
        failed_notion_sync_count: 0,
        failed_outbox_capped: false,
        failed_outbox_count: outboxFailed ?? 0,
        failed_push_delivery_capped: false,
        failed_push_delivery_count: 0,
        next_sync_count: 0,
        oldest_pending_sync_at_ms: null,
        overall_status: (outboxFailed ?? 0) > 0 ? "attention" : "healthy",
        pending_notion_sync_capped: false,
        pending_notion_sync_count: 0,
        recent_failures: [],
        scheduled_maintenance: { completed_at_ms: null, error: "", failed_tasks: [], started_at_ms: null, status: "idle", updated_at_ms: null },
        stuck_upload_capped: false,
        stuck_upload_count: uploadPending ?? 0,
      },
    };
  }

  throw new Error(`Unsupported action: ${action}`);
}

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  const requestId = crypto.randomUUID();
  let action = "";

  try {
    const body = await readJsonRecord(request);
    action = asString(body.action);
    const payload = asRecord(body.payload);
    if (!action) throw new Error("missing action");

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    if (action === "healthcheck") {
      return jsonResponse(await handleHealthcheck(request, supabase));
    }

    const auth = await requireAuth(supabase, request);
    const data = await runWithIdempotency(
      action,
      payload,
      auth,
      supabase,
      () => handleAction(action, payload, auth, supabase),
    );
    return jsonResponse(data);
  } catch (error) {
    const status = errorStatus(error);
    console.error(JSON.stringify({
      action: action || "unknown",
      error: errorMessage(error),
      requestId,
      stack: error instanceof Error ? error.stack : undefined,
      status,
    }));
    return jsonResponse({ error: errorMessage(error), requestId }, { status });
  }
});
