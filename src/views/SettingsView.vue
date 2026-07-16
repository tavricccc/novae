<template>
  <section class="page-bottom-safe min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden">
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
          <div class="flex items-center justify-between border-b border-ink-100 py-3 dark:border-ink-800/60">
            <div class="space-y-2 flex-1">
              <span class="block h-4 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
              <span class="block h-3 w-2/3 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            </div>
            <span class="h-6 w-11 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          </div>
          <div class="flex items-center justify-between border-b border-ink-100 py-3 dark:border-ink-800/60">
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
      :uid="user.uid"
      :is-admin="isAdmin"
      :can-manage-roles="can('role.manage')"
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
      @set-preference="handleSetPersonalPushPreference"
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
import { useActionFeedback } from '@/composables/useActionFeedback';
import type { PersonalPushPreferenceKey } from '@/services/notifications';

const router = useRouter();
const { user, customPhotoUrl, loading, login, logout, can } = useSession();
const isAdmin = computed(() => can('dashboard.view'));
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
const { start } = useActionFeedback();

const displayPhotoUrl = computed(() => customPhotoUrl.value || user.value?.photoURL || null);

const personalNotificationOptions: Array<{
  description: string;
  key: PersonalPushPreferenceKey;
  label: string;
}> = [
  {
    key: 'comments',
    label: '留言通知',
    description: '提案或公告收到新留言時接收通知。',
  },
  {
    key: 'issueUpdates',
    label: '提案更新',
    description: '你提出或附議的提案有重要進度時接收通知。',
  },
  {
    key: 'facilityUpdates',
    label: '設備更新',
    description: '你建立或標記「我也遇到」的設備有進度時接收通知。',
  },
];

const pushStatusDescription = computed(() => {
  if (!pushInitialized.value && pushLoading.value) return '正在確認這台裝置的通知狀態。';
  if (pushRequiresPwaInstall.value) return '加入主畫面後，即可開啟推播通知。';
  if (!pushSupported.value) return '目前的瀏覽器或裝置不支援推播通知。';
  if (pushPermission.value === 'denied') return '通知權限已關閉，請前往系統設定重新允許。';
  if (pushEnabled.value) return '重要動態會依照下方偏好送達這台裝置。';
  return '開啟後，重要動態會即時送達這台裝置。';
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
  const feedbackHandle = start('正在更新推播設定');
  const succeeded = pushEnabled.value
    ? await disablePushNotifications()
    : await enablePushNotifications();
  if (succeeded) {
    feedbackHandle.succeed('推播設定已更新');
  } else {
    feedbackHandle.fail(pushError.value || '推播設定更新失敗，請稍後再試');
  }
}

async function handleSetPersonalPushPreference(key: PersonalPushPreferenceKey, value: boolean) {
  const feedbackHandle = start('正在儲存通知設定');
  const succeeded = await setPersonalPushPreference(key, value);
  if (succeeded) {
    feedbackHandle.succeed('通知設定已儲存');
  } else {
    feedbackHandle.fail(pushError.value || '通知設定儲存失敗，請稍後再試');
  }
}

async function handleRestartApp() {
  await reloadApp();
}
</script>
