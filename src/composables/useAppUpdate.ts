import { readonly, ref } from 'vue';
import { safeFetch, withRequestTimeout } from '@/lib/request';
import { resetAppConnection } from '@/lib/reconnect';

const updateAvailable = ref(false);
const checking = ref(false);
const reloading = ref(false);
const remoteVersion = ref('');
let lastCheckedAt = 0;

const APP_RELOAD_TIMEOUT_MS = 5_000;
const AUTO_RELOAD_STORAGE_KEY = 'srp:auto-update-reloaded-version';
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
  await checkAppVersion();
  void updateServiceWorker();
}

export function useAppUpdate() {
  function canAutoReloadCurrentVersion() {
    if (!remoteVersion.value) return false;
    return sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY) !== remoteVersion.value;
  }

  async function reloadApp(options: { automatic?: boolean } = {}) {
    if (reloading.value) {
      return;
    }

    if (options.automatic && !canAutoReloadCurrentVersion()) {
      return;
    }

    reloading.value = true;

    if (options.automatic && remoteVersion.value) {
      sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, remoteVersion.value);
    }

    if (remoteVersion.value) {
      localStorage.setItem(PENDING_UPDATE_VERSION_STORAGE_KEY, remoteVersion.value);
    }
    let reloadTimeout = 0;
    await Promise.race([
      (async () => {
        await updateServiceWorker();
        await resetAppConnection();
      })(),
      new Promise<void>((resolve) => {
        reloadTimeout = window.setTimeout(resolve, APP_RELOAD_TIMEOUT_MS);
      }),
    ]);
    window.clearTimeout(reloadTimeout);
    window.location.reload();
  }

  return {
    canAutoReloadCurrentVersion,
    checking: readonly(checking),
    reloadApp,
    reloading: readonly(reloading),
    remoteVersion: readonly(remoteVersion),
    updateAvailable: readonly(updateAvailable),
  };
}
