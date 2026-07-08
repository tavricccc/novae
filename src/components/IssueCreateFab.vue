<template>
  <button
    v-if="visible"
    type="button"
    class="fixed bottom-[calc(var(--app-bottom-nav-height)+1rem)] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-ink-950 text-ink-50 shadow-elevated ring-4 ring-white/90 transition-transform hover:scale-105 active:scale-95 md:bottom-8 dark:bg-ink-50 dark:text-ink-950 dark:ring-ink-950/90"
    title="新增提案"
    aria-label="新增提案"
    @click="openCategoryDialog"
  >
    <AppIcon name="edit" :size="6" :stroke-width="2.4" />
  </button>

  <DialogOverlay :open="categoryDialogOpen" @close="closeCategoryDialog">
    <section
      ref="dialogRef"
      class="panel panel-pad mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl"
      data-dialog-root
      tabindex="-1"
      aria-labelledby="issue-category-dialog-title"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold text-ink-500 dark:text-ink-400">新增提案</p>
          <h3 id="issue-category-dialog-title" class="mt-1 text-lg font-bold tracking-normal text-ink-950 dark:text-ink-50">
            選擇發布分類
          </h3>
        </div>
        <button
          type="button"
          class="button-toolbar h-9 w-9 shrink-0 rounded-full p-0"
          aria-label="關閉分類選擇"
          data-autofocus
          @click="closeCategoryDialog"
        >
          <AppIcon name="close" :size="4" />
        </button>
      </div>

      <div class="grid gap-2">
        <button
          v-for="option in categoryOptions"
          :key="option.value"
          type="button"
          class="content-trigger flex w-full items-center justify-between gap-3 border border-ink-100 px-3 py-3 text-left dark:border-ink-800"
          :class="{ 'button-toolbar--active': option.value === selectedCategory }"
          @click="selectCategory(option.value)"
        >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ option.label }}</span>
          </span>
          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
            :class="option.value === selectedCategory
              ? 'border-ink-900 bg-ink-900 text-white dark:border-ink-50 dark:bg-ink-50 dark:text-ink-950'
              : 'border-ink-300 text-transparent dark:border-ink-700'"
            aria-hidden="true"
          >
            ✓
          </span>
        </button>
      </div>

      <div class="flex justify-end gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
        <button type="button" class="button-secondary px-4" @click="closeCategoryDialog">取消</button>
        <button type="button" class="button-primary px-4" @click="confirmCategory">下一步</button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useDialogFocus } from '@/composables/useDialogFocus';
import { ISSUE_FILTER_OPTIONS } from '@/constants/categories';
import type { IssueCategory } from '@/types';

const props = defineProps<{
  defaultCategory: IssueCategory;
  visible?: boolean;
}>();

const emit = defineEmits<{
  create: [category: IssueCategory];
}>();

const categoryOptions = ISSUE_FILTER_OPTIONS;
const categoryDialogOpen = ref(false);
const selectedCategory = ref<IssueCategory>(props.defaultCategory);
const { dialogRef } = useDialogFocus(categoryDialogOpen, {
  onClose: closeCategoryDialog,
});

function openCategoryDialog() {
  selectedCategory.value = props.defaultCategory;
  categoryDialogOpen.value = true;
}

function closeCategoryDialog() {
  categoryDialogOpen.value = false;
}

function selectCategory(category: IssueCategory) {
  selectedCategory.value = category;
}

function confirmCategory() {
  categoryDialogOpen.value = false;
  emit('create', selectedCategory.value);
}

watch(
  () => props.defaultCategory,
  (category) => {
    if (!categoryDialogOpen.value) {
      selectedCategory.value = category;
    }
  },
);
</script>
