<template>
  <AppStartupScreen
    v-if="startupGateOpen"
    :aria-label="startupAriaLabel"
    :message="startupMessage"
    :stalled="startupGateStalled"
    @retry="reloadApp({ reason: 'restart' })"
  />
  <AppShell v-else>
    <div class="route-stage relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition name="route-swap" mode="out-in">
          <div
            :key="String(viewRoute.name ?? viewRoute.path)"
            class="route-content-frame flex h-full min-h-0 min-w-0 w-full max-w-full flex-1 flex-col"
          >
            <Suspense>
              <component :is="Component" />
              <template #fallback>
                <div class="flex min-h-[40dvh] items-center justify-center" :aria-label="t('common.switchingPages')" aria-busy="true">
                  <LoadingSpinner :size="8" />
                </div>
              </template>
            </Suspense>
          </div>
        </Transition>
      </RouterView>
    </div>
    <ActionFeedbackBar />
    <PushPermissionPromptDialog
      :open="isPushPromptOpen"
      :busy="pushPromptBusy"
      :mode="pushPromptMode"
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
    :open="shouldShowUpdateDialog"
    :busy="Boolean(reloading)"
    @reload="reloadApp({ reason: 'update' })"
  />
  <Teleport to="body">
    <Transition name="dialog" appear>
      <div
        v-if="reloading"
        class="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/65 text-white backdrop-blur-md"
        role="status"
        aria-live="assertive"
        :aria-label="reloadingAriaLabel"
      >
        <div class="flex flex-col items-center gap-3">
          <LoadingSpinner :size="8" />
          <p class="text-sm font-semibold">{{ reloadingText }}</p>
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
import ActionFeedbackBar from '@/components/ActionFeedbackBar.vue';
import LoadingSpinner from '@/components/ui/atoms/LoadingSpinner.vue';
import { useAppInstallPrompt } from '@/composables/useAppInstallPrompt';
import { useAppStartupGate } from '@/composables/useAppStartupGate';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { usePushPermissionPrompt } from '@/composables/usePushPermissionPrompt';
import { useSession } from '@/composables/useSession';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { computed, onBeforeUnmount, watch } from 'vue';
import { DEFAULT_ISSUE_ROUTE_FILTER } from '@/constants/categories';
import { preloadPrimaryRouteComponents } from '@/router/route-components';
import { useI18n } from '@/i18n';

const APP_RELEASE_MARKER = '2026-06-27-1516';
const LAST_APP_VERSION_STORAGE_KEY = 'novae:last-app-version';
const PENDING_UPDATE_VERSION_STORAGE_KEY = 'novae:pending-update-version';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.appRelease = APP_RELEASE_MARKER;
}

const { canAutoReloadCurrentVersion, reloadApp, reloading, updateAvailable } = useAppUpdate();
const { open: startupGateOpen, stalled: startupGateStalled } = useAppStartupGate();
const route = useRoute();
const router = useRouter();
const { appReady, isAdmin, user } = useSession();
const { t } = useI18n();
let routePreloadIdleId: number | null = null;
let routePreloadTimer = 0;
const idleWindow = window as unknown as {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
};

function cancelRoutePreload() {
  if (routePreloadIdleId !== null) {
    idleWindow.cancelIdleCallback?.(routePreloadIdleId);
  }
  window.clearTimeout(routePreloadTimer);
  routePreloadIdleId = null;
  routePreloadTimer = 0;
}

function scheduleRoutePreload() {
  cancelRoutePreload();
  if (startupGateOpen.value || !user.value?.uid) return;

  const preload = () => {
    routePreloadIdleId = null;
    routePreloadTimer = 0;
    void preloadPrimaryRouteComponents(isAdmin.value);
  };
  if (idleWindow.requestIdleCallback) {
    routePreloadIdleId = idleWindow.requestIdleCallback(preload, { timeout: 1_200 });
    return;
  }
  routePreloadTimer = window.setTimeout(preload, 250);
}

const reloadingText = computed(() => {
  return t(reloading.value === 'restart' ? 'common.restarting' : 'common.updating');
});

const reloadingAriaLabel = computed(() => {
  return t(reloading.value === 'restart' ? 'common.restarting' : 'common.updating');
});

const startupAriaLabel = computed(() => {
  if (reloading.value === 'restart') return t('common.restartingApp');
  if (reloading.value === 'update') return t('common.updatingApp');
  return t('common.startingApp');
});

const startupMessage = computed(() => {
  if (reloading.value === 'restart') return t('common.restarting');
  if (reloading.value === 'update') return t('common.updating');
  return '';
});

const shouldShowUpdateDialog = computed(() => {
  if (!updateAvailable.value) return false;
  if (startupGateOpen.value) return false;
  if (reloading.value) return false;
  if (canAutoReloadCurrentVersion()) return false;
  return true;
});

const {
  busy: pushPromptBusy,
  dismiss: dismissPushPrompt,
  enable: enablePushFromPrompt,
  mode: pushPromptMode,
  open: isPushPromptOpen,
} = usePushPermissionPrompt();

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

watch(
  updateAvailable,
  (hasUpdate) => {
    if (hasUpdate && canAutoReloadCurrentVersion()) {
      void reloadApp({ automatic: true, reason: 'update' });
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

const { show } = useActionFeedback();

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
          show(t('common.theVersionHasBeenUpdated'), 'success');
        }
      }
      if (completedPendingUpdate) {
        localStorage.removeItem(PENDING_UPDATE_VERSION_STORAGE_KEY);
      }
      localStorage.setItem(LAST_APP_VERSION_STORAGE_KEY, __APP_VERSION__);
    }
  },
  { immediate: true }
);

watch(
  [startupGateOpen, () => user.value?.uid ?? '', isAdmin],
  scheduleRoutePreload,
  { immediate: true },
);

onBeforeUnmount(cancelRoutePreload);
</script>
