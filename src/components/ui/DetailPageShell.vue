<template>
  <section class="min-h-0">
    <header class="flex shrink-0 items-start gap-3 pb-3 md:hidden">
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

    <div v-if="isDesktopViewport" class="hidden min-h-0 items-stretch gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] xl:grid-cols-[minmax(0,1fr)_32rem]">
      <div class="h-[calc(100dvh-var(--app-header-height)-env(safe-area-inset-top)-2.5rem)] min-w-0 overflow-y-auto pb-[3px] pr-2">
        <header class="hidden md:flex shrink-0 items-start gap-3 pb-3">
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
        <slot name="details" :compact="false" :scroll-content="false" />
        <slot name="actions" :compact="false" />
      </div>
      <div class="flex h-[calc(100dvh-var(--app-header-height)-env(safe-area-inset-top)-2.5rem)] min-w-0 flex-col border-l border-ink-100 pb-[3px] pl-6 pr-1 dark:border-ink-800">
        <slot name="comments" :compact-header="false" />
      </div>
    </div>

    <div v-else class="min-h-0 md:hidden">
      <div class="mb-2 flex shrink-0 justify-center">
        <SegmentedControl
          :model-value="activeTab"
          :options="tabOptions"
          @update:model-value="setActiveTab"
        />
      </div>

      <div class="min-h-0 px-1">
        <div v-show="activeTab === 'details'" class="flex min-h-[calc(100dvh-var(--app-header-height)-env(safe-area-inset-top)-4.5rem)] flex-col">
          <div class="min-h-0 flex-1 px-1 pb-3 pr-2">
            <slot name="details" :compact="true" :scroll-content="false" />
          </div>
          <div class="pb-[calc(var(--app-bottom-nav-height)+0.75rem)]">
            <slot name="actions" :compact="true" />
          </div>
        </div>

        <div v-show="activeTab === 'comments'" class="h-[calc(100dvh-var(--app-header-height)-var(--app-bottom-nav-height)-env(safe-area-inset-top)-6.5rem)] min-h-[24rem] pb-3">
          <slot name="comments" :compact-header="true" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import SegmentedControl from '@/components/SegmentedControl.vue';
import AppIcon from '@/components/ui/AppIcon.vue';

type DetailPageTab = 'details' | 'comments';

const props = withDefaults(defineProps<{
  backLabel?: string;
  commentsLabel?: string;
  detailsLabel: string;
  initialTab?: DetailPageTab;
}>(), {
  backLabel: '返回',
  commentsLabel: '討論留言',
  initialTab: 'details',
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
  { value: 'details', label: props.detailsLabel },
  { value: 'comments', label: props.commentsLabel },
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

function setActiveTab(value: string) {
  if (value === 'details' || value === 'comments') {
    activeTab.value = value;
  }
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
