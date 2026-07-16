<template>
  <div
    class="flex w-full min-w-0 flex-col items-center justify-center px-6 py-12 text-center"
    :class="framed ? 'panel panel-pad' : ''"
  >
    <div
      class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-note ring-1 dark:bg-ink-900/80"
      :class="toneClass"
    >
      <AppIcon :name="icon" :size="8" :stroke-width="1.5" />
    </div>
    <h2 class="mt-5 text-xl font-semibold tracking-[0.015em] text-ink-950 dark:text-ink-50">
      {{ title }}
    </h2>
    <p v-if="description" class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
      {{ description }}
    </p>
    <button
      v-if="actionLabel"
      type="button"
      class="button-secondary mt-5"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';

const props = withDefaults(defineProps<{
  actionLabel?: string;
  description?: string;
  framed?: boolean;
  icon?: 'chart' | 'comment' | 'lock' | 'warning' | 'inbox';
  title: string;
  tone?: 'default' | 'danger';
}>(), {
  actionLabel: '',
  description: '',
  framed: false,
  icon: 'chart',
  tone: 'default',
});

const emit = defineEmits<{
  action: [];
}>();

const toneClass = computed(() =>
  props.tone === 'danger'
    ? 'bg-error-container text-error ring-error/15'
    : 'text-ink-400 ring-ink-200/80 dark:text-ink-500 dark:ring-ink-800'
);
</script>
