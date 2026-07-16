<template>
  <header class="app-header fixed inset-x-0 top-0 z-40 w-full backdrop-blur-md transition-colors duration-300 md:hidden">
    <div class="app-header__inner app-viewport-frame mx-auto flex max-w-7xl items-center justify-between">
      <div class="flex min-w-0 items-center gap-3">
        <button
          v-if="showBackButton"
          type="button"
          class="button-icon shrink-0 md:hidden"
          :aria-label="backLabel"
          :title="backLabel"
          @click="$emit('back')"
        >
          <AppIcon name="chevron-left" :size="5" />
        </button>
        <h1 class="app-header__title flex h-10 min-w-0 items-center text-ink-950 dark:text-ink-50" :aria-label="title">
          <IssueCategorySelector
            v-if="categoryFilter && categoryLabel"
            :active-filter="categoryFilter"
            :label="categoryLabel"
            variant="mobile-header"
            @select="filter => $emit('select-category', filter)"
          />
          <span v-else class="truncate text-2xl font-semibold leading-tight tracking-[0.015em]">{{ title }}</span>
        </h1>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import IssueCategorySelector from '@/components/IssueCategorySelector.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { IssueFilter } from '@/types';

defineProps<{
  backLabel: string;
  categoryFilter?: IssueFilter;
  categoryLabel?: string;
  showBackButton: boolean;
  title: string;
}>();

defineEmits<{
  back: [];
  'select-category': [filter: IssueFilter];
}>();
</script>
