<template>
  <div
    class="app-root relative flex flex-col bg-[rgb(var(--color-page-background))]"
    :data-bottom-nav="isAllowedUser ? 'true' : 'false'"
    :style="rootStyle"
  >
    <div class="app-background-fill pointer-events-none absolute inset-0"></div>
    <div class="app-background-wash pointer-events-none absolute inset-x-0 top-0 h-80 dark:hidden"></div>

    <!-- Full-bleed Fixed Header -->
    <header class="app-header fixed inset-x-0 top-0 z-40 w-full backdrop-blur-md transition-colors duration-300 md:border-b md:border-ink-200/80 md:dark:border-ink-700/80">
      <div class="app-header__inner mx-auto max-w-7xl px-4 flex items-center justify-between sm:px-6 lg:px-8">
        <div class="flex items-center min-w-0">
          <h1 class="app-header__title text-ink-950 dark:text-ink-50 flex items-center shrink-0" :aria-label="mobileHeaderTitle">
            <span class="hidden md:inline-flex"><BrandMark /></span>
            <span class="text-[26px] font-bold tracking-tight md:hidden leading-none">{{ mobileHeaderTitle }}</span>
          </h1>

          <!-- Desktop Navigation -->
          <nav v-if="isAllowedUser" ref="navRef" aria-label="主要導覽" class="relative hidden md:flex items-center gap-6 ml-8">
            <!-- Sliding Underline Indicator -->
            <div
              class="absolute bottom-0 h-0.5 rounded-full bg-ink-900 dark:bg-ink-100 pointer-events-none"
              :style="[underlineStyle, { transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)' }]"
            ></div>

            <RouterLink
              v-for="item in navItems"
              :key="item.key"
              :ref="el => setNavElement(item.key, el)"
              :to="item.to"
              class="text-trigger relative flex h-16 items-center rounded-none px-1 text-sm font-medium tracking-normal"
              :class="[
                item.isActive
                  ? 'text-ink-950 dark:text-ink-50 font-semibold'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100'
              ]"
            >
              {{ item.label }}
            </RouterLink>
          </nav>
        </div>

        <div class="hidden items-center gap-3 md:flex">
          <NotificationBell v-if="isAllowedUser" />
          <SettingsPanel v-if="isAllowedUser" />
        </div>
      </div>
    </header>

    <!-- Main Content Container -->

    <!-- Main Content Container -->
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
      class="app-bottom-nav fixed left-4 right-4 z-40 mx-auto max-w-md border border-ink-200/80 bg-white/95 px-3 py-1.5 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/95 shadow-lg md:hidden"
      :style="{ bottom: `${bottomGap}px` }"
      aria-label="手機主要導覽"
    >
      <div ref="mobileNavRef" class="app-bottom-nav__inner mx-auto grid grid-cols-5 gap-1 relative">
        <!-- 行動版滑動背景膠囊 -->
        <div
          class="app-bottom-nav__indicator absolute bg-ink-100 dark:bg-ink-800/70 pointer-events-none"
          :style="[mobileIndicatorStyle, { transition: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)' }]"
        ></div>

        <RouterLink
          v-for="item in mobileRouteNavItems"
          :key="item.key"
          :ref="el => setMobileNavElement(item.key, el)"
          :to="item.to"
          class="app-bottom-nav__item"
          :class="{ 'app-bottom-nav__item--active': item.isActive }"
        >
          <span class="app-bottom-nav__icon" aria-hidden="true">
            <AppIcon :name="item.icon" :size="5" :stroke-width="1.9" />
          </span>
          <span class="app-bottom-nav__label">{{ item.label }}</span>
        </RouterLink>
        <RouterLink
          :ref="el => setMobileNavElement('notifications', el)"
          to="/notifications"
          class="app-bottom-nav__item"
          :class="{ 'app-bottom-nav__item--active': route.name === 'notifications' }"
        >
          <span class="app-bottom-nav__icon relative inline-flex" aria-hidden="true">
            <AppIcon name="bell" :size="5" :stroke-width="1.9" />
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
          :class="{ 'app-bottom-nav__item--active': ['settings', 'changelog', 'dashboard'].includes(route.name as string) }"
        >
          <span class="app-bottom-nav__icon" aria-hidden="true">
            <AppIcon name="settings" :size="5" :stroke-width="1.9" />
          </span>
          <span class="app-bottom-nav__label">設定</span>
        </RouterLink>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import SettingsPanel from '@/components/SettingsPanel.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { DEFAULT_ISSUE_ROUTE_FILTER } from '@/constants/categories';
import { useIssueRouteFilter } from '@/composables/useIssueRouteFilter';
import { useSession } from '@/composables/useSession';
import { useNotifications } from '@/composables/useNotifications';

const { isAllowedUser } = useSession();
const { activeFilter } = useIssueRouteFilter();
const { hasUnread } = useNotifications();
const route = useRoute();

const isIssueRouteActive = computed(() => route.name === 'issues' || route.name === 'issue-detail');
const isAnnouncementRouteActive = computed(() =>
  route.name === 'announcements' || route.name === 'announcement-detail'
);
const isMyProposalsRouteActive = computed(() => isIssueRouteActive.value && activeFilter.value === 'my-proposals');
const navItems = computed(() => {
  const items = [
    {
      isActive: isIssueRouteActive.value && activeFilter.value !== 'my-proposals',
      key: 'issues',
      label: '提案',
      to: { name: 'issues', params: { filter: DEFAULT_ISSUE_ROUTE_FILTER } },
    },
    {
      isActive: isAnnouncementRouteActive.value,
      key: 'announcements',
      label: '公告',
      to: { name: 'announcements' },
    },
    {
      isActive: isMyProposalsRouteActive.value,
      key: 'my-proposals',
      label: '我的提案',
      to: { name: 'issues', params: { filter: 'my-proposals' } },
    },
  ];
  return items;
});
const mobileRouteNavItems = computed(() => [
  {
    icon: 'comment' as const,
    isActive: navItems.value[0]?.isActive ?? false,
    key: 'issues',
    label: '提案',
    to: navItems.value[0]?.to,
  },
  {
    icon: 'megaphone' as const,
    isActive: navItems.value[1]?.isActive ?? false,
    key: 'announcements',
    label: '公告',
    to: navItems.value[1]?.to,
  },
  {
    icon: 'user' as const,
    isActive: navItems.value[2]?.isActive ?? false,
    key: 'my-proposals',
    label: '我的提案',
    to: navItems.value[2]?.to,
  },
]);
const mobileHeaderTitle = computed(() => {
  if (route.name === 'dashboard') return '統計';
  if (route.name === 'changelog') return '更新紀錄';
  if (route.name === 'notifications') return '通知';
  if (route.name === 'settings') return '設定';
  if (isAnnouncementRouteActive.value) return '公告';
  if (isMyProposalsRouteActive.value) return '我的提案';
  return '提案';
});

const navRef = ref<HTMLDivElement | null>(null);
const navElementRefs = ref<Record<string, HTMLElement | null>>({});
const mobileNavRef = ref<HTMLDivElement | null>(null);
const mobileNavElementRefs = ref<Record<string, HTMLElement | null>>({});
const mainContentRef = ref<HTMLDivElement | null>(null);

const hasSafeIndicator = ref(false);

const bottomGap = computed(() => (hasSafeIndicator.value ? 22 : 12));
const navBarHeight = 60; // 48px + 12px padding

const rootStyle = computed(() => {
  if (!isAllowedUser.value) return {};
  // 導覽列頂部距離螢幕底部的距離是 bottomGap + navBarHeight
  // 我們讓主要內容的 padding-bottom (即 --app-bottom-nav-height) 等於這個高度再多加 6px 的安全舒適邊距
  const height = bottomGap.value + navBarHeight + 6;
  return {
    '--app-bottom-nav-height': `${height}px`,
  };
});

const underlineStyle = ref({
  left: '0px',
  width: '0px',
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

function setNavElement(key: string, element: Element | { $el?: Element } | null) {
  navElementRefs.value[key] = resolveElement(element) as HTMLElement | null;
}

function setMobileNavElement(key: string, element: Element | { $el?: Element } | null) {
  mobileNavElementRefs.value[key] = resolveElement(element) as HTMLElement | null;
}

function activeNavKey() {
  if (isAnnouncementRouteActive.value) return 'announcements';
  if (isMyProposalsRouteActive.value) return 'my-proposals';
  if (route.name === 'dashboard') return 'dashboard';
  if (isIssueRouteActive.value) return 'issues';
  return '';
}

function activeMobileNavKey() {
  if (isAnnouncementRouteActive.value) return 'announcements';
  if (isMyProposalsRouteActive.value) return 'my-proposals';
  if (route.name === 'notifications') return 'notifications';
  if (['settings', 'changelog', 'dashboard'].includes(route.name as string)) return 'settings';
  if (isIssueRouteActive.value) return 'issues';
  return '';
}

function updateUnderline() {
  nextTick(() => {
    if (!isAllowedUser.value) return;
    const activeEl = navElementRefs.value[activeNavKey()];
    if (!activeEl || !navRef.value) {
      underlineStyle.value = {
        left: '0px',
        width: '0px',
      };
      return;
    }
    const navRect = navRef.value.getBoundingClientRect();
    const btnRect = activeEl.getBoundingClientRect();
    underlineStyle.value = {
      left: `${btnRect.left - navRect.left}px`,
      width: `${btnRect.width}px`,
    };
  });
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
    updateUnderline();
    updateMobileIndicator();
  },
  { immediate: true }
);

watch(
  () => route.fullPath,
  () => {
    nextTick(() => {
      mainContentRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

  window.addEventListener('resize', updateUnderline);
  window.addEventListener('resize', updateMobileIndicator);
  // Initial call with a tiny delay to ensure proper calculation
  setTimeout(updateUnderline, 100);
  setTimeout(updateMobileIndicator, 100);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateUnderline);
  window.removeEventListener('resize', updateMobileIndicator);
});

</script>
