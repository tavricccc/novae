<template>
  <div class="issue-card-grid" aria-label="提案載入中" aria-busy="true">
    <div v-for="i in rows" :key="i" class="issue-card">
      <div class="flex items-center justify-between gap-3">
        <span class="h-5 w-14 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span class="h-3 w-20 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
      </div>
      <div class="mt-3 flex items-center gap-2.5">
        <span v-if="showAuthor" class="h-8 w-8 shrink-0 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <div class="min-w-0 flex-1 space-y-2">
          <span class="block h-4 w-4/5 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
          <span class="block h-3 w-2/5 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        </div>
      </div>
      <div class="mt-4 rounded-xl bg-ink-50 px-3 py-2.5 dark:bg-ink-900/55">
        <span class="block h-3 w-20 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span class="mt-2 block h-1.5 w-full rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
      </div>
      <div class="mt-3 flex justify-end gap-1.5">
        <span class="h-8 w-8 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span class="h-8 w-12 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <span v-if="isAdmin" class="h-8 w-8 rounded-full bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number;
  showAuthor?: boolean;
  isAdmin?: boolean;
}>(), {
  rows: 4,
  showAuthor: true,
  isAdmin: false,
});
</script>
