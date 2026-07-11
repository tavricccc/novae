<template>
  <span class="busy-button-content relative inline-flex items-center justify-center gap-2" :class="{ 'is-busy': busy }">
    <span v-if="busy" class="busy-button-spinner grid place-items-center rounded-full" aria-hidden="true">
      <LoadingSpinner :size="spinnerSize" class="shrink-0" />
    </span>
    <template v-if="busy">
      {{ busyLabel || label || '處理中...' }}
    </template>
    <template v-else>
      <slot>{{ label }}</slot>
    </template>
  </span>
</template>

<script setup lang="ts">
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';

withDefaults(defineProps<{
  busy?: boolean;
  label?: string;
  busyLabel?: string;
  spinnerSize?: number;
}>(), {
  busy: false,
  label: '',
  busyLabel: '',
  spinnerSize: 4,
});
</script>

<style scoped>
.busy-button-content.is-busy {
  animation: busy-content-pulse 1.4s ease-in-out infinite;
}

.busy-button-spinner {
  box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 24%, transparent);
  animation: busy-spinner-ring 1.4s ease-out infinite;
}

@keyframes busy-content-pulse {
  50% { opacity: 0.72; }
}

@keyframes busy-spinner-ring {
  60%, 100% { box-shadow: 0 0 0 0.3rem transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .busy-button-content.is-busy,
  .busy-button-spinner { animation: none; }
}
</style>
