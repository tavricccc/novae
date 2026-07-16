<template>
  <div
    class="flex min-h-0 min-w-0 w-full max-w-full flex-col"
    :class="[contentClass, flat ? 'settings-panel--flat overflow-visible' : 'overflow-hidden']"
  >
    <div
      v-if="!flat"
      class="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-700"
    >
      <div>
        <p class="text-base font-semibold tracking-[0.015em] text-ink-950 dark:text-ink-50">我的</p>
        <p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">帳號、通知與應用設定</p>
      </div>
      <button
        v-if="showClose"
        type="button"
        class="button-toolbar -mr-1 h-9 w-9 shrink-0 rounded-full p-0"
        aria-label="關閉設定"
        data-autofocus
        @click="emit('close')"
      >
        <AppIcon name="close" :size="4" />
      </button>
    </div>

    <div class="settings-scroll min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto" :class="{ 'settings-scroll--flat': flat }">
      <section aria-label="目前帳號" class="settings-group py-4">
        <p v-if="SCHOOL_NAME" class="mb-3 text-xs font-semibold text-ink-500 dark:text-ink-400">
          {{ SCHOOL_NAME }}
        </p>
        <div class="flex min-w-0 max-w-full items-center gap-3">
          <UserAvatar :photo-url="displayPhotoUrl" :name="displayName || 'U'" size="md" alt-text="使用者頭像" class="h-10 w-10 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink-950 dark:text-ink-50">
              {{ displayName || '校內使用者' }}
            </p>
            <p class="truncate text-xs leading-5 text-ink-500 dark:text-ink-400">
              {{ email }}
            </p>
            <div class="settings-account__uid-row flex min-w-0 items-center gap-1">
              <p class="truncate text-[11px] leading-5 text-ink-400 dark:text-ink-500">UID：{{ uid }}</p>
              <button
                type="button"
                class="settings-account__uid-copy button-toolbar shrink-0 rounded-full p-0"
                title="複製 UID"
                aria-label="複製 UID"
                @click="copyUid"
              >
                <AppIcon name="copy" :size="3" :stroke-width="2" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="button-secondary h-8 min-h-8 shrink-0 gap-1.5 px-2.5 py-1 text-xs font-semibold"
            @click="emit('switchAccount')"
          >
            <AppIcon name="switch-horizontal" :size="3" :stroke-width="2" />
            切換帳號
          </button>
        </div>
      </section>

      <section class="settings-group" aria-label="推播通知">
        <button
          type="button"
          class="settings-row"
          :class="(pushLoading || !pushActionLabel) ? 'opacity-60 cursor-not-allowed' : ''"
          :disabled="pushLoading || !pushActionLabel"
          @click="emit('togglePush')"
        >
          <span class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-ink-950 dark:text-ink-50">推播通知</p>
            <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">{{ pushStatusDescription }}</p>
            <p v-if="pushError" class="mt-1 text-xs leading-5 text-error">{{ pushError }}</p>
          </span>
          <span
            v-if="pushActionLabel"
            class="setting-switch"
            :class="{ 'setting-switch--on': pushEnabled }"
            role="switch"
            :aria-checked="pushEnabled"
            aria-label="推播通知"
          >
            <span class="setting-switch__thumb"></span>
          </span>
        </button>
      </section>

      <section aria-label="通知類型">
        <p class="settings-group-title">通知類型</p>
        <div class="settings-group">
          <button
            v-for="option in personalNotificationOptions"
            :key="option.key"
            type="button"
            class="settings-row"
            :disabled="pushLoading"
            @click="emit('setPreference', option.key, !personalPreferences[option.key])"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ option.label }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-ink-500 dark:text-ink-400">{{ option.description }}</span>
            </span>
            <span
              class="setting-switch"
              :class="{ 'setting-switch--on': personalPreferences[option.key] }"
              role="switch"
              :aria-checked="personalPreferences[option.key]"
              :aria-label="option.label"
            >
              <span class="setting-switch__thumb"></span>
            </span>
          </button>
        </div>
      </section>

      <section aria-label="常用功能">
        <p class="settings-group-title">功能</p>
        <div class="settings-group">
          <RouterLink
            to="/issues/my-proposals"
            class="settings-row gap-3"
            @click="emit('close')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300">
                <AppIcon name="user" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">我的提案</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">你提出的提案與最新進度</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </RouterLink>
          <RouterLink
            v-if="isAdmin"
            to="/dashboard"
            class="settings-row gap-3"
            @click="emit('close')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300">
                <AppIcon name="chart" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">統計</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">平台使用與維運概況</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </RouterLink>
          <RouterLink v-if="canManageRoles" to="/admin/access" class="settings-row gap-3" @click="emit('close')">
            <span class="flex min-w-0 items-center gap-3"><span class="flex h-9 w-9 items-center justify-center text-ink-500"><AppIcon name="shield-check" :size="4" /></span><span><span class="block text-sm font-semibold">角色管理</span><span class="mt-0.5 block text-xs text-ink-500">成員角色與權限</span></span></span><AppIcon name="chevron-right" :size="4" class="text-ink-400" />
          </RouterLink>
          <button
            type="button"
            class="settings-row gap-3"
            @click="emit('restartApp')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300">
                <AppIcon name="restart" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">重啟 App</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">重新載入並取得最新版本</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </button>
        </div>
      </section>

      <section aria-label="更多資源">
        <p class="settings-group-title">更多</p>
        <div class="settings-group">
          <a
            :href="PROJECT_CHANGELOG_URL"
            target="_blank"
            rel="noreferrer"
            class="settings-row gap-3"
            @click="emit('close')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300">
                <AppIcon name="changelog" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">更新紀錄</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">產品更新與改善紀錄</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </a>
          <a :href="PROJECT_WEBSITE_URL" target="_blank" rel="noreferrer" class="settings-row gap-3" @click="emit('close')">
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300"><AppIcon name="link" :size="4" :stroke-width="2" /></span>
              <span><span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">Novae 官網</span><span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">產品特色與導入資訊</span></span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </a>
          <a :href="PROJECT_DOCS_URL" target="_blank" rel="noreferrer" class="settings-row gap-3" @click="emit('close')">
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300"><AppIcon name="changelog" :size="4" :stroke-width="2" /></span>
              <span><span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">使用文件</span><span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">功能設定與操作指南</span></span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </a>
          <a :href="PROJECT_GITHUB_URL" target="_blank" rel="noreferrer" class="settings-row gap-3" @click="emit('close')">
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center text-ink-500 dark:text-ink-300"><AppIcon name="code" :size="4" :stroke-width="2" /></span>
              <span><span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">GitHub 專案</span><span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">原始碼與開發進度</span></span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </a>
        </div>
      </section>

      <button
        type="button"
        class="button-danger w-full"
        @click="logoutDialogOpen = true"
      >
        登出目前帳號
      </button>
    </div>
  </div>

  <ConfirmDialog
    :open="logoutDialogOpen"
    title="確定要登出嗎？"
    message="登出後，需重新驗證身分才能使用平台。"
    confirm-label="確認登出"
    @cancel="logoutDialogOpen = false"
    @confirm="confirmLogout"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import {
  PROJECT_CHANGELOG_URL,
  PROJECT_DOCS_URL,
  PROJECT_GITHUB_URL,
  PROJECT_WEBSITE_URL,
  SCHOOL_NAME,
} from '@/constants/app';
import type { PersonalPushPreferenceKey, PersonalPushPreferences } from '@/services/notifications';
import { copyText } from '@/composables/useShareUrl';
import { useActionFeedback } from '@/composables/useActionFeedback';

const props = withDefaults(defineProps<{
  contentClass?: string;
  displayName: string;
  displayPhotoUrl: string | null;
  email: string;
  uid: string;
  isAdmin: boolean;
  canManageRoles: boolean;
  personalNotificationOptions: Array<{
    description: string;
    key: PersonalPushPreferenceKey;
    label: string;
  }>;
  personalPreferences: PersonalPushPreferences;
  pushActionLabel: string;
  pushEnabled: boolean;
  pushError: string;
  pushLoading: boolean;
  pushStatusDescription: string;
  showClose?: boolean;
  flat?: boolean;
}>(), {
  contentClass: '',
  showClose: false,
  flat: false,
});

const emit = defineEmits<{
  close: [];
  logout: [];
  restartApp: [];
  setPreference: [key: PersonalPushPreferenceKey, value: boolean];
  switchAccount: [];
  togglePush: [];
}>();

const logoutDialogOpen = ref(false);
const { show } = useActionFeedback();

async function copyUid() {
  try {
    await copyText(props.uid);
    show('UID 已複製', 'success');
  } catch {
    show('無法複製 UID，請稍後再試', 'error');
  }
}

function confirmLogout() {
  logoutDialogOpen.value = false;
  emit('logout');
}
</script>
