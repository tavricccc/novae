import { asRecord, asString } from "../shared/http.ts";
import type { AuthContext, BackendDatabase, JsonRecord } from "./types.ts";
import { asNumber, readCursor, readCursorDate, asUuid } from "./utils.ts";
import { requiredText } from "./validation.ts";
import { settledSegments } from "./segments.ts";

const PUSH_TOKEN_LIMITS = {
  deviceId: 160,
  platform: 120,
  token: 4096,
  userAgent: 512,
} as const;

async function* getNotificationSnapshot(
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  const requestedSources = Array.isArray(payload.sources)
    ? payload.sources.map((source) => readNotificationSource({ source }))
      .filter((source, index, items) => items.indexOf(source) === index)
    : ["broadcast", "user"];
  const sources = requestedSources.filter((source) => source !== "admin" || auth.isAdmin);
  const pages = Promise.all(sources.map(async (source) => {
    const { data, error } = await database.call("app_api", "backend_list_notifications", {
      actor_uid: auth.uid,
      actor_is_admin: auth.isAdmin,
      notification_source: source,
      page_size: 30,
      cursor_id: null,
      cursor_created_at: null,
    });
    if (error) throw error;
    return [source, data] as const;
  })).then((entries) => Object.fromEntries(entries));
  const state = database.call("app_api", "backend_get_notification_read_state", {
    actor_uid: auth.uid,
  }).then((stateResult) => {
    if (stateResult.error) throw stateResult.error;
    return stateResult.data;
  });

  yield { data: new Date().toISOString(), key: "openedAt" };
  yield* settledSegments({ pages, state });
}

export function isNotificationAction(action: string) {
  return action === "listNotificationPages"
    || action === "getNotificationSnapshot"
    || action === "getNotificationReadState"
    || action === "getNotificationUnreadHint"
    || action === "markNotificationsOpened"
    || action === "getPushNotificationPreference"
    || action === "getPlatformAdminNotificationPreferences"
    || action === "registerPushToken"
    || action === "unregisterPushToken"
    || action === "updatePlatformAdminNotificationPreferences";
}

function readNotificationSource(payload: JsonRecord) {
  const source = asString(payload.source, "broadcast");
  return source === "admin" || source === "user" ? source : "broadcast";
}

function readNotificationCursorDate(cursor: JsonRecord) {
  const normalized = readCursorDate(cursor, "createdAt");
  const original = asString(cursor.createdAt);
  // PostgreSQL cursors carry microseconds; Date.toISOString() would discard them.
  return normalized && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(original)
    ? original
    : normalized;
}

function readDeviceId(payload: JsonRecord) {
  return asString(payload.deviceId);
}

function readPermission(payload: JsonRecord) {
  const permission = asString(payload.permission, "default");
  return permission === "default" || permission === "denied" || permission === "granted"
    ? permission
    : "default";
}

function optionalLimitedText(value: unknown, field: string, maxLength: number) {
  const text = asString(value);
  if (text.length > maxLength) throw new Error(`${field}-too-long`);
  return text;
}

export async function handleNotificationAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  database: BackendDatabase,
) {
  if (action === "getNotificationSnapshot") {
    return getNotificationSnapshot(payload, auth, database);
  }

  if (action === "listNotificationPages") {
    const requests = Array.isArray(payload.requests) ? payload.requests.slice(0, 3) : [];
    const pages = await Promise.all(requests.map(async (value) => {
      const request = asRecord(value);
      const source = readNotificationSource(request);
      if (source === "admin" && !auth.isAdmin) throw new Error("permission-denied");
      const cursor = readCursor(request);
      const { data, error } = await database.call("app_api", "backend_list_notifications", {
        actor_uid: auth.uid,
        actor_is_admin: auth.isAdmin,
        notification_source: source,
        page_size: Math.min(Math.max(Math.round(asNumber(request.pageSize, 10)), 1), 30),
        cursor_id: asUuid(cursor.id) || null,
        cursor_created_at: readNotificationCursorDate(cursor) || null,
      });
      if (error) throw error;
      return [source, data] as const;
    }));
    return { pages: Object.fromEntries(pages) };
  }

  if (action === "getNotificationReadState") {
    const { data, error } = await database.call("app_api", "backend_get_notification_read_state", {
      actor_uid: auth.uid,
    });
    if (error) throw error;
    return { state: data };
  }

  if (action === "getNotificationUnreadHint") {
    const { data, error } = await database.call("app_api", "backend_get_notification_unread_hint", {
      actor_is_admin: auth.isAdmin,
      actor_uid: auth.uid,
    });
    if (error) throw error;
    return data;
  }

  if (action === "markNotificationsOpened") {
    const openedAt = new Date().toISOString();
    const { data, error } = await database.call("app_api", "backend_mark_notifications_opened", {
      actor_uid: auth.uid,
      opened_at: openedAt,
    });
    if (error) throw error;
    return data;
  }

  if (action === "unregisterPushToken") {
    const deviceId = requiredText(payload.deviceId, "deviceId", PUSH_TOKEN_LIMITS.deviceId);
    await database.sql`delete from app_private.push_tokens where uid = ${auth.uid} and device_id = ${deviceId}`;
    return { success: true };
  }

  if (action === "registerPushToken") {
    const token = requiredText(payload.token, "token", PUSH_TOKEN_LIMITS.token);
    const deviceId = requiredText(payload.deviceId, "deviceId", PUSH_TOKEN_LIMITS.deviceId);
    const { data, error } = await database.call("app_api", "backend_register_push_token", {
      actor_uid: auth.uid,
      device_id: deviceId,
      token,
      permission: readPermission(payload),
      platform: optionalLimitedText(payload.platform, "platform", PUSH_TOKEN_LIMITS.platform),
      user_agent: optionalLimitedText(payload.userAgent, "userAgent", PUSH_TOKEN_LIMITS.userAgent),
    });
    if (error) throw error;
    return data;
  }

  if (action === "updatePlatformAdminNotificationPreferences") {
    if (!auth.isAdmin) throw new Error("permission-denied");
    const preferences = asRecord(payload.preferences);
    const { data, error } = await database.call("app_api", "backend_update_platform_admin_notification_preferences", {
      actor_uid: auth.uid,
      comment_notifications_enabled: preferences.commentNotifications === true,
      facility_notifications_enabled: preferences.facilityNotifications === true,
      issue_notifications_enabled: preferences.issueNotifications === true,
    });
    if (error) throw error;
    return data;
  }

  if (action === "getPlatformAdminNotificationPreferences") {
    if (!auth.isAdmin) throw new Error("permission-denied");
    const { data, error } = await database.call("app_api", "backend_get_platform_admin_notification_preferences", {
      actor_uid: auth.uid,
    });
    if (error) throw error;
    return data;
  }

  if (action === "getPushNotificationPreference") {
    const { data, error } = await database.call("app_api", "backend_push_notification_preference", {
      actor_uid: auth.uid,
      device_id: readDeviceId(payload),
      permission: readPermission(payload),
    });
    if (error) throw error;
    return data;
  }

  throw new Error("invalid-action");
}
