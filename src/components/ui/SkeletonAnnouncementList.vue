<template>
  <div class="issue-table overflow-visible" aria-label="公告載入中" aria-busy="true">
    <!-- Sticky column header row (hidden on mobile) -->
    <div
      class="issue-table-header hidden md:grid"
      :style="{ 'grid-template-columns': tableCols }"
      role="row"
    >
      <span role="columnheader">狀態</span>
      <span role="columnheader">作者</span>
      <span role="columnheader">標題</span>
      <span role="columnheader">發布日期</span>
      <span role="columnheader">互動</span>
      <span v-if="canManage" role="columnheader">管理</span>
    </div>

    <!-- Mobile view (condensed card/row format, hidden on md) -->
    <div
      v-for="i in count"
      :key="`mobile-${i}`"
      class="issue-row-mobile md:hidden"
    >
      <div class="flex min-w-0 items-center gap-2 w-full">
        <span class="tag shrink-0 px-2 py-0.5 text-xs border-ink-200 bg-ink-100/50 text-ink-700 dark:border-ink-800 dark:bg-ink-950/50">
          公告
        </span>
        <span class="h-7 w-7 shrink-0 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        <div class="-my-1 flex min-h-10 flex-1 items-center">
          <span class="h-4 w-3/4 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
      </div>
      <div class="mt-1.5 flex w-full items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span class="h-3 w-16 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
        <div class="flex shrink-0 items-center justify-end gap-1.5">
          <span class="h-10 w-10 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
          <span class="h-10 w-10 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
          <span v-if="canManage" class="h-10 w-10 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        </div>
      </div>
    </div>

    <!-- Desktop view (md:grid, hidden on mobile) -->
    <div
      v-for="i in count"
      :key="`desktop-${i}`"
      class="issue-table-row hidden md:grid"
      :style="{ 'grid-template-columns': tableCols }"
    >
      <div class="flex items-center w-24 shrink-0">
        <span class="tag border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">
          公告
        </span>
      </div>

      <div class="flex items-center gap-2 w-32 shrink-0 pr-2">
        <span class="h-7 w-7 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton shrink-0" />
        <span class="h-4 w-16 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
      </div>

      <div class="flex items-center gap-2 flex-1 min-w-0 pr-3">
        <span class="h-4 w-2/3 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
      </div>

      <div class="flex items-center w-32 shrink-0">
        <span class="h-4 w-16 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
      </div>

      <div class="flex items-center gap-1 w-36 shrink-0 pr-2">
        <span class="h-7 w-12 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
        <span class="h-7 w-12 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
      </div>

      <div v-if="canManage" class="flex items-center w-10 shrink-0">
        <span class="h-7 w-7 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  count?: number;
  canManage?: boolean;
}>(), {
  count: 4,
  canManage: false,
});

const tableCols = computed(() => {
  const cols = ['6rem', '8rem', '1fr', '8rem', '9rem'];
  if (props.canManage) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
