<template>
  <div class="route-page panel panel-pad flex w-full min-w-0 flex-col items-center py-14 text-center">
    <span class="grid h-14 w-14 place-items-center rounded-2xl bg-warning-container text-warning shadow-note" aria-hidden="true">
      <AppIcon name="circle-alert" :size="7" :stroke-width="1.7" />
    </span>
    <h2 class="mt-5 text-xl font-semibold tracking-[0.015em] text-ink-950 dark:text-ink-50">{{ title }}</h2>
    <p class="mt-2 text-sm text-ink-500 dark:text-ink-400">{{ description }}</p>
    <button type="button" class="button-secondary mt-5" :disabled="retryDisabled" @click="emit('retry')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue';

withDefaults(defineProps<{
  actionLabel?: string;
  description?: string;
  retryDisabled?: boolean;
  title?: string;
}>(), {
  actionLabel: '重新整理',
  description: '資料等待時間過長，請檢查網路後再試一次。',
  retryDisabled: false,
  title: '網路似乎有問題',
});

const emit = defineEmits<{
  retry: [];
}>();
</script>
