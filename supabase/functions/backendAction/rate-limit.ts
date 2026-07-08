import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import {
  claimFixedWindowRateLimit,
  utcHourWindow,
  utcMinuteWindow,
  utcSecondWindow,
} from "../_shared/upstash-rate-limit.ts";

const readActions = new Set([
  "getCurrentUserRole",
  "getUserAvatarUrls",
  "getIssue",
  "listIssues",
  "searchIssues",
  "listUserIssues",
  "listComments",
  "listAnnouncements",
  "getAnnouncement",
  "listAnnouncementComments",
  "listNotifications",
  "getNotificationReadState",
  "getPushNotificationPreference",
  "getPlatformDashboard",
]);

const generalWriteActions = new Set([
  "recordPlatformVisit",
  "markNotificationsOpened",
  "updatePushNotificationPreferences",
]);

const uploadResolveActions = new Set([
  "resolveUploadImageUrls",
]);

const adminWriteActions = new Set([
  "moderateIssueStatus",
  "updateIssueResult",
  "deleteIssue",
  "createAnnouncement",
  "updateAnnouncement",
  "deleteAnnouncement",
]);

const sensitiveWriteActions = new Set([
  "createImageUploadSession",
  "finalizeImageUpload",
  "deleteUploadedImage",
  "createIssue",
  "toggleSupport",
  "removeSupport",
  "createComment",
  "deleteComment",
  "setAnnouncementLike",
  "createAnnouncementComment",
  "deleteAnnouncementComment",
  "registerPushToken",
  "unregisterPushToken",
  "cacheUserAvatar",
]);

export async function claimBackendActionRateLimit(uid: string, action: string) {
  if (readActions.has(action)) {
    await claimFixedWindowRateLimit(
      uid,
      `backend.read.${action}.second`,
      utcSecondWindow(),
      RATE_LIMITS.backendActionReadSecond,
    );
    await claimFixedWindowRateLimit(
      uid,
      `backend.read.${action}`,
      utcHourWindow(),
      RATE_LIMITS.backendActionReadHourly,
    );
    return;
  }

  if (generalWriteActions.has(action)) {
    await claimFixedWindowRateLimit(
      uid,
      `backend.write.${action}.second`,
      utcSecondWindow(),
      RATE_LIMITS.backendActionWriteSecond,
    );
    await claimFixedWindowRateLimit(
      uid,
      `backend.write.${action}`,
      utcHourWindow(),
      RATE_LIMITS.backendActionWriteHourly,
    );
    return;
  }

  if (uploadResolveActions.has(action)) {
    await claimFixedWindowRateLimit(
      uid,
      `backend.upload-resolve.${action}.second`,
      utcSecondWindow(),
      RATE_LIMITS.backendActionUploadResolveSecond,
    );
    await claimFixedWindowRateLimit(
      uid,
      `backend.upload-resolve.${action}`,
      utcHourWindow(),
      RATE_LIMITS.backendActionUploadResolveHourly,
    );
    return;
  }

  if (adminWriteActions.has(action)) {
    await claimFixedWindowRateLimit(
      uid,
      `backend.admin-write.${action}.second`,
      utcSecondWindow(),
      RATE_LIMITS.backendActionAdminWriteSecond,
    );
    await claimFixedWindowRateLimit(
      uid,
      `backend.admin-write.${action}`,
      utcHourWindow(),
      RATE_LIMITS.backendActionAdminWriteHourly,
    );
    return;
  }

  if (sensitiveWriteActions.has(action)) {
    await claimFixedWindowRateLimit(
      uid,
      `backend.sensitive-write.${action}.second`,
      utcSecondWindow(),
      RATE_LIMITS.backendActionSensitiveWriteSecond,
    );
    await claimFixedWindowRateLimit(
      uid,
      `backend.sensitive-write.${action}`,
      utcHourWindow(),
      RATE_LIMITS.backendActionSensitiveWriteHourly,
    );
    return;
  }

  await claimFixedWindowRateLimit(
    uid,
    `backend.unknown.${action || "missing"}.second`,
    utcSecondWindow(),
    RATE_LIMITS.backendActionSensitiveWriteSecond,
  );
  await claimFixedWindowRateLimit(
    uid,
    `backend.unknown.${action || "missing"}`,
    utcHourWindow(),
    RATE_LIMITS.backendActionSensitiveWriteHourly,
  );
}

export async function claimBackendHealthcheckRateLimit() {
  await claimFixedWindowRateLimit(
    "global",
    "backend.healthcheck.second",
    utcSecondWindow(),
    RATE_LIMITS.backendHealthcheckSecond,
  );
  await claimFixedWindowRateLimit(
    "global",
    "backend.healthcheck",
    utcMinuteWindow(),
    RATE_LIMITS.backendHealthcheckMinute,
  );
}
