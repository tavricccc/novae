"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sessionDebug } from "@/lib/session-debug";
import { setPushSession } from "@/lib/push-session";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";
import { readCachedAvatar, writeCachedAvatar } from "@/lib/avatar-cache";
import { clearContentEntityScope } from "@/lib/content-entity-store";
import { clearViewMemoryScope } from "@/lib/view-memory-cache";
import { clearSupportedIssueMemory } from "@/lib/supported-issue-memory";
import { ensureBackendProfile } from "@/services/backend-auth";
import {
  fetchCurrentUserRole,
  seedSessionAccess,
  type PermissionCode,
  type SessionAccess,
  type RoleCode,
} from "@/services/session-role";
import {
  applyContentVersionsSnapshot,
  ensureContentVersionsFresh,
  resetContentVersionState,
} from "@/services/content-versions";
import { fetchSessionBootstrap } from "@/services/session-bootstrap";
import { stopContentRealtimeSession } from "@/services/realtime-events";
import {
  clearContentReadCache,
  clearContentReadMemoryCache,
  setContentCacheScope,
} from "@/services/content-read-cache";
import { clearResolvedUploadCache } from "@/services/uploads";
import { cacheUserAvatar } from "@/services/users-write";
import { seedNotificationUnreadHint } from "@/services/notifications";
import {
  clearCategoryCatalog,
  ensureCategoryCatalog,
  seedCategoryCatalog,
} from "@/hooks/use-categories";
import {
  consumePreparedLoginEntrance,
  verifyRestoredSession,
} from "@/services/session-auth";
import { ApiRequestError } from "@/lib/api-error";
import {
  validateBasicUser,
  validateUserAgainstToken,
  type ValidationResult,
} from "@/services/session-validation";
const VISIT_RECORD_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const VISIT_RECORDED_AT_KEY = "novae:platform-visit-recorded-at";

export type StartupPhase =
  | "session"
  | "security"
  | "account"
  | "profile"
  | "access"
  | "content"
  | "ready";

export interface SessionState {
  appReady: boolean;
  authChecking: boolean;
  customPhotoUrl: string | null;
  error: string;
  initialized: boolean;
  loading: boolean;
  managedFacilityCategoryIds: string[];
  managedIssueCategoryIds: string[];
  permissions: PermissionCode[];
  roleLoading: boolean;
  restoringSession: boolean;
  roles: RoleCode[];
  setupCompleted: boolean;
  startupPhase: StartupPhase;
  user: User | null;
  userRole: "admin" | "user";
}

const listeners = new Set<() => void>();
export const initialSessionState: SessionState = {
  appReady: false,
  authChecking: true,
  customPhotoUrl: null,
  error: "",
  initialized: false,
  loading: true,
  managedFacilityCategoryIds: [],
  managedIssueCategoryIds: [],
  permissions: [],
  roleLoading: false,
  restoringSession: false,
  roles: [],
  setupCompleted: false,
  startupPhase: "session",
  user: null,
  userRole: "user",
};
let state: SessionState = initialSessionState;
let booted = false;
let verificationSerial = 0;
let pendingAuthRejection = "";

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patch(next: Partial<SessionState>) {
  state = { ...state, ...next };
  emit();
}

function shouldRecordPlatformVisit() {
  const recordedAt = Number.parseInt(
    readLocalStorage(VISIT_RECORDED_AT_KEY) || "0",
    10,
  );
  return !(
    Number.isFinite(recordedAt) &&
    Date.now() - recordedAt < VISIT_RECORD_INTERVAL_MS
  );
}

function clearActiveSessionData() {
  void setPushSession(null).catch(() => undefined);
  clearContentEntityScope(state.user?.uid);
  clearViewMemoryScope(state.user?.uid);
  clearSupportedIssueMemory();
  stopContentRealtimeSession();
  clearCategoryCatalog();
  clearResolvedUploadCache();
  clearContentReadCache();
  resetContentVersionState();
}

function resetAccess(next: Partial<SessionState> = {}) {
  patch({
    customPhotoUrl: null,
    managedFacilityCategoryIds: [],
    managedIssueCategoryIds: [],
    permissions: [],
    roleLoading: false,
    roles: [],
    setupCompleted: false,
    userRole: "user",
    ...next,
  });
}

async function rejectUser(reason: string) {
  verificationSerial += 1;
  pendingAuthRejection = reason;
  clearActiveSessionData();
  resetAccess({ error: reason, user: null });
  if (auth) await signOut(auth).catch(() => undefined);
}

async function loadAvatar(photoUrl: string, uid: string) {
  const cached = readCachedAvatar(uid, photoUrl);
  if (cached) {
    patch({ customPhotoUrl: cached });
    return;
  }
  try {
    const storedPhotoUrl = await cacheUserAvatar(photoUrl);
    if (state.user?.uid === uid && storedPhotoUrl) {
      writeCachedAvatar(uid, photoUrl, storedPhotoUrl);
      patch({ customPhotoUrl: storedPhotoUrl });
    }
  } catch {
    // Avatar persistence is optional and must not block session bootstrap.
  }
}

async function refreshVerifiedSession(
  user: User,
  verificationId: number,
  tokenValidationPromise: Promise<ValidationResult>,
  syncProfile: boolean,
) {
  const current = () =>
    verificationId === verificationSerial && state.user?.uid === user.uid;
  try {
    const tokenValidation = await tokenValidationPromise;
    if (!current()) return;
    if (!tokenValidation.ok) return await rejectUser(tokenValidation.reason);
    patch({ startupPhase: syncProfile ? "profile" : "access" });
    if (syncProfile) {
      await ensureBackendProfile(user);
      if (!current()) return;
      patch({ startupPhase: "access" });
    }
    const applyAccess = (access: SessionAccess) => {
      patch({
        managedFacilityCategoryIds: access.managedFacilityCategoryIds,
        managedIssueCategoryIds: access.managedIssueCategoryIds,
        permissions: access.permissions,
        roles: access.roles,
        setupCompleted: access.setupCompleted,
        startupPhase: "content",
        userRole: access.role,
      });
    };
    try {
      const bootstrap = await fetchSessionBootstrap({
        force: true,
        // Who the visitor is arrives before the catalog does, and the shell is
        // drawn from it, so it is applied the moment it lands.
        onAccess: (access) => {
          if (current()) applyAccess(seedSessionAccess(access));
        },
        recordVisit: shouldRecordPlatformVisit(),
      });
      if (!current()) return;
      const access = seedSessionAccess(bootstrap.access);
      seedCategoryCatalog(bootstrap.catalog);
      applyContentVersionsSnapshot(bootstrap.versions);
      seedNotificationUnreadHint(bootstrap.notificationUnread.hasUnread);
      if (bootstrap.visitRecorded)
        writeLocalStorage(VISIT_RECORDED_AT_KEY, String(Date.now()));
      applyAccess(access);
    } catch (bootstrapError) {
      if (bootstrapError instanceof ApiRequestError && bootstrapError.code === "account-restricted") {
        throw bootstrapError;
      }
      sessionDebug("bootstrap fallback", bootstrapError);
      await ensureContentVersionsFresh().catch(() => undefined);
      if (!current()) return;
      const access = await fetchCurrentUserRole(true, { useBootstrap: false });
      if (!current()) return;
      applyAccess(access);
      await ensureCategoryCatalog().catch(() => undefined);
    }
  } catch (error) {
    if (!current()) return;
    sessionDebug("session verification failed", error);
    if (error instanceof ApiRequestError && error.code === "account-restricted") {
      await rejectUser(error.restrictionMessage || error.message);
      return;
    }
    patch({
      error: error instanceof ApiRequestError && error.code === "app-check-failed"
        ? "auth.appCheckFailed"
        : "auth.initializationFailed",
    });
  } finally {
    if (current()) {
      patch({ roleLoading: false, startupPhase: "ready" });
    }
  }
}

function acceptUser(
  user: User,
  tokenValidationPromise: Promise<ValidationResult>,
  syncProfile: boolean,
) {
  const verificationId = ++verificationSerial;
  setContentCacheScope(user.uid);
  clearContentReadMemoryCache();
  patch({
    appReady: true,
    authChecking: false,
    error: "",
    initialized: true,
    loading: false,
    managedFacilityCategoryIds: [],
    managedIssueCategoryIds: [],
    permissions: [],
    roleLoading: true,
    roles: [],
    setupCompleted: false,
    startupPhase: "account",
    user,
    userRole: "user",
  });
  if (user.photoURL) void loadAvatar(user.photoURL, user.uid);
  void refreshVerifiedSession(user, verificationId, tokenValidationPromise, syncProfile);
}

export function initializeSession(
  requestTurnstileToken?: (
    action: string,
    options?: { presentation?: "dialog" | "inline" },
  ) => Promise<string | null>,
) {
  if (booted || typeof window === "undefined") return;
  booted = true;
  if (!auth) {
    patch({
      appReady: true,
      authChecking: false,
      error: "auth.serviceUnavailable",
      initialized: true,
      loading: false,
    });
    return;
  }
  onAuthStateChanged(
    auth,
    async (user) => {
      const authEventError = user ? "" : pendingAuthRejection;
      pendingAuthRejection = "";
      patch({ authChecking: false, error: authEventError, loading: true, startupPhase: "session" });
      if (!user) {
        verificationSerial += 1;
        clearActiveSessionData();
        resetAccess({
          appReady: true,
          error: authEventError,
          initialized: true,
          loading: false,
          user: null,
        });
        return;
      }
      const validation = validateBasicUser(user);
      if (!validation.ok) {
        await rejectUser(validation.reason);
        patch({ appReady: true, initialized: true, loading: false });
        return;
      }
      const tokenValidationPromise = validateUserAgainstToken(user);
      void tokenValidationPromise.catch(() => undefined);
      const freshLogin = consumePreparedLoginEntrance();
      if (!freshLogin) {
        patch({ restoringSession: true, startupPhase: "security" });
        const restorationError = await verifyRestoredSession({
          requestTurnstileToken,
        });
        if (restorationError) {
          await rejectUser(restorationError);
          patch({ appReady: true, initialized: true, loading: false, restoringSession: false });
          return;
        }
        patch({ restoringSession: false, startupPhase: "account" });
      }
      acceptUser(user, tokenValidationPromise, freshLogin);
    },
    (error) => {
      sessionDebug("auth observer failed", error);
      patch({
        appReady: true,
        authChecking: false,
        error: "auth.failedToLoadLoginStatusPleaseTryAgainLater",
        initialized: true,
        loading: false,
      });
    },
  );
  const resync = () =>
    void ensureContentVersionsFresh({ notify: true }).catch(() => undefined);
  window.addEventListener("online", resync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resync();
  });
}

export function getSessionState() {
  return state;
}
