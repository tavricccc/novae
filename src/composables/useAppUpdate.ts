import { readonly, ref } from 'vue';
import { safeFetch, withRequestTimeout } from '@/lib/request';
import { resetAppConnection } from '@/lib/reconnect';

const updateAvailable = ref(false);
const checking = ref(false);
const reloading = ref<false | 'update' | 'restart'>(false);
const remoteVersion = ref('');
const initialCheckDone = ref(false);
let lastCheckedAt = 0;
let listenersRegistered = false;

const APP_RELOAD_TIMEOUT_MS = 5_000;
const AUTO_RELOAD_STORAGE_KEY = 'srp:auto-update-reloaded-version';
const AUTO_RELOAD_COUNT_KEY = 'srp:auto-update-reloaded-count';
const PENDING_UPDATE_VERSION_STORAGE_KEY = 'srp:pending-update-version';

interface VersionResponse {
  version?: string;
}

async function checkAppVersion() {
  if (checking.value || Date.now() - lastCheckedAt < 60_000) {
    return;
  }

  checking.value = true;
  lastCheckedAt = Date.now();

  try {
    const response = await safeFetch('/version.json', { cache: 'no-store' }, {
      label: '版本檢查',
      timeoutMs: APP_RELOAD_TIMEOUT_MS,
    });

    const data = await response.json() as VersionResponse;
    const nextRemoteVersion = typeof data.version === 'string' ? data.version : '';
    remoteVersion.value = nextRemoteVersion;
    updateAvailable.value = Boolean(
      nextRemoteVersion
      && nextRemoteVersion !== __APP_VERSION__,
    );
  } catch {
    return;
  } finally {
    checking.value = false;
  }
}

function shouldCheckAfterResume() {
  return Date.now() - lastCheckedAt >= 5 * 60_000;
}

async function updateServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await withRequestTimeout(
      () => navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      }),
      { label: 'Service Worker 註冊', timeoutMs: APP_RELOAD_TIMEOUT_MS },
    );
    await withRequestTimeout(() => navigator.serviceWorker.ready, {
      label: 'Service Worker 啟動',
      timeoutMs: APP_RELOAD_TIMEOUT_MS,
    });
    await withRequestTimeout(() => registration.update(), {
      label: 'Service Worker 更新',
      timeoutMs: APP_RELOAD_TIMEOUT_MS,
    });
  } catch {
    return;
  }
}

export async function initializeAppUpdate() {
  if (!listenersRegistered && typeof window !== 'undefined') {
    listenersRegistered = true;
    window.addEventListener('online', () => void checkAppVersion());
    window.addEventListener('pageshow', () => {
      if (shouldCheckAfterResume()) void checkAppVersion();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && shouldCheckAfterResume()) {
        void checkAppVersion();
      }
    });
  }

  try {
    await checkAppVersion();
  } finally {
    initialCheckDone.value = true;
  }
  void updateServiceWorker();
}

export function useAppUpdate() {
  function canAutoReloadCurrentVersion() {
    if (!remoteVersion.value) return false;
    const savedVersion = sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY);
    if (savedVersion !== remoteVersion.value) {
      return true;
    }
    const savedCountStr = sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || '0';
    const savedCount = parseInt(savedCountStr, 10);
    return savedCount < 3;
  }

  async function reloadApp(options: { automatic?: boolean; reason?: 'update' | 'restart' } = {}) {
    if (reloading.value) {
      return;
    }

    if (options.automatic && !canAutoReloadCurrentVersion()) {
      return;
    }

    reloading.value = options.reason || 'update';

    if (options.automatic && remoteVersion.value) {
      const savedVersion = sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY);
      if (savedVersion === remoteVersion.value) {
        const savedCountStr = sessionStorage.getItem(AUTO_RELOAD_COUNT_KEY) || '0';
        const savedCount = parseInt(savedCountStr, 10);
        sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, (savedCount + 1).toString());
      } else {
        sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, remoteVersion.value);
        sessionStorage.setItem(AUTO_RELOAD_COUNT_KEY, '1');
      }
    }

    if (remoteVersion.value) {
      localStorage.setItem(PENDING_UPDATE_VERSION_STORAGE_KEY, remoteVersion.value);
    }
    let reloadTimeout = 0;
    await Promise.race([
      (async () => {
        // 不再 await updateServiceWorker()，這在安卓 WebView 下很容易因 ready 屬性 pending 而卡死
        // 重載網頁後 main.ts 啟動時本來就會背景進行 SW 註冊更新
        await resetAppConnection();
      })(),
      new Promise<void>((resolve) => {
        // 設定 3 秒作為本機 reset 連線的超時安全保險絲，提供充足的弱網環境與 CPU 繁忙容錯空間
        reloadTimeout = window.setTimeout(resolve, 3000);
      }),
    ]);
    window.clearTimeout(reloadTimeout);

    // 使用相容性極佳的 replace() 重載網頁，防止 location.reload() 被 Android WebView / LINE 等環境掛起或吞掉
    try {
      window.location.replace(window.location.href);
    } catch {
      window.location.reload();
    }
  }

  return {
    canAutoReloadCurrentVersion,
    checking: readonly(checking),
    initialCheckDone: readonly(initialCheckDone),
    reloadApp,
    reloading: readonly(reloading),
    remoteVersion: readonly(remoteVersion),
    updateAvailable: readonly(updateAvailable),
  };
}
