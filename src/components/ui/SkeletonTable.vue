<template>
  <div ref="tableRef" class="divide-y divide-ink-100 dark:divide-ink-800/60">
    <template v-if="resolvedCompactLayout">
      <div
        v-for="i in rows"
        :key="`mobile-${i}`"
        class="issue-row-mobile"
      >
        <div class="flex min-w-0 items-center gap-2 py-1">
          <span class="h-5 w-14 shrink-0 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          <span v-if="showAuthor" class="h-7 w-7 shrink-0 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          <span class="h-4 min-w-0 flex-1 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        </div>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span class="h-3 min-w-0 flex-1 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            <span class="h-5 w-16 shrink-0 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          </div>
          <div class="flex shrink-0 items-center justify-end gap-1.5">
            <span class="h-8 w-8 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            <span class="h-8 w-8 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
            <span v-if="isAdmin" class="h-8 w-8 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div
        v-for="i in rows"
        :key="i"
        class="issue-table-row"
        :style="{ 'grid-template-columns': gridCols }"
      >
        <div class="flex items-center w-24 shrink-0">
          <span class="inline-block h-5 w-14 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div v-if="showAuthor" class="flex items-center gap-2 w-32 shrink-0 pr-2">
          <span class="inline-block h-7 w-7 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton shrink-0" />
          <span class="inline-block h-4 w-20 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div class="flex items-center flex-1 min-w-0 pr-3">
          <span class="inline-block h-4 w-3/4 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div class="flex items-center w-32 shrink-0">
          <span class="inline-block h-4 w-16 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div class="flex items-center w-36 shrink-0 pr-2">
          <span class="inline-block h-4 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div class="flex items-center w-28 shrink-0">
          <span class="inline-block h-5 w-12 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div v-if="isAdmin" class="flex items-center w-10 shrink-0">
          <span class="inline-block h-4 w-4 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCompactTableLayout } from '@/composables/useCompactTableLayout';

const props = withDefaults(defineProps<{
  rows?: number;
  showAuthor?: boolean;
  isAdmin?: boolean;
  compactLayout?: boolean;
}>(), {
  rows: 4,
  showAuthor: true,
  isAdmin: false,
});

const { isCompactLayout, tableRef } = useCompactTableLayout();
const resolvedCompactLayout = computed(() => props.compactLayout ?? isCompactLayout.value);

const gridCols = computed(() => {
  const cols = ['6rem'];
  if (props.showAuthor) cols.push('8rem');
  cols.push('minmax(0, 1fr)', '8rem', '9rem', '7rem');
  if (props.isAdmin) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
