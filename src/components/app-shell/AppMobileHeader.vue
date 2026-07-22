<template>
  <header class="app-header fixed inset-x-0 top-0 z-40 w-full backdrop-blur-md transition-colors duration-300 md:hidden">
    <ViewportFrame class="app-header__inner flex items-center justify-between">
      <div class="app-header__leading flex min-w-0 items-center">
        <div
          class="app-header__back-slot shrink-0"
          :class="{ 'app-header__back-slot--visible': showBackButton }"
          :aria-hidden="!showBackButton || undefined"
        >
          <AppButton
            variant="icon"
            class="app-header__back md:hidden"
            :disabled="!showBackButton"
            :tabindex="showBackButton ? undefined : -1"
            :aria-label="backLabel"
            :title="showBackButton ? backLabel : undefined"
            @click="$emit('back')"
          >
            <AppIcon name="chevron-left" :size="4.5" />
          </AppButton>
        </div>
        <h1 class="app-header__title flex min-w-0 items-center text-ink-950 dark:text-ink-50" :aria-label="title">
          <Transition name="header-title">
            <BoardCategorySelector
              v-if="categoryFilter && categoryLabel"
              :key="`category:${categoryFilter}`"
              :model-value="categoryFilter"
              :label="categoryLabel"
              :options="categoryOptions"
              :selector-label="t('issue.chooseProposalCategory')"
              variant="mobile-header"
              @update:model-value="filter => $emit('select-category', filter)"
            />
            <span v-else :key="`title:${title}`" class="truncate text-2xl font-semibold leading-tight tracking-[0.015em]">{{ title }}</span>
          </Transition>
        </h1>
      </div>
    </ViewportFrame>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BoardCategorySelector from '@/components/BoardCategorySelector.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import ViewportFrame from '@/components/ui/organisms/ViewportFrame.vue';
import type { IssueFilter } from '@/types';
import { getIssueFilterOptions } from '@/constants/categories';
import { useI18n } from '@/i18n';

const { t } = useI18n();
const categoryOptions = computed(getIssueFilterOptions);

defineProps<{
  backLabel: string;
  categoryFilter?: IssueFilter;
  categoryLabel?: string;
  showBackButton: boolean;
  title: string;
}>();

defineEmits<{
  back: [];
  'select-category': [filter: string];
}>();
</script>
