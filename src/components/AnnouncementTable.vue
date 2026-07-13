<template>
  <div
    ref="tableRef"
    class="issue-table overflow-visible"
    role="table"
    aria-label="公告列表"
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
      <span role="columnheader">發布日期</span>
      <span role="columnheader">操作</span>
      <span v-if="canManage" role="columnheader">管理</span>
    </div>

    <!-- Empty state -->
    <div
      v-if="announcements.length === 0"
      class="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400"
    >
      目前沒有公告。
    </div>

    <!-- Rows -->
    <div v-else class="relative" role="rowgroup">
      <div>
        <AnnouncementTableRow
          v-for="announcement in announcements"
          :key="announcement.id"
          :announcement="announcement"
          :compact-layout="isCompactLayout"
          :can-manage="canManage"
          :liking="likingAnnouncementId === announcement.id"
          @delete="emit('delete', $event)"
          @open="emit('open', $event)"
          @open-comments="emit('openComments', $event)"
          @toggle-like="emit('toggleLike', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnnouncementTableRow from './AnnouncementTableRow.vue';
import { useCompactTableLayout } from '@/composables/useCompactTableLayout';
import type { AnnouncementRecord } from '@/types';

const props = defineProps<{
  announcements: AnnouncementRecord[];
  canManage?: boolean;
  likingAnnouncementId?: string;
}>();

const emit = defineEmits<{
  delete: [announcement: AnnouncementRecord];
  open: [announcement: AnnouncementRecord];
  openComments: [announcement: AnnouncementRecord];
  toggleLike: [announcement: AnnouncementRecord];
}>();

const { isCompactLayout, tableRef } = useCompactTableLayout();

const tableCols = computed(() => {
  const cols = ['6rem', 'minmax(0, 1fr)', '8rem', '7rem'];
  if (props.canManage) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
