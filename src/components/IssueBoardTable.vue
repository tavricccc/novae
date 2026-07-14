<template>
  <div class="issue-table overflow-visible" role="list" aria-label="提案列表">
    <SkeletonTable
      v-if="loading && issues.length === 0"
      :show-author="showAuthor"
      :is-admin="isAdmin"
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

    <div v-else class="issue-card-grid" role="presentation">
      <IssueTableRow
        v-for="issue in issues"
        :key="issue.id"
        :issue="issue"
        :highlight-query="highlightQuery"
        @open-details="emit('open-details', $event)"
        @support-changed="emit('support-changed', $event)"
        @issue-updated="emit('issue-updated', $event)"
        @issue-deleted="emit('issue-deleted', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import IssueTableRow from './IssueTableRow.vue';
import SkeletonTable from '@/components/ui/SkeletonTable.vue';
import { useSession } from '@/composables/useSession';
import type { IssueRecord } from '@/types';

withDefaults(defineProps<{
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
</script>
