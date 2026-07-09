<template>
  <div
    class="relative"
    :class="{ 'z-50': isDropdownOpen }"
  >
    <!-- Mobile view (condensed card/row format, hidden on md) -->
    <div class="issue-row-mobile list-row-trigger md:hidden relative overflow-hidden" @click="emit('open', announcement)">
      <div class="flex min-w-0 items-center gap-2 w-full">
        <span class="tag shrink-0 px-2 py-0.5 text-xs border-ink-200 bg-ink-100/50 text-ink-700 dark:border-ink-800 dark:bg-ink-950/50">
          公告
        </span>
        <AuthorAvatar :author-uid="announcement.author_uid" :photo-url="announcement.author_photo_url" :name="announcement.author_name" size="sm" :alt-text="`${announcement.author_name} 的頭像`" class="shrink-0" />
        <div class="flex-1 py-1 text-left">
          <span class="line-clamp-1 font-semibold text-sm tracking-normal text-ink-950 dark:text-ink-50 hover:underline">
            {{ announcement.title }}
          </span>
        </div>
      </div>
      <div class="mt-1.5 flex w-full items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs text-ink-500 dark:text-ink-400">
          <span class="min-w-0 truncate font-normal text-ink-400 dark:text-ink-500">{{ dateLabel }}</span>
        </div>
        <div class="flex shrink-0 items-center justify-end gap-1.5" @click.stop="stopRowActionClick">
          <button
            type="button"
            class="button-toolbar h-10 w-10 rounded-full p-0"
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
            <AppIcon name="heart" :filled="announcement.currentUserLiked" />
            <span class="text-sm font-semibold leading-none tabular-nums">{{ announcement.like_count }}</span>
          </button>

          <CompactActionMenu
            v-if="canManage"
            class="shrink-0"
            title="管理公告"
            @dropdown-open="(open) => isDropdownOpen = open"
            @delete="emit('delete', announcement)"
            @edit="emit('edit', announcement)"
          />
        </div>
      </div>
    </div>

    <!-- Desktop view (md:grid, hidden on mobile) -->
    <div
      class="issue-table-row hidden md:grid relative overflow-hidden"
      data-list-row-trigger
      :style="{ 'grid-template-columns': tableCols }"
      role="row"
      @click="emit('open', announcement)"
    >
      <div class="flex items-center w-24 shrink-0">
        <span class="tag border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">
          公告
        </span>
      </div>

      <div class="flex items-center gap-2 w-32 shrink-0 pr-2">
        <AuthorAvatar
          :author-uid="announcement.author_uid"
          :photo-url="announcement.author_photo_url"
          :name="announcement.author_name"
          size="sm"
          :alt-text="`${announcement.author_name} 的頭像`"
          class="author-avatar"
        />
        <span class="truncate text-xs font-normal text-ink-500 dark:text-ink-400" :title="announcement.author_name">
          {{ announcement.author_name }}
        </span>
      </div>

      <div class="flex items-center gap-2 flex-1 min-w-0 pr-3">
        <div class="w-full py-1 text-left text-sm font-semibold tracking-tight text-ink-900 hover:text-ink-950 hover:underline dark:text-ink-100 dark:hover:text-white sm:text-base truncate" :title="announcement.title">
          {{ announcement.title }}
        </div>
      </div>

      <div class="flex items-center w-32 shrink-0 text-xs text-ink-400/90 dark:text-ink-500/90 whitespace-nowrap">
        {{ dateLabel }}
      </div>

      <div class="flex items-center gap-1 w-28 shrink-0 pr-2" @click.stop="stopRowActionClick">
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
          <AppIcon name="heart" :filled="announcement.currentUserLiked" />
          <span class="text-sm font-semibold leading-none tabular-nums">{{ announcement.like_count }}</span>
        </button>

        <button
          type="button"
          class="button-toolbar h-7 w-7 rounded-full p-0"
          title="查看留言"
          aria-label="查看留言"
          @click="emit('openComments', announcement)"
        >
          <AppIcon name="comment" />
        </button>
      </div>

      <div v-if="canManage" class="flex items-center w-10 shrink-0" @click.stop="stopRowActionClick">
        <CompactActionMenu
          title="管理公告"
          @dropdown-open="(open) => isDropdownOpen = open"
          @delete="emit('delete', announcement)"
          @edit="emit('edit', announcement)"
        />
      </div>
    </div>
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
  edit: [announcement: AnnouncementRecord];
  open: [announcement: AnnouncementRecord];
  openComments: [announcement: AnnouncementRecord];
  toggleLike: [announcement: AnnouncementRecord];
}>();

const isDropdownOpen = ref(false);

const dateLabel = computed(() => formatDateOnly(props.announcement.published_at));
const stopRowActionClick = () => undefined;

const tableCols = computed(() => {
  const cols = ['6rem', '8rem', '1fr', '8rem', '7rem'];
  if (props.canManage) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
