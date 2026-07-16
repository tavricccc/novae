<template>
  <div class="relative z-20 space-y-3">
    <div class="flex flex-row items-center justify-between gap-3 md:mt-0">
      <div class="hidden min-w-0 flex-row items-center gap-3 sm:gap-4 md:flex md:gap-6">
        <IssueCategorySelector
          v-if="mode !== 'facility' && activeFilter !== 'my-proposals'"
          :active-filter="issueCategoryFilter"
          :label="activeCategoryLabel"
          variant="desktop-heading"
          @select="handleCategoryChange"
        />
        <h2 v-else class="shrink-0 text-xl font-semibold tracking-[0.015em] text-ink-950 dark:text-ink-50 md:text-2xl">
          {{ activeFilter === 'my-proposals' ? '我的提案' : boardTitle }}
        </h2>
      </div>

      <div class="flex w-full shrink-0 flex-row items-center justify-end gap-1.5 sm:gap-2 md:w-auto">
        <PillSegmentedControl
          v-if="mode === 'facility' || activeFilter !== 'my-proposals'"
          v-model="statusTabModel"
          :options="statusOptions"
          class="shrink-0"
        />

        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
            :class="{ 'button-toolbar--active': isSortOpen || sortOption !== 'latest' }"
            :title="`排序${boardTitle}`"
            :aria-label="`排序${boardTitle}`"
            :aria-expanded="isSortOpen"
            @click="toggleSort"
          >
            <AppIcon name="sort" class="h-4 w-4" />
          </button>

          <transition name="popover">
            <div
              v-if="isSortOpen"
              class="popover-panel popover-panel--section absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-max md:min-w-[10rem]"
            >
              <div class="popover-section-label mb-1.5 whitespace-nowrap">排序方式</div>
              <div class="space-y-0.5">
                <button
                  v-for="option in visibleSortOptions"
                  :key="option.value"
                  type="button"
                  class="menu-item justify-between gap-4 whitespace-nowrap"
                  :class="{ 'button-toolbar--active': option.value === sortOption }"
                  @click="selectSort(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <SelectionMark :selected="option.value === sortOption" />
                </button>
              </div>
            </div>
          </transition>
        </div>

        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
            :class="{ 'button-toolbar--active': isSearchOpen || searchQuery }"
            :title="`搜尋${boardTitle}`"
            :aria-label="`搜尋${boardTitle}`"
            :aria-expanded="isSearchOpen"
            @click="toggleSearch"
          >
            <AppIcon name="search" class="h-4 w-4" />
          </button>

          <transition name="popover">
            <div
              v-if="isSearchOpen"
              class="popover-panel popover-panel--search absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-80"
            >
              <form class="relative" role="search" @submit.prevent="emit('submitSearch')">
                <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
                <input
                  ref="searchInputRef"
                  :value="searchQuery"
                  type="search"
                  autocomplete="off"
                  :aria-label="`搜尋${boardTitle}標題`"
                  class="field appearance-none !h-8 !py-1 !pl-8 !pr-8 text-xs placeholder:text-ink-400 dark:placeholder:text-ink-500"
                  :placeholder="searchPlaceholder"
                  @input="(e) => emit('update:searchQuery', (e.target as HTMLInputElement).value)"
                />
                <button
                  v-if="searchQuery"
                  type="button"
                  class="button-toolbar absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full p-0"
                  aria-label="清除搜尋"
                  @click="emit('clearSearch')"
                >
                  <AppIcon name="close" :size="3" />
                </button>
              </form>
              <p
                v-if="searchHint"
                class="mt-2 text-xs font-normal leading-5 text-ink-500 dark:text-ink-400"
                aria-live="polite"
              >
                {{ searchHint }}
              </p>
            </div>
          </transition>
        </div>

        <button
          v-if="createLabel"
          type="button"
          class="button-contextual min-w-0 max-w-[9.5rem] shrink px-3 text-xs md:max-w-none"
          :aria-label="createLabel"
          :title="createLabel"
          @click="$emit('create')"
        >
          <AppIcon name="plus" :size="4" :stroke-width="2.4" />
          <span class="truncate">{{ createLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IssueCategorySelector from '@/components/IssueCategorySelector.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import PillSegmentedControl from '@/components/ui/PillSegmentedControl.vue';
import { DEFAULT_ISSUE_CATEGORY, isIssueCategory } from '@/constants/categories';
import { useClickOutside } from '@/composables/useClickOutside';
import type { FacilitySortOption, IssueFilter, IssueSortOption } from '@/types';

type BoardSortOption = IssueSortOption | FacilitySortOption;

const props = defineProps<{
  mode?: 'issue' | 'facility';
  statusTab: 'active' | 'closed';
  searchQuery: string;
  searchHint: string;
  activeFilter: string;
  activeCategoryLabel: string;
  createLabel?: string;
  sortOption: BoardSortOption;
}>();

const emit = defineEmits<{
  'update:statusTab': [value: 'active' | 'closed'];
  'update:searchQuery': [value: string];
  'update:sortOption': [value: BoardSortOption];
  'submitSearch': [];
  'clearSearch': [];
  create: [];
}>();

const issueSortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'most-supported', label: '最多附議' },
  { value: 'ending-soon', label: '即將截止' },
] as const;

const route = useRoute();
const router = useRouter();
const facilitySortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'most-affected', label: '最多人遇到' },
] as const;
const visibleSortOptions = computed(() => props.mode === 'facility'
  ? facilitySortOptions
  : props.statusTab === 'closed'
    ? issueSortOptions.filter((option) => option.value === 'latest')
    : issueSortOptions);

const boardTitle = computed(() => props.mode === 'facility' ? '設備' : '提案');
const searchPlaceholder = computed(() => props.mode === 'facility' ? '搜尋標題或地點...' : '搜尋全站標題...');
const issueCategoryFilter = computed<IssueFilter>(() =>
  isIssueCategory(props.activeFilter) ? props.activeFilter : DEFAULT_ISSUE_CATEGORY
);
const statusOptions = computed(() => [
  { value: 'active' as const, label: props.mode === 'facility' ? '處理中' : '進行中', icon: 'list' as const, title: `查看${props.mode === 'facility' ? '處理中設備' : '進行中提案'}` },
  { value: 'closed' as const, label: '已結案', icon: 'inbox' as const, title: `查看已結案${boardTitle.value}` },
]);
const isSearchOpen = ref(false);
const isSortOpen = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);
const anyPanelOpen = computed(() => isSearchOpen.value || isSortOpen.value);

function closeFloatingPanels() {
  isSearchOpen.value = false;
  isSortOpen.value = false;
}

useClickOutside(anyPanelOpen, [], closeFloatingPanels);

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value;
  isSortOpen.value = false;
  if (isSearchOpen.value) {
    nextTick(() => searchInputRef.value?.focus());
  }
}

function toggleSort() {
  isSortOpen.value = !isSortOpen.value;
  isSearchOpen.value = false;
}

function selectSort(value: BoardSortOption) {
  emit('update:sortOption', value);
}

const statusTabModel = computed({
  get: () => props.statusTab,
  set: (value: 'active' | 'closed') => emit('update:statusTab', value),
});

async function handleCategoryChange(value: IssueFilter) {
  if (value === props.activeFilter) return;
  await router.push({
    name: 'issues',
    params: { filter: value },
    query: route.query,
  });
}
</script>
