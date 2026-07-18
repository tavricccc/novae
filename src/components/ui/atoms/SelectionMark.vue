<template>
  <span
    class="flex h-5 w-5 shrink-0 items-center justify-center transition-all"
    :class="selected
      ? 'scale-100 text-ink-900 opacity-100 dark:text-ink-100'
      : 'scale-75 text-ink-900 opacity-0 dark:text-ink-100'"
    aria-hidden="true"
  >
    <AppIcon name="check" :size="3.5" :stroke-width="2.5" />
  </span>
</template>

<script setup lang="ts">
import AppIcon from '@/components/ui/atoms/AppIcon.vue';

defineProps<{
  selected: boolean;
}>();
</script>
