<template>
  <div
    class="issue-table overflow-visible"
    role="table"
    aria-label="公告列表"
  >
    <!-- Sticky column header row (hidden on mobile) -->
    <div
      class="issue-table-header hidden md:grid"
      :style="{ 'grid-template-columns': tableCols }"
      role="row"
    >
      <span role="columnheader">狀態</span>
      <span role="columnheader">作者</span>
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
          :can-manage="canManage"
          :liking="likingAnnouncementId === announcement.id"
          @delete="emit('delete', $event)"
          @edit="emit('edit', $event)"
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
import type { AnnouncementRecord } from '@/types';

const props = defineProps<{
  announcements: AnnouncementRecord[];
  canManage?: boolean;
  likingAnnouncementId?: string;
}>();

const emit = defineEmits<{
  delete: [announcement: AnnouncementRecord];
  edit: [announcement: AnnouncementRecord];
  open: [announcement: AnnouncementRecord];
  openComments: [announcement: AnnouncementRecord];
  toggleLike: [announcement: AnnouncementRecord];
}>();

const tableCols = computed(() => {
  const cols = ['6rem', '8rem', '1fr', '8rem', '7rem'];
  if (props.canManage) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
