<template>
  <AppStartupScreen v-if="startupGateOpen" />
  <AppShell v-else>
    <RouterView v-slot="{ Component }">
      <Suspense>
        <component :is="Component" />
        <template #fallback>
          <div class="flex min-h-[40dvh] items-center justify-center" aria-label="正在載入頁面" aria-busy="true">
            <LoadingSpinner :size="8" />
          </div>
        </template>
      </Suspense>
    </RouterView>
    <ToastViewport />
    <PushPermissionPromptDialog
      :open="isPushPromptOpen"
      :busy="pushLoading"
      @dismiss="dismissPushPrompt"
      @enable="enablePushFromPrompt"
    />
    <AppInstallPromptDialog
      v-if="installPromptMode"
      :can-install-natively="canInstallPromptNatively"
      :open="isInstallPromptOpen"
      :mode="installPromptMode"
      :browser-name="installPromptBrowserName"
      :ios-browser-guide="installPromptIosBrowserGuide"
      :installing="isInstallPrompting"
      :reason="installPromptReason"
      @close="dismissInstallPrompt"
      @copy-url="copyInstallUrl"
      @install="promptInstall"
    />
  </AppShell>
  <AppUpdatePromptDialog
    :open="updateAvailable"
    :busy="reloading"
    @reload="reloadApp"
  />
  <Teleport to="body">
    <Transition name="dialog" appear>
      <div
        v-if="reloading"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/50 text-white backdrop-blur-sm"
        role="status"
        aria-live="assertive"
        aria-label="正在重新載入應用程式"
      >
        <div class="flex flex-col items-center gap-3">
          <LoadingSpinner :size="8" />
          <p class="text-sm font-semibold">正在重新載入</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import AppStartupScreen from '@/components/AppStartupScreen.vue';
import AppInstallPromptDialog from '@/components/AppInstallPromptDialog.vue';
import AppUpdatePromptDialog from '@/components/AppUpdatePromptDialog.vue';
import PushPermissionPromptDialog from '@/components/PushPermissionPromptDialog.vue';
import ToastViewport from '@/components/ToastViewport.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useAppInstallPrompt } from '@/composables/useAppInstallPrompt';
import { useAppStartupGate } from '@/composables/useAppStartupGate';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { usePushNotifications } from '@/composables/usePushNotifications';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { requestAppInstallPrompt } from '@/lib/pwa-install';
import { ref, watch } from 'vue';
import { DEFAULT_ISSUE_ROUTE_FILTER } from '@/constants/categories';

const APP_RELEASE_MARKER = '2026-06-27-1516';
const LAST_APP_VERSION_STORAGE_KEY = 'srp:last-app-version';
const LEGACY_PENDING_UPDATE_TOAST_STORAGE_KEY = 'srp:pending-update-toast';
const PENDING_UPDATE_VERSION_STORAGE_KEY = 'srp:pending-update-version';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.appRelease = APP_RELEASE_MARKER;
}

const { canAutoReloadCurrentVersion, reloadApp, reloading, updateAvailable } = useAppUpdate();
const { open: startupGateOpen } = useAppStartupGate();
const route = useRoute();
const router = useRouter();
const { appReady, user } = useSession();
const {
  enablePushNotifications,
  loading: pushLoading,
  permission: pushPermission,
  requiresPwaInstall: pushRequiresPwaInstall,
  refreshPushPreference,
  supported: pushSupported,
} = usePushNotifications();
const isPushPromptOpen = ref(false);
const PUSH_PROMPT_STORAGE_PREFIX = 'srp:push-permission-prompted:';

const {
  browserName: installPromptBrowserName,
  canInstallNatively: canInstallPromptNatively,
  copyInstallUrl,
  dismiss: dismissInstallPrompt,
  iosBrowserGuide: installPromptIosBrowserGuide,
  isPrompting: isInstallPrompting,
  mode: installPromptMode,
  open: isInstallPromptOpen,
  promptInstall,
  reason: installPromptReason,
} = useAppInstallPrompt();

function pushPromptStorageKey(uid: string) {
  return `${PUSH_PROMPT_STORAGE_PREFIX}${uid}`;
}

function hasSeenPushPrompt(uid: string) {
  return localStorage.getItem(pushPromptStorageKey(uid)) === '1';
}

function markPushPromptSeen(uid: string) {
  localStorage.setItem(pushPromptStorageKey(uid), '1');
}

function defaultAuthenticatedRoute() {
  return {
    name: 'issues',
    params: { filter: DEFAULT_ISSUE_ROUTE_FILTER },
  };
}

function normalizeRedirectPath(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const path = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/login')) {
    return '';
  }

  return path;
}

function dismissPushPrompt() {
  const uid = user.value?.uid;
  if (uid) markPushPromptSeen(uid);
  isPushPromptOpen.value = false;
}

async function enablePushFromPrompt() {
  const uid = user.value?.uid;
  if (uid) markPushPromptSeen(uid);
  await enablePushNotifications();
  isPushPromptOpen.value = false;
}

watch(
  [updateAvailable, startupGateOpen],
  ([hasUpdate, isStarting]) => {
    if (hasUpdate && isStarting && canAutoReloadCurrentVersion()) {
      void reloadApp({ automatic: true });
    }
  },
  { immediate: true },
);

watch(
  () => user.value?.uid ?? '',
  async (uid) => {
    isPushPromptOpen.value = false;
    if (!uid || hasSeenPushPrompt(uid)) return;
    await refreshPushPreference();
    if (pushRequiresPwaInstall.value && !hasSeenPushPrompt(uid)) {
      markPushPromptSeen(uid);
      requestAppInstallPrompt('notifications');
      return;
    }
    if (pushSupported.value && pushPermission.value === 'default' && !hasSeenPushPrompt(uid)) {
      isPushPromptOpen.value = true;
    }
  },
  { immediate: true },
);

watch(
  [appReady, () => user.value?.uid ?? '', () => route.fullPath],
  ([ready, uid]) => {
    if (!ready) return;

    if (route.meta.publicOnly && uid) {
      void router.replace(normalizeRedirectPath(route.query.redirect) || defaultAuthenticatedRoute());
      return;
    }

    if (route.meta.requiresAuth && !uid) {
      void router.replace({
        name: 'login',
        query: { redirect: route.fullPath },
      });
    }
  },
  { immediate: true },
);

const { showToast } = useToast();

watch(
  startupGateOpen,
  (open) => {
    if (!open) {
      const lastVersion = localStorage.getItem(LAST_APP_VERSION_STORAGE_KEY);
      const pendingUpdateVersion = localStorage.getItem(PENDING_UPDATE_VERSION_STORAGE_KEY);
      const isNewVersion = Boolean(lastVersion && lastVersion !== __APP_VERSION__);
      const completedPendingUpdate = Boolean(
        pendingUpdateVersion
        && pendingUpdateVersion === __APP_VERSION__
        && isNewVersion,
      );

      if (completedPendingUpdate || (isNewVersion && !pendingUpdateVersion)) {
        if (!installPromptMode.value) {
          showToast('版本已成功更新', 'success');
        }
      }
      localStorage.removeItem(LEGACY_PENDING_UPDATE_TOAST_STORAGE_KEY);
      if (completedPendingUpdate) {
        localStorage.removeItem(PENDING_UPDATE_VERSION_STORAGE_KEY);
      }
      localStorage.setItem(LAST_APP_VERSION_STORAGE_KEY, __APP_VERSION__);
    }
  },
  { immediate: true }
);
</script>
