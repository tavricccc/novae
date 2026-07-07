<template>
  <section class="page-bottom-safe space-y-5">
    <header class="flex flex-col gap-3 border-b border-ink-200/80 pb-4 dark:border-ink-800/80 sm:flex-row sm:items-center sm:justify-between">
      <h2 class="text-2xl font-bold tracking-tight text-ink-950 dark:text-ink-50 sm:text-3xl">更新紀錄</h2>
      <p class="text-sm font-semibold text-ink-500 dark:text-ink-400">
        累計更新：{{ totalUpdates }} 次
      </p>
    </header>

    <EmptyStatePanel
      v-if="!isAllowedUser"
      title="無法查看更新紀錄"
      description="請先使用校內帳號登入。"
      icon="lock"
    />

    <EmptyStatePanel
      v-else-if="entries.length === 0"
      title="目前沒有更新紀錄"
      description="更新內容發布後會顯示在這裡。"
      icon="chart"
    />

    <ol
      v-else
      class="relative before:absolute before:bottom-2 before:left-3 before:top-3 before:w-0.5 before:rounded-full before:bg-primary/80 before:content-[''] sm:before:left-4"
    >
      <li
        v-for="entry in entries"
        :key="entry.version"
        class="relative z-10 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-4 pb-8 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-5"
      >
        <div class="relative flex justify-center">
          <span class="relative z-10 mt-1 h-4 w-4 rounded-full bg-primary shadow-sm ring-4 ring-primary-container dark:ring-primary-container/50"></span>
        </div>

        <article class="pb-1">
          <header class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <h3 class="text-lg font-bold leading-7 text-ink-950 dark:text-ink-50">
              {{ entry.title }}
            </h3>
            <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <span class="tag border-primary/30 bg-primary-container/70 text-on-primary-container dark:border-primary/40 dark:bg-primary-container/40 dark:text-primary">
                {{ entry.version }}
              </span>
              <time
                class="text-sm font-medium leading-7 text-ink-500 dark:text-ink-400 sm:text-right"
                :datetime="`${entry.date}T${entry.time}`"
              >
                {{ entry.date }} {{ entry.time }}
              </time>
            </div>
          </header>

          <ul class="mt-3 space-y-2">
            <li
              v-for="(item, itemIndex) in entry.items"
              :key="`${entry.version}-${itemIndex}`"
              class="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 text-ink-800 dark:text-ink-100"
            >
              <span class="mt-2.5 h-1.5 w-1.5 rounded-full bg-ink-500 dark:bg-ink-400" aria-hidden="true"></span>
              <p class="text-base font-semibold leading-7 text-ink-900 dark:text-ink-50">
                {{ item.title }}
              </p>
            </li>
          </ul>
        </article>
      </li>
    </ol>

    <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import { CHANGELOG_ENTRIES } from '@/constants/changelog';
import { useSession } from '@/composables/useSession';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import type { ChangelogEntry } from '@/types';

const sortedEntries = computed(() => [...CHANGELOG_ENTRIES].sort(compareChangelogEntries));
const displayLimit = ref(10);
const entries = computed(() => sortedEntries.value.slice(0, displayLimit.value));
const totalUpdates = computed(() => CHANGELOG_ENTRIES.length);
const { isAllowedUser } = useSession();

const hasMore = computed(() => displayLimit.value < sortedEntries.value.length);
const infiniteScrollDisabled = computed(() => !hasMore.value || !isAllowedUser.value);

function loadMore() {
  displayLimit.value += 15;
}

const { sentinel: loadMoreSentinel } = useInfiniteScroll({
  disabled: infiniteScrollDisabled,
  onLoadMore: loadMore,
});

function compareChangelogEntries(a: ChangelogEntry, b: ChangelogEntry) {
  const timeDifference = getEntryTime(b) - getEntryTime(a);
  if (timeDifference !== 0) return timeDifference;

  return getVersionNumber(b.version) - getVersionNumber(a.version);
}

// Keep other functions unchanged
function getEntryTime(entry: ChangelogEntry) {
  return Date.parse(`${entry.date}T${entry.time}:00`);
}

function getVersionNumber(version: string) {
  const segments = version.match(/\d+/g);
  if (!segments) return 0;

  return segments.reduce((value, segment) => value * 1000 + Number(segment), 0);
}
</script>
