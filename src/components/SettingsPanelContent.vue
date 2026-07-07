<template>
  <div class="flex min-h-0 flex-col overflow-hidden" :class="contentClass">
    <div
      v-if="!flat"
      class="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-700"
    >
      <div>
        <p class="text-base font-bold tracking-tight text-ink-950 dark:text-ink-50">設定</p>
        <p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">帳號與通知偏好</p>
      </div>
      <button
        v-if="showClose"
        type="button"
        class="button-toolbar -mr-1 h-9 w-9 shrink-0 rounded-full p-0"
        aria-label="關閉設定"
        data-autofocus
        @click="emit('close')"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <div class="min-h-0 overflow-y-auto px-4 py-4" :class="{ '!px-1 !py-2': flat }">
      <section aria-label="目前帳號" :class="{ 'pb-4 border-b border-ink-100 dark:border-ink-800/60': flat }">
        <div class="flex items-center gap-3">
          <UserAvatar :photo-url="displayPhotoUrl" :name="displayName || 'U'" size="md" alt-text="使用者頭像" class="h-10 w-10 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink-950 dark:text-ink-50">
              {{ displayName || '校內使用者' }}
            </p>
            <p class="truncate text-xs text-ink-500 dark:text-ink-400">
              {{ email }}
            </p>
          </div>
          <button
            type="button"
            class="button-secondary h-10 shrink-0 gap-2 px-3 text-sm font-semibold"
            @click="emit('switchAccount')"
          >
            <AppIcon name="switch-horizontal" :size="4" :stroke-width="2" />
            切換
          </button>
        </div>
      </section>

      <section
        :class="flat ? 'border-b border-ink-100 pt-4 dark:border-ink-800/60' : 'mt-5 border-t border-ink-100 pt-4 dark:border-ink-800'"
        aria-label="推播通知"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-4 text-left"
          :class="[
            flat ? 'content-trigger px-1 py-3.5' : 'content-trigger px-3 py-3.5',
            (pushLoading || !pushActionLabel) ? 'opacity-60 cursor-not-allowed' : ''
          ]"
          :disabled="pushLoading || !pushActionLabel"
          @click="emit('togglePush')"
        >
          <span class="min-w-0">
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

      <section
        :class="flat ? 'border-b border-ink-100 dark:border-ink-800/60 py-4' : 'mt-5 border-t border-ink-100 pt-4 dark:border-ink-800'"
        aria-label="通知類型"
      >
        <div class="mb-3" :class="{ 'px-1': flat }">
          <p class="text-sm font-semibold text-ink-950 dark:text-ink-50">通知類型</p>
        </div>
        <div :class="flat ? 'space-y-1' : 'space-y-2'">
          <button
            v-for="option in personalNotificationOptions"
            :key="option.key"
            type="button"
            class="flex w-full items-center justify-between gap-4 text-left"
            :class="flat ? 'content-trigger px-1 py-3.5 border-b border-ink-100/60 dark:border-ink-800/40 last:border-b-0' : 'content-trigger border border-ink-100 px-3 py-3.5 dark:border-ink-800'"
            :disabled="pushLoading"
            @click="emit('setPreference', option.key, !personalPreferences[option.key])"
          >
            <span class="min-w-0">
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

      <section
        :class="flat ? 'border-b border-ink-100 dark:border-ink-800/60' : 'mt-5 border-t border-ink-100 pt-4 dark:border-ink-800'"
        aria-label="其他頁面"
      >
        <p v-if="!flat" class="mb-2 text-xs font-semibold text-ink-600 dark:text-ink-300">其他</p>
        <div :class="flat ? 'divide-y divide-ink-100 dark:divide-ink-800/60' : 'space-y-1'">
          <RouterLink
            to="/changelog"
            class="flex w-full items-center justify-between gap-3 text-left"
            :class="flat ? 'content-trigger px-1 py-4' : 'content-trigger px-3 py-3'"
            @click="emit('close')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                <AppIcon name="refresh" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">更新紀錄</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">查看最近功能調整與改善</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </RouterLink>
          <RouterLink
            v-if="isAdmin"
            to="/dashboard"
            class="flex w-full items-center justify-between gap-3 text-left"
            :class="flat ? 'content-trigger px-1 py-4' : 'content-trigger px-3 py-3'"
            @click="emit('close')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                <AppIcon name="chart" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">統計</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">查看平台維運與使用概況</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </RouterLink>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 text-left"
            :class="flat ? 'content-trigger px-1 py-4' : 'content-trigger px-3 py-3'"
            @click="emit('restartApp')"
          >
            <span class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                <AppIcon name="refresh" :size="4" :stroke-width="2" />
              </span>
              <span>
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">重啟 App</span>
                <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">重新載入最新狀態</span>
              </span>
            </span>
            <AppIcon name="chevron-right" :size="4" class="shrink-0 text-ink-400" :stroke-width="2.2" />
          </button>
        </div>
      </section>

      <div :class="flat ? 'pt-6 pb-2' : 'mt-5 border-t border-ink-100 pt-4 dark:border-ink-800'">
        <button
          type="button"
          class="button-secondary w-full border-error/20 text-error hover:bg-error-container/50"
          @click="emit('logout')"
        >
          登出目前帳號
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import type { PersonalPushPreferenceKey, PersonalPushPreferences } from '@/services/notifications';

withDefaults(defineProps<{
  contentClass?: string;
  displayName: string;
  displayPhotoUrl: string | null;
  email: string;
  isAdmin: boolean;
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
</script>
