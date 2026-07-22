<template>
  <section class="h-full min-h-0 pb-0 md:pb-5">
    <SurfacePanel
      v-if="isDesktopViewport"
      as="article"
      class="hidden min-h-[calc(100dvh-2.5rem)] flex-col overflow-visible md:flex"
      :aria-label="t(detailsLabel)"
    >
      <header class="flex items-start gap-3 px-5 py-4">
        <AppButton
          variant="icon"
          class="shrink-0"
          :aria-label="t(backLabel)"
          :title="t(backLabel)"
          @click="emit('back')"
        >
          <AppIcon name="chevron-left" :size="5" />
        </AppButton>
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1.5">
          <slot name="header" />
        </div>
      </header>

      <div
        class="grid min-w-0 flex-1 border-t border-ink-100/70 dark:border-ink-800/70"
        :class="{ 'md:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]': showComments }"
      >
        <div class="flex min-h-0 min-w-0 flex-col px-5 py-5 pr-6">
          <div class="scroll-shadow-bleed--compact min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            <slot name="details" :compact="false" :scroll-content="false" />
          </div>
          <div class="shrink-0 bg-surface dark:bg-surface">
            <slot name="actions" :compact="false" />
          </div>
        </div>

        <aside
          v-if="showComments"
          class="flex min-h-0 min-w-0 flex-col border-l border-ink-100/70 px-5 py-5 dark:border-ink-800/70"
          :aria-label="t(commentsLabel)"
        >
          <slot name="comments" :compact-header="false" />
        </aside>
      </div>
    </SurfacePanel>

    <article
      v-else
      class="flex h-full min-h-0 flex-col overflow-hidden pb-[5px] md:hidden"
      :aria-label="t(detailsLabel)"
    >
      <header class="flex shrink-0 items-start gap-3 px-0 py-3">
        <AppButton
          v-if="showMobileBackButton"
          variant="icon"
          class="shrink-0"
          :aria-label="t(backLabel)"
          :title="t(backLabel)"
          @click="emit('back')"
        >
          <AppIcon name="chevron-left" :size="5" />
        </AppButton>
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1.5">
          <slot name="header" />
        </div>
        <PillSegmentedControl
          v-if="showComments"
          v-model="activeTab"
          :options="tabOptions"
          class="shrink-0 self-center"
        />
      </header>

      <div class="detail-tab-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Transition :name="detailTabTransitionName">
          <div
            v-if="!showComments || activeTab === 'details'"
            key="details"
            class="flex min-h-0 flex-1 flex-col border-t border-ink-100/70 dark:border-ink-800/70"
          >
            <div class="scroll-shadow-bleed--compact min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 overscroll-contain">
              <slot name="details" :compact="true" :scroll-content="false" />
            </div>
            <div class="shrink-0 px-0 pb-2">
              <slot name="actions" :compact="true" />
            </div>
          </div>

          <div
            v-else
            key="comments"
            class="min-h-0 flex-1 border-t border-ink-100/70 px-0 py-3 dark:border-ink-800/70"
            :aria-label="t(commentsLabel)"
          >
            <slot name="comments" :compact-header="true" />
          </div>
        </Transition>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import PillSegmentedControl from '@/components/ui/molecules/PillSegmentedControl.vue';
import SurfacePanel from '@/components/ui/molecules/SurfacePanel.vue';
import { useI18n } from '@/i18n';

type DetailPageTab = 'details' | 'comments';

const props = withDefaults(defineProps<{
  backLabel?: string;
  commentsLabel?: string;
  commentCount?: number;
  detailsLabel: string;
  initialTab?: DetailPageTab;
  showMobileBackButton?: boolean;
  showComments?: boolean;
}>(), {
  backLabel: 'issue.return',
  commentsLabel: 'comments.title',
  commentCount: 0,
  initialTab: 'details',
  showMobileBackButton: true,
  showComments: true,
});

const emit = defineEmits<{
  back: [];
}>();
const { t } = useI18n();

defineSlots<{
  actions(props: { compact: boolean }): unknown;
  comments(props: { compactHeader: boolean }): unknown;
  details(props: { compact: boolean; scrollContent: boolean }): unknown;
  header(): unknown;
}>();

const activeTab = ref<DetailPageTab>(props.initialTab);
const isDesktopViewport = ref(
  typeof window === 'undefined' ? false : window.matchMedia('(min-width: 768px)').matches,
);
let desktopMediaQuery: MediaQueryList | null = null;

const tabOptions = computed(() => [
  { value: 'details' as const, label: t(props.detailsLabel), icon: 'list' as const, title: t('common.viewLabel', { label: t(props.detailsLabel) }) },
  {
    value: 'comments' as const,
    label: t('comments.countComments', { count: props.commentCount }),
    icon: 'comment' as const,
    title: t('comments.viewLabelCountComments', { label: t(props.commentsLabel), count: props.commentCount }),
  },
]);
const detailTabTransitionName = computed(() => activeTab.value === 'comments'
  ? 'detail-tab-forward'
  : 'detail-tab-back');

watch(
  () => props.initialTab,
  (tab) => {
    activeTab.value = tab;
  },
);

function syncDesktopViewport(event?: MediaQueryListEvent) {
  isDesktopViewport.value = event?.matches ?? desktopMediaQuery?.matches ?? window.innerWidth >= 768;
}

onMounted(() => {
  desktopMediaQuery = window.matchMedia('(min-width: 768px)');
  syncDesktopViewport();
  desktopMediaQuery.addEventListener('change', syncDesktopViewport);
});

onBeforeUnmount(() => {
  desktopMediaQuery?.removeEventListener('change', syncDesktopViewport);
});
</script>
