import { BACKEND_ACTION_POLICIES } from "../_shared/backend-action-policies.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimits, utcHourWindow, utcMinuteWindow, utcSecondWindow } from "../_shared/upstash-rate-limit.ts";
import { taipeiDayWindow } from "./utils.ts";
import type { JsonRecord } from "./types.ts";

const extraLimits = {
  announcementCreateDaily: { actionName: "announcement.create", window: taipeiDayWindow, config: RATE_LIMITS.announcementCreateDaily },
  avatarCacheDaily: { actionName: "avatar.cache", window: taipeiDayWindow, config: RATE_LIMITS.avatarCacheDaily },
  commentCreateHourly: { actionName: "comment.create", window: utcHourWindow, config: RATE_LIMITS.commentCreateHourly },
  destructiveWriteHourly: { actionName: "content.delete", window: utcHourWindow, config: RATE_LIMITS.destructiveWriteHourly },
  facilityAffectedToggleHourly: { actionName: "facility.affected", window: utcHourWindow, config: RATE_LIMITS.facilityAffectedToggleHourly },
  facilityCreateDaily: { actionName: "facility.create", window: taipeiDayWindow, config: RATE_LIMITS.facilityCreateDaily },
  imageUploadDaily: { actionName: "image-upload.create", window: taipeiDayWindow, config: RATE_LIMITS.imageUploadDaily },
  issueCreateDaily: { actionName: "issue.create", window: taipeiDayWindow, config: RATE_LIMITS.issueCreateDaily },
  moderationWriteHourly: { actionName: "content.moderate", window: utcHourWindow, config: RATE_LIMITS.moderationWriteHourly },
  preferenceWriteHourly: { actionName: "preference.write", window: utcHourWindow, config: RATE_LIMITS.preferenceWriteHourly },
  pushTokenWriteHourly: { actionName: "push-token.write", window: utcHourWindow, config: RATE_LIMITS.pushTokenWriteHourly },
  roleWriteHourly: { actionName: "role.write", window: utcHourWindow, config: RATE_LIMITS.roleWriteHourly },
  supportToggleHourly: { actionName: "support.toggle", window: utcHourWindow, config: RATE_LIMITS.supportToggleHourly },
  announcementLikeHourly: { actionName: "announcement.like", window: utcHourWindow, config: RATE_LIMITS.announcementLikeHourly },
  facilityStatusUpdateHourly: { actionName: "facility.status", window: utcHourWindow, config: RATE_LIMITS.facilityStatusUpdateHourly },
} as const;

export async function claimBackendActionBusinessLimit(action: string, payload: JsonRecord, uid: string) {
  const policy = BACKEND_ACTION_POLICIES[action as keyof typeof BACKEND_ACTION_POLICIES];
  if (!policy || !("extraLimit" in policy)) return;
  const extra = extraLimits[policy.extraLimit];
  const units = "unitsPath" in policy && policy.unitsPath === "payload.images" && Array.isArray(payload.images)
    ? Math.max(1, payload.images.length)
    : 1;
  await claimFixedWindowRateLimits([{
    actionName: extra.actionName,
    config: extra.config,
    identifier: uid,
    units,
    window: extra.window(),
  }]);
}

export async function claimBackendHealthcheckRateLimit() {
  await claimFixedWindowRateLimits([
    { identifier: "global", actionName: "backend.healthcheck.second", window: utcSecondWindow(), config: RATE_LIMITS.backendHealthcheckSecond },
    { identifier: "global", actionName: "backend.healthcheck", window: utcMinuteWindow(), config: RATE_LIMITS.backendHealthcheckMinute },
  ]);
}
