<template>
  <DetailPageShell
    v-if="announcement"
    back-label="返回公告列表"
    :initial-tab="initialTab"
    details-label="公告內容"
    @back="emit('back')"
  >
    <template #header>
      <span class="tag border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">公告</span>
    </template>

    <template #details="{ compact, scrollContent }">
      <AnnouncementDetailContent
        :announcement="announcement"
        :compact="compact"
        :scroll-content="scrollContent"
      />
    </template>

    <template #actions="{ compact }">
      <AnnouncementDetailActions
        :announcement="announcement"
        :can-manage="canManage"
        :compact="compact"
        :liking="liking"
        @delete="emit('delete')"
        @edit="emit('edit')"
        @share="emit('share')"
        @toggle-like="emit('toggleLike')"
      />
    </template>

    <template #comments="{ compactHeader }">
      <AnnouncementComments
        :announcement-id="announcement.id"
        :compact-header="compactHeader"
        :focus-comment-id="focusCommentId"
        class="h-full"
        @comment-count-changed="emit('commentCountChanged', $event)"
        @content-unavailable="emit('contentUnavailable', $event)"
      />
    </template>
  </DetailPageShell>
</template>

<script setup lang="ts">
import type { AnnouncementRecord } from '@/types';
import AnnouncementComments from '@/components/AnnouncementComments.vue';
import AnnouncementDetailActions from '@/components/AnnouncementDetailActions.vue';
import AnnouncementDetailContent from '@/components/AnnouncementDetailContent.vue';
import DetailPageShell from '@/components/ui/DetailPageShell.vue';

const props = withDefaults(defineProps<{
  announcement: AnnouncementRecord | null;
  canManage: boolean;
  focusCommentId?: string;
  initialTab?: 'details' | 'comments';
  liking: boolean;
}>(), {
  focusCommentId: '',
  initialTab: 'details',
});

const emit = defineEmits<{
  back: [];
  contentUnavailable: [announcementId: string];
  share: [];
  delete: [];
  edit: [];
  toggleLike: [];
  commentCountChanged: [payload: { announcementId: string; commentCount: number }];
}>();
</script>
