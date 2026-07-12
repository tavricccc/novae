<template>
  <div class="relative z-20 space-y-3">
    <div class="flex flex-row items-center justify-between gap-3 md:mt-0">
      <div class="hidden min-w-0 flex-row items-center gap-3 sm:gap-4 md:flex md:gap-6">
        <h2 class="shrink-0 text-xl font-bold tracking-tight text-ink-950 dark:text-ink-50 md:text-2xl">公告</h2>
      </div>

      <div class="flex w-full shrink-0 flex-row items-center justify-end gap-1.5 sm:gap-2 md:w-auto">
        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
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
              class="popover-panel popover-panel--section absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-max md:min-w-[10rem]"
            >
              <div class="popover-section-label mb-1.5 whitespace-nowrap">排序方式</div>
              <div class="space-y-0.5">
                <button
                  v-for="option in announcementSortOptions"
                  :key="option.value"
                  type="button"
                  class="menu-item justify-between gap-4 whitespace-nowrap"
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
          type="button"
          class="button-toolbar flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
          title="重新整理公告"
          aria-label="重新整理公告"
          :disabled="refreshing"
          @click="emit('refresh')"
        >
          <AppIcon name="refresh" class="h-4 w-4" />
        </button>

        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useClickOutside } from '@/composables/useClickOutside';
import type { AnnouncementSortOption } from '@/types';

const props = defineProps<{
  sortOption: AnnouncementSortOption;
  refreshing?: boolean;
}>();

const emit = defineEmits<{
  'update:sortOption': [value: AnnouncementSortOption];
  refresh: [];
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

useClickOutside(isSortOpen, [], () => {
  isSortOpen.value = false;
});

function toggleSort() {
  isSortOpen.value = !isSortOpen.value;
}

function selectSort(value: AnnouncementSortOption) {
  emit('update:sortOption', value);
  isSortOpen.value = false;
}
</script>
