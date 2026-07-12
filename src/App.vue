<template>
  <AppStartupScreen
    v-if="startupGateOpen"
    :aria-label="startupAriaLabel"
    :message="startupMessage"
    :stalled="startupGateStalled"
    @retry="reloadApp({ reason: 'restart' })"
  />
  <AppShell v-else>
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Transition name="page-content" mode="out-in">
        <div :key="String(viewRoute.name ?? viewRoute.path)" class="min-h-0 flex-1">
          <Suspense>
            <component :is="Component" />
            <template #fallback>
              <div class="flex min-h-[40dvh] items-center justify-center" aria-label="正在載入頁面" aria-busy="true">
                <LoadingSpinner :size="8" />
              </div>
            </template>
          </Suspense>
        </div>
      </Transition>
    </RouterView>
    <ToastViewport />
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
import ToastViewport from '@/components/ToastViewport.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useAppInstallPrompt } from '@/composables/useAppInstallPrompt';
import { useAppStartupGate } from '@/composables/useAppStartupGate';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { usePushPermissionPrompt } from '@/composables/usePushPermissionPrompt';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { computed, watch } from 'vue';
import { DEFAULT_ISSUE_ROUTE_FILTER } from '@/constants/categories';

const APP_RELEASE_MARKER = '2026-06-27-1516';
const LAST_APP_VERSION_STORAGE_KEY = 'novae:last-app-version';
const LEGACY_PENDING_UPDATE_TOAST_STORAGE_KEY = 'novae:pending-update-toast';
const PENDING_UPDATE_VERSION_STORAGE_KEY = 'novae:pending-update-version';

if (typeof document !== 'undefined') {
  document.documentElement.dataset.appRelease = APP_RELEASE_MARKER;
}

const { canAutoReloadCurrentVersion, reloadApp, reloading, updateAvailable } = useAppUpdate();
const { open: startupGateOpen, stalled: startupGateStalled } = useAppStartupGate();
const route = useRoute();
const router = useRouter();
const { appReady, user } = useSession();

const reloadingText = computed(() => {
  return reloading.value === 'restart' ? '正在重啟' : '正在更新';
});

const reloadingAriaLabel = computed(() => {
  return reloading.value === 'restart' ? '正在重啟' : '正在更新';
});

const startupAriaLabel = computed(() => {
  if (reloading.value === 'restart') return '正在重啟 App';
  if (reloading.value === 'update') return '正在更新 App';
  return '正在啟動 App';
});

const startupMessage = computed(() => {
  if (reloading.value === 'restart') return '正在重啟';
  if (reloading.value === 'update') return '正在更新';
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
