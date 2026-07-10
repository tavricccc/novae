import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth, allowedDomain } from '@/lib/firebase';
import type { SessionState } from '@/composables/sessionTypes';
import { withRequestTimeout } from '@/lib/request';
import { debugLog } from '@/composables/sessionDebug';

const LOGIN_ATTEMPT_KEY = 'srp-login-attempts';
const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 30;
const LOGIN_CLICK_COOLDOWN_MS = 2_000;
let lastLoginAttemptAt = 0;

function claimLoginAttempt() {
  const now = Date.now();
  if (now - lastLoginAttemptAt < LOGIN_CLICK_COOLDOWN_MS) return false;
  lastLoginAttemptAt = now;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOGIN_ATTEMPT_KEY) ?? '[]') as unknown;
    const attempts = Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === 'number' && value > now - LOGIN_ATTEMPT_WINDOW_MS)
      : [];
    if (attempts.length >= LOGIN_ATTEMPT_LIMIT) return false;
    localStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify([...attempts, now]));
  } catch {
    // Storage may be unavailable; the in-memory click cooldown still applies.
  }
  return true;
}

function shouldFallbackToRedirect(error: unknown) {
  return error instanceof FirebaseError && [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
  ].includes(error.code);
}

function googleProvider(selectAccount = false) {
  const provider = new GoogleAuthProvider();
  if (allowedDomain) {
    provider.setCustomParameters({
      hd: allowedDomain,
      ...(selectAccount ? { prompt: 'select_account' } : {}),
    });
  } else if (selectAccount) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
}

export async function loginWithGoogle(state: SessionState, options: { selectAccount?: boolean } = {}) {
  debugLog('login requested', {
    allowedDomain,
  });
  state.error = '';
  if (!claimLoginAttempt()) {
    state.error = '登入操作太頻繁，請稍候再試。';
    return;
  }
  state.loading = true;

  if (!auth) {
    state.error = '服務暫時無法使用，請稍後再試。';
    state.loading = false;
    return;
  }

  const firebaseAuth = auth;

  try {
    debugLog('starting popup login', {
      customParameters: allowedDomain ? { hd: allowedDomain } : {},
    });
    await signInWithPopup(firebaseAuth, googleProvider(Boolean(options.selectAccount)));
    debugLog('popup login resolved', firebaseAuth.currentUser
      ? {
          uid: firebaseAuth.currentUser.uid,
          email: firebaseAuth.currentUser.email ?? '',
        }
      : null);
  } catch (error) {
    if (shouldFallbackToRedirect(error)) {
      debugLog('popup unavailable, falling back to redirect', error);
      try {
        await signInWithRedirect(firebaseAuth, googleProvider(Boolean(options.selectAccount)));
      } catch (redirectError) {
        debugLog('redirect login failed', redirectError);
        state.error = getLoginErrorMessage(redirectError);
      }
      return;
    }

    debugLog('login failed before completion', error);
    state.error = getLoginErrorMessage(error);
  } finally {
    state.loading = false;
  }
}

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return '登入失敗，請稍後再試。';
  }

  if (
    error.code === 'auth/missing-recaptcha-token'
    || error.code === 'auth/invalid-recaptcha-token'
    || error.code === 'auth/invalid-recaptcha-action'
    || error.code === 'auth/recaptcha-not-enabled'
  ) {
    return '登入安全驗證失敗，請重新整理頁面後再試。';
  }

  if (error.code === 'auth/network-request-failed') {
    return '登入連線失敗，請確認網路狀態後再試。';
  }

  if (error.code === 'auth/popup-closed-by-user') {
    return '登入視窗已關閉，請再試一次。';
  }

  if (error.code === 'auth/popup-blocked') {
    return '登入視窗被瀏覽器封鎖，請允許彈出視窗後再試。';
  }

  if (error.code === 'auth/operation-not-supported-in-this-environment') {
    return '目前瀏覽器無法開啟登入視窗，請改用系統瀏覽器開啟。';
  }

  if (error.code === 'auth/unauthorized-domain') {
    return '目前網址尚未允許使用 Google 登入，請聯絡管理員確認設定。';
  }

  return '登入失敗，請稍後再試。';
}

export async function logoutFromFirebase(state: SessionState) {
  if (!auth) {
    state.loading = false;
    return;
  }

  const firebaseAuth = auth;

  state.loading = true;
  try {
    await withRequestTimeout(() => signOut(firebaseAuth), { label: '登出' });
  } finally {
    state.loading = false;
  }
}
