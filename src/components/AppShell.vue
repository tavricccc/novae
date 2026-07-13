<template>
  <div
    class="app-root relative flex flex-col bg-[rgb(var(--color-page-background))]"
    :data-bottom-nav="isAllowedUser ? 'true' : 'false'"
    :style="rootStyle"
  >
    <div class="app-background-fill pointer-events-none absolute inset-0"></div>
    <div class="app-background-wash pointer-events-none absolute inset-x-0 top-0 h-80 dark:hidden"></div>

    <header class="app-header fixed inset-x-0 top-0 z-40 w-full backdrop-blur-md transition-colors duration-300 md:hidden">
      <div class="app-header__inner mx-auto flex max-w-7xl items-center px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <button
            v-if="showMobileBackButton"
            type="button"
            class="button-icon shrink-0 md:hidden"
            :aria-label="mobileBackLabel"
            :title="mobileBackLabel"
            @click="handleMobileBack"
          >
            <AppIcon name="chevron-left" :size="5" />
          </button>
          <h1 class="app-header__title flex h-10 min-w-0 shrink-0 items-center text-ink-950 dark:text-ink-50" :aria-label="mobileHeaderTitle">
            <span class="truncate text-2xl font-bold leading-none tracking-tight">{{ mobileHeaderTitle }}</span>
          </h1>
        </div>
      </div>
    </header>

    <aside
      v-if="isAllowedUser"
      class="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center border-r border-ink-200/80 bg-white/95 py-4 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/95 md:flex"
      aria-label="桌面主要導覽"
    >
      <RouterLink
        :to="{ name: 'issues', params: { filter: DEFAULT_ISSUE_ROUTE_FILTER } }"
        class="app-sidebar__brand"
        aria-label="Novae 提案首頁"
      >
        <BrandMark />
      </RouterLink>

      <nav class="mt-7 flex w-full flex-1 flex-col items-center gap-2 px-3" aria-label="主要功能">
        <RouterLink
          v-for="item in primaryRouteNavItems"
          :key="item.key"
          :to="item.to"
          class="app-sidebar__item"
          :class="{ 'app-sidebar__item--active': item.isActive }"
          :aria-label="item.label"
          :data-label="item.label"
          @click="handleNavigationClick(item.isActive)"
        >
          <AppIcon :name="item.icon" :size="5" :stroke-width="1.9" />
        </RouterLink>

        <CreateActionMenu
          :can-create-announcement="isAdmin"
          :default-category="defaultCreateCategory"
          :default-kind="defaultCreateKind"
          @create-announcement="handleCreateAnnouncement"
          @create-issue="handleCreateIssue"
        >
          <template #trigger="{ open }">
            <button
              type="button"
              class="app-sidebar__item"
              aria-label="新增"
              data-label="新增"
              @click="open"
            >
              <AppIcon name="plus" :size="5.5" :stroke-width="2.4" />
            </button>
          </template>
        </CreateActionMenu>

        <RouterLink
          to="/notifications"
          class="app-sidebar__item"
          :class="{ 'app-sidebar__item--active': route.name === 'notifications' }"
          :aria-label="hasUnread ? '通知，有新通知' : '通知'"
          data-label="通知"
        >
          <span class="relative inline-flex" aria-hidden="true">
            <AppIcon name="bell" :size="5" :stroke-width="1.9" />
            <span v-if="hasUnread" class="app-sidebar__badge"></span>
          </span>
        </RouterLink>

        <RouterLink
          to="/settings"
          class="app-sidebar__item overflow-visible"
          :class="{ 'app-sidebar__item--active': isMyProposalsRouteActive || ['settings', 'dashboard'].includes(route.name as string) }"
          aria-label="我的"
          data-label="我的"
        >
          <UserAvatar :photo-url="displayPhotoUrl" :name="user?.displayName || 'U'" size="sm" alt-text="使用者頭像" class="!h-6 !w-6 rounded-full" />
        </RouterLink>
      </nav>
    </aside>

    <div
      ref="mainContentRef"
      class="app-main-content relative mx-auto flex w-full flex-1 flex-col overflow-y-auto overscroll-contain px-4 sm:px-6 lg:px-8"
    >
      <main class="min-h-0 flex-1">
        <slot />
      </main>
    </div>

    <nav
      v-if="isAllowedUser"
      class="app-bottom-nav fixed left-4 right-4 z-40 mx-auto max-w-md border border-ink-200/80 bg-white/95 px-3 py-1.5 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/95 shadow-lg rounded-full md:hidden"
      :style="{ bottom: `${bottomGap}px` }"
      aria-label="手機主要導覽"
    >
      <div ref="mobileNavRef" class="app-bottom-nav__inner mx-auto grid grid-cols-5 gap-1 relative">
        <!-- 行動版滑動背景膠囊 -->
        <div
          class="absolute rounded-full bg-ink-100 dark:bg-ink-800/70 pointer-events-none"
          :style="[mobileIndicatorStyle, { transition: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)' }]"
        ></div>

        <RouterLink
          v-for="item in primaryRouteNavItems"
          :key="item.key"
          :ref="el => setMobileNavElement(item.key, el)"
          :to="item.to"
          class="app-bottom-nav__item"
          :class="{ 'app-bottom-nav__item--active': item.isActive }"
          @click="handleNavigationClick(item.isActive)"
        >
          <span class="app-bottom-nav__icon" aria-hidden="true">
            <AppIcon :name="item.icon" :size="4.5" :stroke-width="1.9" />
          </span>
          <span class="app-bottom-nav__label">{{ item.label }}</span>
        </RouterLink>
        <CreateActionMenu
          :can-create-announcement="isAdmin"
          :default-category="defaultCreateCategory"
          :default-kind="defaultCreateKind"
          @create-announcement="handleCreateAnnouncement"
          @create-issue="handleCreateIssue"
        >
          <template #trigger="{ open }">
            <button
              :ref="el => setMobileNavElement('create', el)"
              type="button"
              class="app-bottom-nav__item"
              title="新增"
              aria-label="新增"
              @click="open"
            >
              <span class="app-bottom-nav__icon" aria-hidden="true">
                <AppIcon name="plus" :size="5" :stroke-width="2.4" />
              </span>
            </button>
          </template>
        </CreateActionMenu>
        <RouterLink
          :ref="el => setMobileNavElement('notifications', el)"
          to="/notifications"
          class="app-bottom-nav__item"
          :class="{ 'app-bottom-nav__item--active': route.name === 'notifications' }"
        >
          <span class="app-bottom-nav__icon relative inline-flex" aria-hidden="true">
            <AppIcon name="bell" :size="4.5" :stroke-width="1.9" />
            <span
              v-if="hasUnread"
              class="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-error dark:border-ink-900 app-bottom-nav__badge"
              aria-label="有新通知"
            ></span>
          </span>
          <span class="app-bottom-nav__label">通知</span>
        </RouterLink>
        <RouterLink
          :ref="el => setMobileNavElement('settings', el)"
          to="/settings"
          class="app-bottom-nav__item overflow-visible"
          :class="{ 'app-bottom-nav__item--active': isMyProposalsRouteActive || ['settings', 'dashboard'].includes(route.name as string) }"
        >
          <span class="app-bottom-nav__icon overflow-hidden rounded-full" aria-hidden="true">
            <UserAvatar :photo-url="displayPhotoUrl" :name="user?.displayName || 'U'" size="sm" alt-text="使用者頭像" class="!h-5 !w-5 rounded-full" />
          </span>
          <span class="app-bottom-nav__label">我的</span>
        </RouterLink>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import CreateActionMenu from '@/components/CreateActionMenu.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { DEFAULT_ISSUE_CATEGORY, DEFAULT_ISSUE_ROUTE_FILTER, isIssueCategory } from '@/constants/categories';
import { requestCreateAnnouncement, requestCreateIssue } from '@/composables/useCreateEntryActions';
import { refreshFromActiveNavigation } from '@/composables/useActiveNavigationRefresh';
import { useIssueRouteFilter } from '@/composables/useIssueRouteFilter';
import { useSession } from '@/composables/useSession';
import { useNotificationBadge } from '@/composables/useNotificationBadge';
import type { IssueCategory } from '@/types';

const { customPhotoUrl, isAdmin, isAllowedUser, user } = useSession();
const { activeFilter } = useIssueRouteFilter();
const { hasUnread } = useNotificationBadge();
const route = useRoute();
const router = useRouter();

const isIssueRouteActive = computed(() => route.name === 'issues' || route.name === 'issue-detail');
const isAnnouncementRouteActive = computed(() =>
  route.name === 'announcements' || route.name === 'announcement-detail'
);
const isMyProposalsRouteActive = computed(() => isIssueRouteActive.value && activeFilter.value === 'my-proposals');
const primaryRouteNavItems = computed(() => [
  {
    icon: 'comment' as const,
    isActive: isIssueRouteActive.value && activeFilter.value !== 'my-proposals',
    key: 'issues',
    label: '提案',
    to: { name: 'issues', params: { filter: DEFAULT_ISSUE_ROUTE_FILTER } },
  },
  {
    icon: 'megaphone' as const,
    isActive: isAnnouncementRouteActive.value,
    key: 'announcements',
    label: '公告',
    to: { name: 'announcements' },
  },
]);
const displayPhotoUrl = computed(() => customPhotoUrl.value || user.value?.photoURL || null);
const defaultCreateCategory = computed<IssueCategory>(() =>
  isIssueCategory(activeFilter.value) ? activeFilter.value : DEFAULT_ISSUE_CATEGORY
);
const defaultCreateKind = computed(() => isAnnouncementRouteActive.value ? 'announcement' : 'issue');
const mobileHeaderTitle = computed(() => {
  if (route.name === 'issue-detail') return isMyProposalsRouteActive.value ? '我的提案' : '提案內容';
  if (route.name === 'announcement-detail') return '公告內容';
  if (route.name === 'dashboard') return '統計';
  if (route.name === 'notifications') return '通知';
  if (route.name === 'settings') return '我的';
  if (isAnnouncementRouteActive.value) return '公告';
  if (isMyProposalsRouteActive.value) return '我的提案';
  return '提案';
});
const showMobileBackButton = computed(() =>
  route.name === 'issue-detail'
  || route.name === 'announcement-detail'
  || route.name === 'dashboard'
  || isMyProposalsRouteActive.value
);
const mobileBackLabel = computed(() => {
  if (route.name === 'dashboard') return '返回我的';
  if (route.name === 'issue-detail' && isMyProposalsRouteActive.value) return '返回我的提案';
  if (isMyProposalsRouteActive.value) return '返回我的';
  if (route.name === 'announcement-detail') return '返回公告列表';
  return '返回提案列表';
});

const mobileNavRef = ref<HTMLDivElement | null>(null);
const mobileNavElementRefs = ref<Record<string, HTMLElement | null>>({});
const mainContentRef = ref<HTMLDivElement | null>(null);

const hasSafeIndicator = ref(false);

const bottomGap = computed(() => (hasSafeIndicator.value ? 22 : 12));
const navBarHeight = 60; // 48px + 12px padding
const mainScrollPositions = new Map<string, number>();

const rootStyle = computed(() => {
  if (!isAllowedUser.value) return {};
  // 導覽列頂部距離螢幕底部的距離是 bottomGap + navBarHeight
  // 我們讓主要內容的 padding-bottom (即 --app-bottom-nav-height) 等於這個高度再多加 6px 的安全舒適邊距
  const height = bottomGap.value + navBarHeight + 6;
  return {
    '--app-bottom-nav-height': `${height}px`,
  };
});

const mobileIndicatorStyle = ref({
  left: '0px',
  width: '0px',
  height: '0px',
  top: '0px',
});

function resolveElement(element: Element | { $el?: Element } | null) {
  if (!element) return null;
  return '$el' in element ? element.$el ?? null : element;
}

function setMobileNavElement(key: string, element: Element | { $el?: Element } | null) {
  mobileNavElementRefs.value[key] = resolveElement(element) as HTMLElement | null;
}

function activeMobileNavKey() {
  if (isAnnouncementRouteActive.value) return 'announcements';
  if (isMyProposalsRouteActive.value) return 'settings';
  if (route.name === 'notifications') return 'notifications';
  if (['settings', 'dashboard'].includes(route.name as string)) return 'settings';
  if (isIssueRouteActive.value) return 'issues';
  return '';
}

async function handleCreateIssue(category: IssueCategory) {
  await requestCreateIssue(router, category);
}

async function handleCreateAnnouncement() {
  await requestCreateAnnouncement(router);
}

function handleNavigationClick(isActive: boolean) {
  if (isActive) void refreshFromActiveNavigation();
}

async function handleMobileBack() {
  if (route.name === 'announcement-detail') {
    await router.push({ name: 'announcements' });
    return;
  }
  if (route.name === 'issue-detail') {
    const query = { ...route.query };
    delete query.tab;
    delete query.comment;
    await router.push({
      name: 'issues',
      params: { filter: activeFilter.value },
      query,
    });
    return;
  }
  if (isMyProposalsRouteActive.value) {
    await router.push({ name: 'settings' });
    return;
  }
  if (route.name === 'dashboard') {
    await router.push({ name: 'settings' });
  }
}

function updateMobileIndicator() {
  nextTick(() => {
    if (!isAllowedUser.value) return;
    const activeEl = mobileNavElementRefs.value[activeMobileNavKey()];
    if (!activeEl || !mobileNavRef.value) {
      mobileIndicatorStyle.value = {
        left: '0px',
        width: '0px',
        height: '0px',
        top: '0px',
      };
      return;
    }
    const navRect = mobileNavRef.value.getBoundingClientRect();
    const btnRect = activeEl.getBoundingClientRect();
    mobileIndicatorStyle.value = {
      left: `${btnRect.left - navRect.left}px`,
      width: `${btnRect.width}px`,
      height: `${btnRect.height}px`,
      top: `${btnRect.top - navRect.top}px`,
    };
  });
}

watch(
  [activeFilter, isAllowedUser, () => route.name],
  () => {
    updateMobileIndicator();
  },
  { immediate: true }
);

watch(
  () => route.fullPath,
  (newPath, oldPath) => {
    if (oldPath && mainContentRef.value) {
      mainScrollPositions.set(oldPath, mainContentRef.value.scrollTop);
      if (mainScrollPositions.size > 30) {
        const oldestPath = mainScrollPositions.keys().next().value;
        if (oldestPath) mainScrollPositions.delete(oldestPath);
      }
    }
    nextTick(() => {
      mainContentRef.value?.scrollTo({
        top: mainScrollPositions.get(newPath) ?? 0,
        left: 0,
        behavior: 'auto',
      });
    });
  }
);

onMounted(() => {
  // 偵測全面屏 safe area
  const div = document.createElement('div');
  div.style.paddingBottom = 'env(safe-area-inset-bottom)';
  div.style.position = 'fixed';
  div.style.visibility = 'hidden';
  document.body.appendChild(div);
  const pb = parseFloat(window.getComputedStyle(div).paddingBottom);
  document.body.removeChild(div);
  if (pb > 0) {
    hasSafeIndicator.value = true;
  }

  window.addEventListener('resize', updateMobileIndicator);
  setTimeout(updateMobileIndicator, 100);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileIndicator);
});

</script>
