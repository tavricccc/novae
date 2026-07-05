import { asString } from "../_shared/http.ts";
import { announcementCursor, announcementToResponse } from "./announcement-shared.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asNumber, asUuid, readCursor, readCursorDate } from "./utils.ts";

async function listAnnouncements(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 10)), 1), 30);
  const sort = asString(payload.sort, "latest");
  const orderColumn = sort === "most-liked" ? "like_count" : sort === "most-commented" ? "comment_count" : "published_at";
  let query = supabase.schema("app_private").from("announcements").select("*").order(orderColumn, { ascending: false });
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
  const announcements = (data ?? []).map((item) => announcementToResponse(item as JsonRecord, liked.has(item.id)));
  const lastAnnouncement = announcements[Math.min(pageSize - 1, announcements.length - 1)];
  return {
    announcements: announcements.slice(0, pageSize),
    cursor: announcements.length > pageSize && lastAnnouncement ? announcementCursor(lastAnnouncement, sort) : null,
    hasMore: announcements.length > pageSize,
  };
}

async function getAnnouncement(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const { data, error } = await supabase.schema("app_private").from("announcements").select("*").eq("id", asString(payload.announcementId)).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not-found");
  const { data: like } = await supabase.schema("app_private").from("announcement_likes").select("uid").eq("uid", auth.uid).eq("announcement_id", asString(data.id)).maybeSingle();
  return { announcement: announcementToResponse(data as JsonRecord, Boolean(like)) };
}

export function isAnnouncementReadAction(action: string) {
  return action === "listAnnouncements" || action === "getAnnouncement";
}

export async function handleAnnouncementReadAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "listAnnouncements") return listAnnouncements(payload, auth, supabase);
  if (action === "getAnnouncement") return getAnnouncement(payload, auth, supabase);
  throw new Error("unsupported-action");
}
