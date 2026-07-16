<template>
  <section class="route-page min-h-0 pb-3 sm:pb-5">
    <article
      v-if="isDesktopViewport"
      class="panel hidden min-h-[calc(100dvh-2.5rem)] flex-col overflow-visible md:flex"
      :aria-label="detailsLabel"
    >
      <header class="flex items-start gap-3 px-5 py-4">
        <button
          type="button"
          class="button-icon shrink-0"
          :aria-label="backLabel"
          :title="backLabel"
          @click="emit('back')"
        >
          <AppIcon name="chevron-left" :size="5" />
        </button>
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1.5">
          <slot name="header" />
        </div>
      </header>

      <div
        class="grid min-w-0 flex-1 border-t border-ink-100/70 dark:border-ink-800/70"
        :class="{ 'md:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]': showComments }"
      >
        <div class="flex min-h-0 min-w-0 flex-col px-5 py-5 pr-6">
          <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
            <slot name="details" :compact="false" :scroll-content="false" />
          </div>
          <div class="shrink-0 bg-surface dark:bg-surface">
            <slot name="actions" :compact="false" />
          </div>
        </div>

        <aside
          v-if="showComments"
          class="flex min-h-0 min-w-0 flex-col border-l border-ink-100/70 px-5 py-5 dark:border-ink-800/70"
          :aria-label="commentsLabel"
        >
          <slot name="comments" :compact-header="false" />
        </aside>
      </div>
    </article>

    <article
      v-else
      class="panel flex h-[calc(100dvh-var(--app-header-height)-var(--app-bottom-nav-height)-env(safe-area-inset-top)-1rem)] min-h-0 flex-col overflow-hidden md:hidden"
      :aria-label="detailsLabel"
    >
      <header class="flex shrink-0 items-start gap-3 px-4 py-3.5">
        <button
          v-if="showMobileBackButton"
          type="button"
          class="button-icon shrink-0"
          :aria-label="backLabel"
          :title="backLabel"
          @click="emit('back')"
        >
          <AppIcon name="chevron-left" :size="5" />
        </button>
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

      <Transition name="panel-switch" mode="out-in">
        <div
          v-if="!showComments || activeTab === 'details'"
          key="details"
          class="flex min-h-0 flex-1 flex-col border-t border-ink-100/70 dark:border-ink-800/70"
        >
          <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 overscroll-contain">
            <slot name="details" :compact="true" :scroll-content="false" />
          </div>
          <div class="shrink-0 bg-surface px-4 pb-4 dark:bg-surface">
            <slot name="actions" :compact="true" />
          </div>
        </div>

        <div
          v-else
          key="comments"
          class="min-h-0 flex-1 border-t border-ink-100/70 px-4 py-4 dark:border-ink-800/70"
          :aria-label="commentsLabel"
        >
          <slot name="comments" :compact-header="true" />
        </div>
      </Transition>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import PillSegmentedControl from '@/components/ui/PillSegmentedControl.vue';

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
  backLabel: '返回',
  commentsLabel: '討論留言',
  commentCount: 0,
  initialTab: 'details',
  showMobileBackButton: true,
  showComments: true,
});

const emit = defineEmits<{
  back: [];
}>();

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
  { value: 'details' as const, label: props.detailsLabel, icon: 'list' as const, title: `查看${props.detailsLabel}` },
  {
    value: 'comments' as const,
    label: `${props.commentCount} 則留言`,
    icon: 'comment' as const,
    title: `查看${props.commentsLabel}，共 ${props.commentCount} 則`,
  },
]);

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
