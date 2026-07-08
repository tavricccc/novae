<template>
  <div class="space-y-0.5" aria-label="留言載入中" aria-busy="true">
    <div
      v-for="index in count"
      :key="index"
      class="flex items-start gap-2.5 py-2.5"
    >
      <span class="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
      <div class="min-w-0 flex-1 space-y-2">
        <div class="flex items-center gap-2">
          <span class="h-3.5 w-24 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          <span class="h-3 w-14 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        </div>
        <span class="block h-3.5 w-full rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        <span class="block h-3.5 w-3/4 rounded bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  count?: number;
}>(), {
  count: 4,
});
</script>
