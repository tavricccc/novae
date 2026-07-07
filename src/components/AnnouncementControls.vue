<template>
  <div class="relative z-20 space-y-3">
    <div class="flex flex-row items-center justify-between gap-3 md:mt-0">
      <div class="hidden min-w-0 flex-row items-center gap-3 sm:gap-4 md:flex md:gap-6">
        <h2 class="shrink-0 text-xl font-bold tracking-tight text-ink-950 dark:text-ink-50 md:text-2xl">公告</h2>
      </div>

      <div class="flex shrink-0 flex-row items-center justify-end gap-1.5 sm:gap-2 w-full md:w-auto">
        <!-- 排序方式（圓形 sort 圖示按鈕） -->
        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar h-10 w-10 rounded-full p-0 md:h-9 md:w-9 flex items-center justify-center shrink-0"
            :class="{ 'button-toolbar--active': isSortOpen || sortOption !== 'latest' }"
            :title="`排序公告：${selectedSortLabel}`"
            :aria-label="`排序公告：${selectedSortLabel}`"
            :aria-expanded="isSortOpen"
            @click="toggleSort"
          >
            <AppIcon name="sort" class="h-4 w-4" />
          </button>

          <transition name="popover">
            <div
              v-if="isSortOpen"
              class="absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-64 rounded-2xl border border-ink-200/80 bg-white p-3 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
            >
              <div class="mb-1.5 px-2 text-xs font-semibold text-ink-400 dark:text-ink-50 tracking-wider uppercase">
                排序方式
              </div>
              <div class="space-y-0.5">
                <button
                  v-for="option in announcementSortOptions"
                  :key="option.value"
                  type="button"
                  class="menu-item justify-between"
                  :class="{ 'button-toolbar--active': option.value === sortOption }"
                  @click="selectSort(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="option.value === sortOption" class="text-xs">✓</span>
                </button>
              </div>
            </div>
          </transition>
        </div>

        <button
          v-if="canCreate"
          type="button"
          class="button-icon-filled !h-10 !w-10 md:!h-9 md:!w-9 flex items-center justify-center shrink-0"
          title="新增公告"
          aria-label="新增公告"
          @click="emit('create')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M12 5l0 14" />
            <path d="M5 12l14 0" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { AnnouncementSortOption } from '@/types';

const props = defineProps<{
  canCreate?: boolean;
  sortOption: AnnouncementSortOption;
}>();

const emit = defineEmits<{
  'update:sortOption': [value: AnnouncementSortOption];
  create: [];
}>();

const announcementSortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'most-liked', label: '最多讚' },
  { value: 'most-commented', label: '最多留言' },
] as const;

const isSortOpen = ref(false);
const selectedSortLabel = computed(() =>
  announcementSortOptions.find((option) => option.value === props.sortOption)?.label ?? '最新'
);

function closeFloatingPanels() {
  isSortOpen.value = false;
}

function toggleSort() {
  isSortOpen.value = !isSortOpen.value;
}

function selectSort(value: AnnouncementSortOption) {
  emit('update:sortOption', value);
  isSortOpen.value = false;
}

watch(isSortOpen, (sortOpen) => {
  if (sortOpen) {
    window.addEventListener('click', closeFloatingPanels);
    return;
  }
  window.removeEventListener('click', closeFloatingPanels);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeFloatingPanels);
});
</script>
