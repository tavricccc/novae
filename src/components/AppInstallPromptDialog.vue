<template>
  <DialogOverlay :open="open" padded z-index-class="z-[80]" :persistent="preventDismiss">
    <section
      ref="dialogRef"
      class="panel dialog-card flex flex-col !overflow-hidden md:max-w-2xl md:max-h-[min(85dvh,780px)]"
      data-dialog-root
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-install-prompt-title"
      aria-describedby="app-install-prompt-description"
      tabindex="-1"
    >
      <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-5 md:px-8 md:pt-8 md:pb-6">
        <div class="flex items-start justify-between gap-4 pb-2">
          <div class="flex min-w-0 items-start gap-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/90 shadow-sm dark:border-ink-700/80 dark:bg-ink-900/80" aria-hidden="true">
              <component :is="heroIconComponent" v-bind="heroIconProps" class="text-current" :class="content.iconToneClass" />
            </div>

            <div class="min-w-0 flex-1">
              <h2 id="app-install-prompt-title" class="text-[1.75rem] font-bold tracking-tight text-ink-950 dark:text-ink-50 md:text-3xl">
                {{ content.title }}
              </h2>
              <p v-if="content.description" id="app-install-prompt-description" class="mt-2 max-w-2xl text-sm leading-6 text-ink-600 dark:text-ink-300 md:text-base">
                {{ content.description }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="tag border-primary/30 bg-primary-container/70 text-on-primary-container dark:border-primary/40 dark:bg-primary-container/30 dark:text-primary">
              {{ content.badge }}
            </span>
            <span v-if="content.secondaryBadge" class="tag border-ink-200/80 bg-white/80 text-ink-600 dark:border-ink-700/80 dark:bg-ink-900/70 dark:text-ink-300">
              {{ content.secondaryBadge }}
            </span>
          </div>
        </div>

        <div class="mt-6">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-base font-bold tracking-tight text-ink-950 dark:text-ink-50">安裝步驟</h3>
            <span class="tag">{{ content.steps.length }} 個步驟</span>
          </div>

          <ol v-if="content.steps.length" class="mt-4 space-y-3">
            <li
              v-for="(step, index) in content.steps"
              :key="`${index}-${step.title}`"
              class="flex gap-3 border-b border-ink-100/80 pb-3 last:border-b-0 last:pb-0 dark:border-ink-800/80"
            >
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white dark:bg-ink-100 dark:text-ink-900">
                {{ index + 1 }}
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ step.title }}</span>
                <span v-if="step.description" class="mt-1 block text-xs leading-5 text-ink-500 dark:text-ink-400">{{ step.description }}</span>
              </span>
            </li>
          </ol>

          <div v-if="content.notes.length || content.actionTitle" class="mt-6 space-y-4">
            <div v-if="content.notes.length">
              <h4 class="text-sm font-semibold text-ink-900 dark:text-ink-100">操作提醒</h4>
              <ul class="mt-3 space-y-2">
                <li
                  v-for="note in content.notes"
                  :key="note"
                  class="flex gap-2 text-sm leading-6 text-ink-600 dark:text-ink-300"
                >
                  <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                  <span>{{ note }}</span>
                </li>
              </ul>
            </div>

            <div v-if="content.actionTitle">
              <p class="text-sm font-semibold text-ink-900 dark:text-ink-100">{{ content.actionTitle }}</p>
              <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">{{ content.actionDescription }}</p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!preventDismiss || content.primaryLabel"
        class="dialog-actions border-t border-ink-100 bg-white/95 px-5 pb-6 pt-4 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95 md:px-8 md:pb-8 md:pt-4"
      >
        <button
          v-if="!preventDismiss"
          type="button"
          class="button-secondary"
          @click="handleSecondaryAction"
        >
          {{ content.secondaryLabel }}
        </button>
        <button
          v-if="content.primaryLabel"
          type="button"
          class="button-primary gap-2"
          data-autofocus
          :disabled="installing"
          @click="handlePrimaryAction"
        >
          <component :is="primaryIconComponent" v-bind="primaryIconProps" class="shrink-0" />
          {{ content.primaryLabel }}
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="isSkipConfirmOpen"
      title="確定要先跳過嗎？"
      message="你確定要跳過這個步驟嗎？之後仍然可以再開啟安裝提示。"
      cancel-label="繼續查看"
      confirm-label="確認跳過"
      @cancel="isSkipConfirmOpen = false"
      @confirm="confirmSkip"
    />
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import ShareIcon from '@/components/ui/ShareIcon.vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';
import type { AppInstallPromptMode } from '@/composables/useAppInstallPrompt';
import type { InAppBrowserName } from '@/lib/in-app-browser';
import type { AppInstallPromptReason, IosBrowserGuide } from '@/lib/pwa-install';

type InstallStep = {
  description?: string;
  title: string;
};

type InstallContent = {
  actionDescription: string;
  actionTitle: string;
  badge: string;
  description: string;
  icon: 'download' | 'link' | 'warning';
  iconToneClass: string;
  notes: string[];
  primaryLabel: string | null;
  secondaryBadge: string;
  secondaryLabel: string;
  steps: InstallStep[];
  title: string;
};

const props = defineProps<{
  canInstallNatively: boolean;
  iosBrowserGuide: IosBrowserGuide | null;
  open: boolean;
  mode: AppInstallPromptMode;
  browserName: InAppBrowserName | null;
  installing: boolean;
  reason: AppInstallPromptReason;
}>();

const emit = defineEmits<{
  close: [];
  copyUrl: [];
  install: [];
}>();

const content = computed<InstallContent>(() => {
  const isNotificationInstall = props.reason === 'notifications';
  const installDescription = isNotificationInstall
    ? '先加入主畫面，再從主畫面開啟平台，通知功能才會穩定運作。'
    : '加入主畫面後，可以像一般 App 一樣開啟，也能減少瀏覽器工具列干擾。';

  if (props.mode === 'in-app-browser') {
    return {
      actionDescription: '先切到系統瀏覽器，再依該瀏覽器的安裝流程加入主畫面。',
      actionTitle: '先切換開啟方式',
      badge: isNotificationInstall ? '通知需要主畫面模式' : '建議切換瀏覽器',
      description: isNotificationInstall
        ? `目前正在 ${props.browserName ?? 'App'} 的內建瀏覽器中開啟。請先用系統瀏覽器開啟並加入主畫面，再從主畫面開啟通知功能。`
        : `目前正在 ${props.browserName ?? 'App'} 的內建瀏覽器中開啟。部分功能可能無法正常運作，建議在選單內選擇「以瀏覽器開啟」。`,
      icon: 'warning',
      iconToneClass: 'text-warning',
      notes: ['若要開啟通知，需先完成安裝並從主畫面重新開啟平台。'],
      primaryLabel: null,
      secondaryBadge: props.browserName ? `${props.browserName} 內建瀏覽器` : '',
      secondaryLabel: '稍後再說',
      steps: [
        { title: '點擊選單按鈕', description: '點選右上角或右下角的選單圖示（通常是三個點「•••」、分享或羅盤圖示）。' },
        { title: '選擇「以瀏覽器開啟」', description: '在選單中點選「在 Safari 中開啟」、「在預設瀏覽器中開啟」或「以其他應用程式開啟」。' },
        { title: '依步驟加入主畫面', description: '切換到系統瀏覽器後，即可依引導步驟將此平台加入主畫面。' },
      ],
      title: isNotificationInstall ? '改用系統瀏覽器安裝 App' : '建議改用系統瀏覽器',
    };
  }

  if (props.mode === 'ios-open-safari') {
    const browserName = props.iosBrowserGuide === 'Google' ? 'Google App' : 'Chrome';
    return {
      actionDescription: '先把目前網址帶到 Safari，之後就能依安裝流程完成設定。',
      actionTitle: '先把網址移到 Safari',
      badge: '需改用 Safari',
      description: isNotificationInstall
        ? `${browserName} 無法直接完成安裝。請先用 Safari 開啟並安裝為 App，才能使用通知功能。`
        : `${browserName} 無法直接完成安裝。請先改用 Safari 開啟。`,
      icon: 'link',
      iconToneClass: 'text-secondary',
      notes: ['Safari 開啟後，若要使用通知，請記得從主畫面再次開啟平台。'],
      primaryLabel: props.installing ? '複製中...' : '複製網址',
      secondaryBadge: browserName,
      secondaryLabel: '先略過',
      steps: [
        { title: '按下「複製網址」', description: '先把目前這個頁面的網址存到剪貼簿。' },
        { title: '改到 Safari 開啟', description: '貼上網址並進入同一個頁面。' },
        { title: '長按網址列', description: '在 Safari 內長按上方網址列，叫出相關操作。' },
        { title: '選擇分享按鈕', description: '從跳出的操作中選擇分享。' },
        { title: '安裝為 App', description: '往下滑並選擇「加入主畫面」，再依畫面完成新增。' },
      ],
      title: '請改用 Safari 開啟',
    };
  }

  if (props.mode === 'ios-install') {
    return {
      actionDescription: '',
      actionTitle: '照著步驟操作',
      badge: isNotificationInstall ? '先安裝才能開通知' : 'Safari 安裝流程',
      description: '',
      icon: 'link',
      iconToneClass: 'text-primary',
      notes: [installDescription, '如果看不到「加入主畫面」，可先到分享選單底部編輯動作後再加入。', '安裝完成後請從桌面圖示重新進入平台。'],
      primaryLabel: null,
      secondaryBadge: 'Safari',
      secondaryLabel: '稍後再說',
      steps: [
        { title: '長按網址列', description: '先在 Safari 上方長按目前頁面的網址列。' },
        { title: '選擇分享按鈕', description: '從出現的操作中選擇分享。' },
        { title: '安裝為 App', description: '往下滑動分享選單，找到並點選「加入主畫面」。' },
        { title: '確認 App 開啟方式', description: '若有看到「作為 Web App 打開」，請保持開啟。' },
        { title: '按下「新增」完成安裝', description: '回到主畫面後，請從新的平台圖示重新開啟。' },
      ],
      title: isNotificationInstall ? '安裝為 App 以使用通知' : '安裝為 App',
    };
  }

  return {
    actionDescription: '',
    actionTitle: props.canInstallNatively ? '系統會接手安裝' : '',
    badge: isNotificationInstall ? '安裝後再開通知' : 'Android 主畫面安裝',
    description: installDescription,
    icon: 'download',
    iconToneClass: 'text-primary',
    notes: props.canInstallNatively
      ? ['如果這次先略過，之後仍可再從通知或其他入口重新叫出安裝提示。']
      : ['如果沒有跳出系統安裝視窗，也可以從瀏覽器選單尋找「安裝 App」或「加入主畫面」。'],
    primaryLabel: props.canInstallNatively ? (props.installing ? '開啟中' : '安裝 App') : null,
    secondaryBadge: props.canInstallNatively ? '系統安裝視窗' : '瀏覽器選單',
    secondaryLabel: '先略過',
    steps: [
      { title: props.canInstallNatively ? '按下「安裝 App」' : '開啟瀏覽器選單', description: props.canInstallNatively ? '系統會開啟 Android 原生安裝提示。' : '從目前瀏覽器的選單中尋找安裝選項。' },
      { title: '安裝為 App', description: props.canInstallNatively ? '依系統對話框完成安裝或新增捷徑。' : '選擇「安裝 App」或「加入主畫面」完成新增。' },
      { title: '從主畫面開啟平台', description: isNotificationInstall ? '重新開啟後再回到通知設定。' : '之後可像一般 App 一樣直接進入。' },
    ],
    title: isNotificationInstall ? '安裝為 App 以使用通知' : '安裝 App',
  };
});

const heroIconComponent = computed(() => (content.value.icon === 'link' ? ShareIcon : AppIcon));
const heroIconProps = computed(() => (content.value.icon === 'link'
  ? { size: 6 }
  : { name: content.value.icon, size: 6, strokeWidth: 2.1 }));
const primaryIconComponent = computed(() => {
  if (props.mode === 'ios-open-safari' || props.mode === 'ios-install') return ShareIcon;
  return AppIcon;
});
const primaryIconProps = computed(() => {
  if (props.mode === 'ios-open-safari' || props.mode === 'ios-install') return { size: 4 };
  if (props.mode === 'native-install') return { name: 'download', size: 4, strokeWidth: 2.2 };
  return { name: 'close', size: 4, strokeWidth: 2.2 };
});
const isSkipConfirmOpen = ref(false);

const preventDismiss = computed(() => {
  return props.mode === 'in-app-browser' || props.mode === 'ios-open-safari';
});

useBodyScrollLock(toRef(props, 'open'));

const { dialogRef } = useDialogFocus(toRef(props, 'open'), {
  onClose: () => emit('close'),
  persistent: preventDismiss,
});

function handlePrimaryAction() {
  if (props.mode === 'native-install' && props.canInstallNatively) {
    emit('install');
    return;
  }

  if (props.mode === 'ios-install') {
    emit('close');
    return;
  }

  if (props.mode === 'ios-open-safari') {
    emit('copyUrl');
    return;
  }

  emit('close');
}

function handleSecondaryAction() {
  isSkipConfirmOpen.value = true;
}

function confirmSkip() {
  isSkipConfirmOpen.value = false;
  emit('close');
}
</script>
