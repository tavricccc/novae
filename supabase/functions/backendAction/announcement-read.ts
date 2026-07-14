import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asNumber, asUuid, readCursor, readCursorDate } from "./utils.ts";

async function listAnnouncements(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const pageSize = Math.min(Math.max(Math.round(asNumber(payload.pageSize, 30)), 1), 50);
  const cursor = readCursor(payload);
  const { data, error } = await supabase.schema("app_api").rpc("backend_list_announcements", {
    actor_uid: auth.uid,
    page_size: pageSize,
    cursor_id: asUuid(cursor.id) || null,
    cursor_published_at: readCursorDate(cursor, "publishedAtMs", "published_at") || null,
  });
  if (error) throw error;
  return data;
}

async function getAnnouncement(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const announcementId = asUuid(payload.announcementId);
  if (!announcementId) throw new Error("not-found");
  const { data, error } = await supabase.schema("app_api").rpc("backend_get_announcement", {
    announcement_id: announcementId,
    actor_uid: auth.uid,
  });
  if (error) throw error;
  return { announcement: data };
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
