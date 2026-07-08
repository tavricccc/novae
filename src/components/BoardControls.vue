<template>
  <div class="relative z-20 space-y-3">
    <div class="flex flex-row items-center justify-between gap-3 md:mt-0">
      <div class="hidden min-w-0 flex-row items-center gap-3 sm:gap-4 md:flex md:gap-6">
        <h2 class="shrink-0 text-xl font-bold tracking-tight text-ink-950 dark:text-ink-50 md:text-2xl">提案</h2>

        <!-- 桌機版分類 Dropdown -->
        <div v-if="activeFilter !== 'my-proposals'" class="relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar flex items-center gap-1.5 h-9 px-3 rounded-full shrink-0 text-sm font-semibold"
            :class="{ 'button-toolbar--active': isCategoryOpen }"
            title="選擇分類"
            aria-label="選擇分類"
            :aria-expanded="isCategoryOpen"
            @click="toggleCategory"
          >
            <span class="text-sm font-semibold leading-none">{{ activeCategoryLabel }}</span>
            <span class="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">keyboard_arrow_down</span>
          </button>

          <transition name="popover">
            <div
              v-if="isCategoryOpen"
              class="absolute z-[100] mt-2 left-0 right-auto w-max min-w-[10rem] rounded-2xl border border-ink-200/80 bg-white p-3 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
            >
              <div class="px-2 pb-1.5 text-xs font-semibold text-ink-400 dark:text-ink-50 tracking-wider uppercase whitespace-nowrap">
                提案分類
              </div>
              <div class="space-y-0.5">
                <button
                  v-for="option in categoryOptions"
                  :key="option.value"
                  type="button"
                  class="menu-item justify-between gap-4 whitespace-nowrap"
                  :class="{ 'button-toolbar--active': option.value === activeFilter }"
                  @click="handleCategoryChangeInPopover(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="option.value === activeFilter" class="text-xs">✓</span>
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <div class="flex shrink-0 flex-row items-center justify-end gap-1.5 sm:gap-2 w-full md:w-auto">
        <!-- 行動版分類 Dropdown -->
        <div v-if="activeFilter !== 'my-proposals'" class="static mr-auto md:hidden" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar flex items-center gap-1.5 h-10 px-3 rounded-full shrink-0 text-sm font-semibold"
            :class="{ 'button-toolbar--active': isCategoryOpen }"
            title="選擇分類"
            aria-label="選擇分類"
            :aria-expanded="isCategoryOpen"
            @click="toggleCategory"
          >
            <span class="text-sm font-semibold leading-none">{{ activeCategoryLabel }}</span>
            <span class="material-symbols-outlined text-[18px] leading-none" aria-hidden="true">keyboard_arrow_down</span>
          </button>

          <transition name="popover">
            <div
              v-if="isCategoryOpen"
              class="absolute z-[100] mt-2 left-4 right-4 w-auto rounded-2xl border border-ink-200/80 bg-white p-3 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
            >
              <div class="px-2 pb-1.5 text-xs font-semibold text-ink-400 dark:text-ink-50 tracking-wider uppercase">
                提案分類
              </div>
              <div class="space-y-0.5">
                <button
                  v-for="option in categoryOptions"
                  :key="option.value"
                  type="button"
                  class="menu-item justify-between"
                  :class="{ 'button-toolbar--active': option.value === activeFilter }"
                  @click="handleCategoryChangeInPopover(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="option.value === activeFilter" class="text-xs">✓</span>
                </button>
              </div>
            </div>
          </transition>
        </div>

        <!-- 狀態分段切換器 (Segmented Control) -->
        <div
          v-if="activeFilter !== 'my-proposals'"
          class="inline-flex h-10 items-center rounded-full bg-ink-100/80 p-1 dark:bg-ink-800/80 md:h-9 shrink-0 gap-0.5"
        >
          <button
            type="button"
            class="flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-200 select-none"
            :class="statusTab === 'active'
              ? 'bg-white text-ink-950 shadow-sm dark:bg-ink-900 dark:text-ink-50'
              : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'"
            title="查看進行中提案"
            aria-label="查看進行中提案"
            @click="statusTab !== 'active' && toggleStatusTab()"
          >
            <AppIcon name="list" :size="3.5" />
            <span v-if="statusTab === 'active'">進行中</span>
          </button>
          <button
            type="button"
            class="flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-200 select-none"
            :class="statusTab === 'closed'
              ? 'bg-white text-ink-950 shadow-sm dark:bg-ink-900 dark:text-ink-50'
              : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'"
            title="查看已結案提案"
            aria-label="查看已結案提案"
            @click="statusTab !== 'closed' && toggleStatusTab()"
          >
            <AppIcon name="inbox" :size="3.5" />
            <span v-if="statusTab === 'closed'">已結案</span>
          </button>
        </div>

        <!-- 排序（圓形 sort 圖示按鈕） -->
        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar h-10 w-10 rounded-full p-0 md:h-9 md:w-9 flex items-center justify-center shrink-0"
            :class="{ 'button-toolbar--active': isSortOpen || sortOption !== 'latest' }"
            title="排序提案"
            aria-label="排序提案"
            :aria-expanded="isSortOpen"
            @click="toggleSort"
          >
            <AppIcon name="sort" class="h-4 w-4" />
          </button>

          <transition name="popover">
            <div
              v-if="isSortOpen"
              class="absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-max md:min-w-[10rem] rounded-2xl border border-ink-200/80 bg-white p-3 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
            >
              <div>
                <div class="mb-1.5 px-2 text-xs font-semibold text-ink-400 dark:text-ink-50 tracking-wider uppercase whitespace-nowrap">
                  排序方式
                </div>
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
                    <span v-if="option.value === sortOption" class="text-xs">✓</span>
                  </button>
                </div>
              </div>
            </div>
          </transition>
        </div>

        <!-- 搜尋按鈕 -->
        <div class="static md:relative" @click.stop @pointerdown.stop>
          <button
            type="button"
            class="button-toolbar h-10 w-10 rounded-full p-0 md:h-9 md:w-9 flex items-center justify-center shrink-0"
            :class="{ 'button-toolbar--active': isSearchOpen || searchQuery }"
            title="搜尋提案"
            aria-label="搜尋提案"
            :aria-expanded="isSearchOpen"
            @click="toggleSearch"
          >
            <AppIcon name="search" class="h-4 w-4" />
          </button>

          <transition name="popover">
            <div
              v-if="isSearchOpen"
              class="absolute z-[100] mt-2 max-md:left-4 max-md:right-4 max-md:w-auto md:right-0 md:left-auto md:w-80 rounded-2xl border border-ink-200/80 bg-white p-3 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
            >
              <div class="relative">
                <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
                <input
                  ref="searchInputRef"
                  :value="searchQuery"
                  type="search"
                  autocomplete="off"
                  aria-label="搜尋提案標題"
                  class="field appearance-none !h-10 !py-1.5 !pl-9 !pr-9 text-sm placeholder:text-ink-400 dark:placeholder:text-ink-500"
                  placeholder="搜尋全站標題..."
                  @input="(e) => emit('update:searchQuery', (e.target as HTMLInputElement).value)"
                />
                <button
                  v-if="searchQuery"
                  type="button"
                  class="button-toolbar absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full p-0"
                  aria-label="清除搜尋"
                  @click="emit('update:searchQuery', '')"
                >
                  <AppIcon name="close" :size="3" />
                </button>
              </div>
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/ui/AppIcon.vue';
import { ISSUE_FILTER_OPTIONS } from '@/constants/categories';
import type { IssueSortOption } from '@/types';

const props = defineProps<{
  statusTab: 'active' | 'closed';
  searchQuery: string;
  searchHint: string;
  activeFilter: string;
  activeCategoryLabel: string;
  sortOption: IssueSortOption;
}>();

const emit = defineEmits<{
  'update:statusTab': [value: 'active' | 'closed'];
  'update:searchQuery': [value: string];
  'update:sortOption': [value: IssueSortOption];
}>();

const issueSortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'most-supported', label: '最多附議' },
  { value: 'ending-soon', label: '即將截止' },
] as const;

const router = useRouter();
const visibleSortOptions = computed(() =>
  props.statusTab === 'closed'
    ? issueSortOptions.filter((option) => option.value === 'latest')
    : issueSortOptions
);

const categoryOptions = ISSUE_FILTER_OPTIONS;
const isSearchOpen = ref(false);
const isSortOpen = ref(false);
const isCategoryOpen = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

function closeFloatingPanels() {
  isSearchOpen.value = false;
  isSortOpen.value = false;
  isCategoryOpen.value = false;
}

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value;
  isSortOpen.value = false;
  isCategoryOpen.value = false;
  if (isSearchOpen.value) {
    nextTick(() => searchInputRef.value?.focus());
  }
}

function toggleSort() {
  isSortOpen.value = !isSortOpen.value;
  isCategoryOpen.value = false;
  isSearchOpen.value = false;
}

function toggleCategory() {
  isCategoryOpen.value = !isCategoryOpen.value;
  isSortOpen.value = false;
  isSearchOpen.value = false;
}

function selectSort(value: IssueSortOption) {
  emit('update:sortOption', value);
}

function toggleStatusTab() {
  emit('update:statusTab', props.statusTab === 'active' ? 'closed' : 'active');
}

async function handleCategoryChange(value: string) {
  if (value === props.activeFilter) return;
  await router.push({
    name: 'issues',
    params: { filter: value },
  });
}

async function handleCategoryChangeInPopover(value: string) {
  isCategoryOpen.value = false;
  await handleCategoryChange(value);
}

watch([isSearchOpen, isSortOpen, isCategoryOpen], ([searchOpen, sortOpen, categoryOpen]) => {
  if (searchOpen || sortOpen || categoryOpen) {
    window.addEventListener('click', closeFloatingPanels);
    return;
  }
  window.removeEventListener('click', closeFloatingPanels);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeFloatingPanels);
});
</script>
