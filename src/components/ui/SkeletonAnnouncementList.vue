<template>
  <div class="issue-card-grid" aria-label="公告載入中" aria-busy="true">
    <div v-for="i in count" :key="i" class="issue-card">
      <div class="flex items-center justify-between gap-3">
        <span class="h-5 w-12 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span class="h-3 w-20 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
      </div>
      <div class="mt-3 flex items-center gap-2.5">
        <span class="h-8 w-8 shrink-0 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <div class="min-w-0 flex-1 space-y-2">
          <span class="block h-4 w-4/5 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
          <span class="block h-3 w-2/5 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-1.5">
        <span class="h-8 w-8 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span class="h-8 w-12 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span v-if="canManage" class="h-8 w-8 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  count?: number;
  canManage?: boolean;
}>(), {
  count: 4,
  canManage: false,
});
</script>
