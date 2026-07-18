<template>
  <div class="board-controls relative z-20 space-y-3">
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
          {{ activeFilter === 'my-proposals' ? t('issue.myProposal') : boardTitle }}
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
          <AppButton
            variant="toolbar"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
            :active="isSortOpen || sortOption !== 'latest'"
            :title="t('common.filterBoard', { board: boardTitle })"
            :aria-label="t('common.filterBoard', { board: boardTitle })"
            :aria-expanded="isSortOpen"
            @click="toggleSort"
          >
            <AppIcon name="sort" class="h-4 w-4" />
          </AppButton>

          <transition name="popover">
            <DropdownPanel
              v-if="isSortOpen"
              class="absolute z-[100] mt-2 max-md:left-0 max-md:right-0 max-md:w-auto md:right-0 md:left-auto md:w-max md:min-w-[10rem]"
              size="default"
            >
              <div class="dropdown-label mb-1.5 whitespace-nowrap">{{ t('common.sortBy') }}</div>
              <div class="space-y-0.5">
                <button
                  v-for="option in visibleSortOptions"
                  :key="option.value"
                  type="button"
                  class="dropdown-item justify-between gap-4 whitespace-nowrap"
                  :class="{ 'button-toolbar--active': option.value === sortOption }"
                  @click="selectSort(option.value)"
                >
                  <span>{{ t(option.label) }}</span>
                  <SelectionMark :selected="option.value === sortOption" />
                </button>
              </div>
            </DropdownPanel>
          </transition>
        </div>

        <div class="static md:relative" @click.stop @pointerdown.stop>
          <AppButton
            variant="toolbar"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 md:h-9 md:w-9"
            :active="Boolean(isSearchOpen || searchQuery)"
            :title="t('common.searchBoard', { board: boardTitle })"
            :aria-label="t('common.searchBoard', { board: boardTitle })"
            :aria-expanded="isSearchOpen"
            @click="toggleSearch"
          >
            <AppIcon name="search" class="h-4 w-4" />
          </AppButton>

          <transition name="popover">
            <DropdownPanel
              v-if="isSearchOpen"
              class="absolute z-[100] mt-2 max-md:left-0 max-md:right-0 max-md:w-auto md:right-0 md:left-auto md:w-80"
              size="search"
            >
              <form class="relative" role="search" @submit.prevent="emit('submitSearch')">
                <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
                <input
                  ref="searchInputRef"
                  :value="searchQuery"
                  type="search"
                  autocomplete="off"
                  :aria-label="t('common.searchBoard', { board: boardTitle })"
                  class="field appearance-none !h-8 !py-1 !pl-8 !pr-8 text-xs placeholder:text-ink-400 dark:placeholder:text-ink-500"
                  :placeholder="searchPlaceholder"
                  @input="(e) => emit('update:searchQuery', (e.target as HTMLInputElement).value)"
                />
                <AppButton
                  v-if="searchQuery"
                  variant="toolbar"
                  class="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full p-0"
                  :aria-label="t('common.clearSearch')"
                  @click="emit('clearSearch')"
                >
                  <AppIcon name="close" :size="3" />
                </AppButton>
              </form>
              <p
                v-if="searchHint"
                class="mt-2 text-xs font-normal leading-5 text-ink-500 dark:text-ink-400"
                aria-live="polite"
              >
                {{ searchHint }}
              </p>
            </DropdownPanel>
          </transition>
        </div>

        <AppButton
          v-if="createLabel"
          variant="contextual"
          class="h-8 w-8 min-w-8 shrink-0 p-0"
          :aria-label="createLabel"
          :title="createLabel"
          @click="$emit('create')"
        >
          <AppIcon name="plus" :size="4" :stroke-width="2.4" />
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IssueCategorySelector from '@/components/IssueCategorySelector.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import DropdownPanel from '@/components/ui/molecules/DropdownPanel.vue';
import PillSegmentedControl from '@/components/ui/molecules/PillSegmentedControl.vue';
import { DEFAULT_ISSUE_CATEGORY, isIssueCategory } from '@/constants/categories';
import { useClickOutside } from '@/composables/useClickOutside';
import type { FacilitySortOption, IssueFilter, IssueSortOption } from '@/types';
import { useI18n } from '@/i18n';

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
const { t } = useI18n();

const issueSortOptions = [
  { value: 'latest', label: 'common.upToDate' },
  { value: 'most-supported', label: 'common.mostSupported' },
  { value: 'ending-soon', label: 'common.endingSoon' },
] as const;

const route = useRoute();
const router = useRouter();
const facilitySortOptions = [
  { value: 'latest', label: 'common.upToDate' },
  { value: 'most-affected', label: 'common.mostPeopleEncountered' },
] as const;
const visibleSortOptions = computed(() => props.mode === 'facility'
  ? facilitySortOptions
  : props.statusTab === 'closed'
    ? issueSortOptions.filter((option) => option.value === 'latest')
    : issueSortOptions);

const boardTitle = computed(() => t(props.mode === 'facility' ? 'facility.facility' : 'issue.proposal'));
const searchPlaceholder = computed(() => t(props.mode === 'facility' ? 'common.searchForATitleOrLocation' : 'common.searchSiteWideTitles'));
const issueCategoryFilter = computed<IssueFilter>(() =>
  isIssueCategory(props.activeFilter) ? props.activeFilter : DEFAULT_ISSUE_CATEGORY
);
const statusOptions = computed(() => [
  { value: 'active' as const, label: t(props.mode === 'facility' ? 'facility.processing' : 'issue.inProgress'), icon: 'list' as const, title: t('common.showStatusInBoard', { status: t(props.mode === 'facility' ? 'facility.processing' : 'issue.inProgress'), board: boardTitle.value }) },
  { value: 'closed' as const, label: t('facility.caseClosed'), icon: 'inbox' as const, title: t('common.showStatusInBoard', { status: t('facility.caseClosed'), board: boardTitle.value }) },
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
