<template>
  <AppStartupScreen v-if="startupGateOpen" />
  <AppShell v-else>
    <RouterView />
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
    @reload="reloadApp"
  />
</template>

<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import AppStartupScreen from '@/components/AppStartupScreen.vue';
import AppInstallPromptDialog from '@/components/AppInstallPromptDialog.vue';
import AppUpdatePromptDialog from '@/components/AppUpdatePromptDialog.vue';
import PushPermissionPromptDialog from '@/components/PushPermissionPromptDialog.vue';
import ToastViewport from '@/components/ToastViewport.vue';
import { useAppInstallPrompt } from '@/composables/useAppInstallPrompt';
import { useAppStartupGate } from '@/composables/useAppStartupGate';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { usePushNotifications } from '@/composables/usePushNotifications';
import { useSession } from '@/composables/useSession';
import { requestAppInstallPrompt } from '@/lib/pwa-install';
import { ref, watch } from 'vue';
import { DEFAULT_ISSUE_ROUTE_FILTER } from '@/constants/categories';

const APP_RELEASE_MARKER = '2026-06-27-1516';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.appRelease = APP_RELEASE_MARKER;
}

const { canAutoReloadCurrentVersion, reloadApp, updateAvailable } = useAppUpdate();
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
</script>
