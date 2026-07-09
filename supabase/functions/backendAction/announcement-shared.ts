import type { JsonRecord } from "./types.ts";
import { toMs } from "./utils.ts";

export function announcementCursor(announcement: JsonRecord, sort: string) {
  const cursor: JsonRecord = {
    id: announcement.id,
    publishedAtMs: announcement.published_at_ms,
  };
  if (sort === "most-liked") cursor.sortNumber = announcement.like_count;
  if (sort === "most-commented") cursor.sortNumber = announcement.comment_count;
  return cursor;
}

export function announcementToResponse(announcement: JsonRecord, liked = false) {
  return {
    ...announcement,
    currentUserLiked: liked,
    published_at_ms: toMs(announcement.published_at),
  };
}
