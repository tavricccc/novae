<template>
  <div
    ref="tableRef"
    class="issue-table overflow-visible"
    role="table"
    aria-label="提案列表"
  >
    <!-- Sticky column header row (hidden on mobile) -->
    <div
      v-if="!isCompactLayout"
      class="issue-table-header grid"
      :style="{ 'grid-template-columns': tableCols }"
      role="row"
    >
      <span role="columnheader">狀態</span>
      <span role="columnheader">標題</span>
      <span role="columnheader">時間</span>
      <span role="columnheader">進度</span>
      <span role="columnheader">操作</span>
      <span v-if="isAdmin" role="columnheader">管理</span>
    </div>

    <!-- Initial loading state (no content yet): show skeleton -->
    <SkeletonTable
      v-if="loading && issues.length === 0"
      :show-author="showAuthor"
      :is-admin="isAdmin"
      :compact-layout="isCompactLayout"
    />

    <!-- Error state -->
    <div
      v-else-if="error"
      class="px-4 py-8 text-center text-sm text-error"
    >
      {{ error }}
    </div>

    <!-- Empty state -->
    <div
      v-else-if="issues.length === 0"
      class="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400"
    >
      沒有符合的提案。
    </div>

    <!-- Rows -->
    <div v-else class="relative" role="rowgroup">
      <div>
        <IssueTableRow
          v-for="issue in issues"
          :key="issue.id"
          :issue="issue"
          :compact-layout="isCompactLayout"
          :highlight-query="highlightQuery"
          @open-details="emit('open-details', $event)"
          @support-changed="emit('support-changed', $event)"
          @issue-updated="emit('issue-updated', $event)"
          @issue-deleted="emit('issue-deleted', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IssueTableRow from './IssueTableRow.vue';
import SkeletonTable from '@/components/ui/SkeletonTable.vue';
import { useCompactTableLayout } from '@/composables/useCompactTableLayout';
import { useSession } from '@/composables/useSession';
import type { IssueRecord } from '@/types';

const props = withDefaults(defineProps<{
  issues: IssueRecord[];
  loading: boolean;
  error: string;
  showAuthor?: boolean;
  highlightQuery?: string;
}>(), {
  showAuthor: true,
  highlightQuery: '',
});

const emit = defineEmits<{
  'support-changed': [payload: { issueId: string; supported: boolean; supportCount: number }];
  'open-details': [payload: { issue: IssueRecord; initialTab: 'details' | 'comments' }];
  'issue-updated': [issue: IssueRecord];
  'issue-deleted': [issueId: string];
}>();

const { isAdmin } = useSession();
const { isCompactLayout, tableRef } = useCompactTableLayout();

const tableCols = computed(() => {
  const cols = ['6rem'];
  cols.push('minmax(0, 1fr)', '8rem', '9rem', '7rem');
  if (isAdmin.value) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
