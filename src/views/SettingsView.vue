<template>
  <section class="page-bottom-safe min-h-0 flex-1">
    <div v-if="loading" class="space-y-6 py-4" :class="{ 'px-1': true }">
      <!-- Account Skeleton -->
      <div class="flex items-center gap-3 pb-4 border-b border-ink-100 dark:border-ink-800/60">
        <span class="h-10 w-10 shrink-0 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        <div class="min-w-0 flex-1 space-y-2">
          <span class="block h-4 w-32 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          <span class="block h-3 w-48 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        </div>
        <span class="h-10 w-16 rounded-xl bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
      </div>

      <!-- Push Notifications Skeleton -->
      <div class="pb-4 border-b border-ink-100 dark:border-ink-800/60 space-y-2">
        <span class="block h-4 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        <span class="block h-3 w-3/4 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
      </div>

      <!-- Notification Types Skeleton -->
      <div class="space-y-3 pb-4 border-b border-ink-100 dark:border-ink-800/60">
        <span class="block h-4 w-20 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        <div class="space-y-2">
          <div class="flex items-center justify-between p-3 border border-ink-100 dark:border-ink-800 rounded-xl">
            <div class="space-y-2 flex-1">
              <span class="block h-4 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
              <span class="block h-3 w-2/3 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            </div>
            <span class="h-6 w-11 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          </div>
          <div class="flex items-center justify-between p-3 border border-ink-100 dark:border-ink-800 rounded-xl">
            <div class="space-y-2 flex-1">
              <span class="block h-4 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
              <span class="block h-3 w-2/3 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            </div>
            <span class="h-6 w-11 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          </div>
        </div>
      </div>
    </div>
    <SettingsPanelContent
      v-else-if="user"
      :display-name="user.displayName || '校內使用者'"
      :display-photo-url="displayPhotoUrl"
      :email="user.email || ''"
      :is-admin="isAdmin"
      :personal-notification-options="personalNotificationOptions"
      :personal-preferences="personalPreferences"
      :push-action-label="pushActionLabel"
      :push-enabled="pushEnabled"
      :push-error="pushError"
      :push-loading="pushLoading"
      :push-status-description="pushStatusDescription"
      :show-close="false"
      :flat="true"
      @logout="handleLogout"
      @restart-app="handleRestartApp"
      @set-preference="setPersonalPushPreference"
      @switch-account="switchAccount"
      @toggle-push="handlePushAction"
    />
    <div v-else class="flex flex-col items-center justify-center p-12 text-center">
      <p class="text-sm text-ink-500 dark:text-ink-400 mb-4">請先登入後再進行設定</p>
      <GoogleLoginButton :loading="loading" @login="login" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import GoogleLoginButton from '@/components/ui/GoogleLoginButton.vue';
import SettingsPanelContent from '@/components/SettingsPanelContent.vue';
import { usePushNotifications } from '@/composables/usePushNotifications';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { useSession } from '@/composables/useSession';
import type { PersonalPushPreferenceKey } from '@/services/notifications';

const router = useRouter();
const { user, customPhotoUrl, loading, login, logout, isAdmin } = useSession();
const { reloadApp } = useAppUpdate();
const {
  enabled: pushEnabled,
  error: pushError,
  initialized: pushInitialized,
  loading: pushLoading,
  permission: pushPermission,
  personalPreferences,
  requiresPwaInstall: pushRequiresPwaInstall,
  supported: pushSupported,
  disablePushNotifications,
  enablePushNotifications,
  refreshPushPreference,
  setPersonalPushPreference,
} = usePushNotifications();

const displayPhotoUrl = computed(() => customPhotoUrl.value || user.value?.photoURL || null);

const personalNotificationOptions: Array<{
  description: string;
  key: PersonalPushPreferenceKey;
  label: string;
}> = [
  {
    key: 'comments',
    label: '留言通知',
    description: '你的提案或公告收到留言時，在站內與推播通知提醒。',
  },
  {
    key: 'issueUpdates',
    label: '提案更新',
    description: '你參與的提案狀態變更、達標或刪除時，在站內與推播通知提醒。',
  },
];

const pushStatusDescription = computed(() => {
  if (!pushInitialized.value && pushLoading.value) return '正在讀取此裝置的推播狀態。';
  if (pushRequiresPwaInstall.value) return '手機與平板需先將平台加入主畫面，再從主畫面開啟通知功能。';
  if (!pushSupported.value) return '此瀏覽器或裝置無法接收推播通知。';
  if (pushPermission.value === 'denied') return '請到瀏覽器或系統設定允許通知後，再回來開啟。';
  if (pushEnabled.value) return '這個開關只控制目前這台裝置是否收到推播通知。';
  return '開啟後，這台裝置可以在背景收到推播通知。';
});

const pushActionLabel = computed(() => {
  if (pushRequiresPwaInstall.value) return '安裝到主畫面';
  if (!pushSupported.value || pushPermission.value === 'denied') return '';
  return pushEnabled.value ? '關閉推播通知' : '開啟推播通知';
});

onMounted(() => {
  void refreshPushPreference();
});

const handleLogout = async () => {
  if (pushEnabled.value) {
    try {
      await disablePushNotifications();
    } catch {
      void 0;
    }
  }
  await logout();
  router.push({ name: 'login' });
};

async function switchAccount() {
  if (pushEnabled.value) {
    try {
      await disablePushNotifications();
    } catch {
      void 0;
    }
  }
  await login({ selectAccount: true });
}

async function handlePushAction() {
  if (!pushActionLabel.value) return;
  if (pushEnabled.value) {
    await disablePushNotifications();
    return;
  }
  await enablePushNotifications();
}

async function handleRestartApp() {
  await reloadApp();
}
</script>
