<template>
  <div class="relative" :class="{ 'z-50': isDropdownOpen }" role="listitem">
    <article
      class="issue-card list-row-trigger relative overflow-hidden"
      data-list-row-trigger
      @click="emit('open', announcement)"
    >
      <header class="flex min-w-0 items-center gap-2">
        <span class="tag-sm shrink-0 bg-ink-100/70 font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-300">
          公告
        </span>
        <span class="ml-auto truncate text-xs text-ink-400 dark:text-ink-500">{{ dateLabel }}</span>
        <div v-if="canManage" class="shrink-0" @click.stop="stopCardActionClick">
          <CompactActionMenu
            title="管理公告"
            @dropdown-open="(open) => isDropdownOpen = open"
            @delete="emit('delete', announcement)"
          />
        </div>
      </header>

      <div class="mt-3 flex min-w-0 items-center gap-2.5">
        <AuthorAvatar
          :author-uid="announcement.author_uid"
          :photo-url="announcement.author_photo_url"
          :name="announcement.author_name"
          size="sm"
          :alt-text="`${announcement.author_name} 的頭像`"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <h3 class="line-clamp-2 text-[15px] font-semibold leading-6 tracking-[0.01em] text-ink-950 dark:text-ink-50 sm:text-base">
            {{ announcement.title }}
          </h3>
          <p class="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
            {{ announcement.author_name }}
          </p>
        </div>
      </div>

      <footer class="mt-4 flex items-center justify-end gap-1.5" @click.stop="stopCardActionClick">
        <button
          type="button"
          class="button-toolbar h-8 w-8 rounded-full p-0"
          title="查看留言"
          aria-label="查看留言"
          @click.stop="emit('openComments', announcement)"
        >
          <AppIcon name="comment" />
        </button>
        <button
          type="button"
          :class="[
            announcement.currentUserLiked ? 'button-icon-pill-filled' : 'button-icon-pill',
            '!h-8 !gap-1 !px-2.5 text-xs',
          ]"
          :disabled="liking"
          :title="announcement.currentUserLiked ? '取消讚' : '按讚'"
          :aria-label="announcement.currentUserLiked ? '取消讚' : '按讚'"
          @click.stop="emit('toggleLike', announcement)"
        >
          <AppIcon name="thumbs-up" />
          <span class="text-sm font-semibold leading-none tabular-nums">{{ announcement.like_count }}</span>
        </button>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnnouncementRecord } from '@/types';
import AuthorAvatar from '@/components/AuthorAvatar.vue';
import CompactActionMenu from '@/components/CompactActionMenu.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { formatDateOnly } from '@/lib/format';

const props = defineProps<{
  announcement: AnnouncementRecord;
  canManage?: boolean;
  liking?: boolean;
}>();

const emit = defineEmits<{
  delete: [announcement: AnnouncementRecord];
  open: [announcement: AnnouncementRecord];
  openComments: [announcement: AnnouncementRecord];
  toggleLike: [announcement: AnnouncementRecord];
}>();

const isDropdownOpen = ref(false);
const dateLabel = computed(() => formatDateOnly(props.announcement.published_at));
const stopCardActionClick = () => undefined;
</script>
