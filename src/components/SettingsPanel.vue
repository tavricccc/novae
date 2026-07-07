<template>
  <div ref="rootRef" class="relative">
    <div
      v-if="loading && !user"
      :class="loadingTriggerClass"
      role="status"
      aria-label="正在恢復登入狀態"
    >
      <LoadingSpinner :size="4" />
    </div>

    <template v-else-if="user">
      <button
        ref="triggerRef"
        type="button"
        :class="triggerClasses"
        aria-haspopup="dialog"
        :aria-expanded="isOpen"
        @click="openPanel"
      >
        <UserAvatar :photo-url="displayPhotoUrl" :name="user.displayName || 'U'" :size="avatarSize" alt-text="使用者頭像" :class="avatarClasses" />
        <span v-if="label" class="app-bottom-nav__label">{{ label }}</span>
      </button>

      <transition name="popover">
        <SettingsPanelContent
          v-if="isOpen"
          ref="menuRef"
          role="dialog"
          aria-label="設定"
          class="absolute right-0 top-full z-50 mt-2 max-h-[min(82dvh,42rem)] w-[min(calc(100vw-2rem),24rem)] origin-top-right rounded-[1.25rem] border border-ink-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900"
          :content-class="'max-h-[min(82dvh,42rem)]'"
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
          @logout="handleLogout"
          @restart-app="handleRestartApp"
          @set-preference="setPersonalPushPreference"
          @switch-account="switchAccount"
          @toggle-push="handlePushAction"
        />
      </transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import SettingsPanelContent from '@/components/SettingsPanelContent.vue';
import { usePushNotifications } from '@/composables/usePushNotifications';
import { useAppUpdate } from '@/composables/useAppUpdate';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import type { PersonalPushPreferenceKey } from '@/services/notifications';

const props = withDefaults(defineProps<{
  avatarSize?: 'sm' | 'md' | 'lg';
  label?: string;
  loadingTriggerClass?: string;
  triggerActiveClass?: string;
  triggerClass?: string;
}>(), {
  avatarSize: 'md',
  label: '',
  loadingTriggerClass: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400',
  triggerActiveClass: 'button-toolbar--active',
  triggerClass: 'button-icon relative overflow-hidden p-0',
});

const { user, customPhotoUrl, loading, error, login, logout, isAdmin } = useSession();
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
const { showToast } = useToast();
const displayPhotoUrl = computed(() => customPhotoUrl.value || user.value?.photoURL || null);
const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof SettingsPanelContent> | null>(null);

const triggerClasses = computed(() => [
  props.triggerClass,
  { [props.triggerActiveClass]: isOpen.value && Boolean(props.triggerActiveClass) },
]);
const avatarClasses = computed(() =>
  props.label
    ? 'h-8 w-8 overflow-hidden rounded-full'
    : 'h-full w-full'
);

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

async function openPanel() {
  isOpen.value = !isOpen.value;
  if (!isOpen.value) return;
  await nextTick();
  void refreshPushPreference();
}

function closePanel() {
  isOpen.value = false;
}

const handleLogout = async () => {
  closePanel();
  if (pushEnabled.value) {
    try {
      await disablePushNotifications();
    } catch {
      void 0;
    }
  }
  await logout();
};

async function switchAccount() {
  closePanel();
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
  closePanel();
  await reloadApp();
}

const handleClickOutside = (event: MouseEvent) => {
  if (
    isOpen.value
    && rootRef.value
    && !rootRef.value.contains(event.target as Node)
  ) {
    closePanel();
  }
};

onMounted(() => {
  localStorage.removeItem('srp:remembered-accounts');
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

watch(error, (message) => {
  if (message) {
    showToast(message, 'error');
  }
});
</script>
