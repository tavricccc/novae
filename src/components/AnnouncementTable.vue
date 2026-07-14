<template>
  <div class="issue-table overflow-visible" role="list" aria-label="公告列表">
    <div
      v-if="announcements.length === 0"
      class="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400"
    >
      目前沒有公告。
    </div>

    <div v-else class="issue-card-grid" role="presentation">
      <AnnouncementTableRow
        v-for="announcement in announcements"
        :key="announcement.id"
        :announcement="announcement"
        :can-manage="canManage"
        :liking="likingAnnouncementId === announcement.id"
        @delete="emit('delete', $event)"
        @open="emit('open', $event)"
        @open-comments="emit('openComments', $event)"
        @toggle-like="emit('toggleLike', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import AnnouncementTableRow from './AnnouncementTableRow.vue';
import type { AnnouncementRecord } from '@/types';

defineProps<{
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

</script>
