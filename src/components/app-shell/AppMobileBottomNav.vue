<template>
  <nav
    class="app-bottom-nav viewport-floating-inline fixed z-40 mx-auto max-w-md rounded-full border-0 bg-surface/94 px-3 py-1.5 shadow-floating backdrop-blur-xl dark:bg-surface/94 md:hidden"
    :style="{ bottom: `${bottomGap}px` }"
    :aria-label="t('navigation.primaryNavigation')"
  >
    <div ref="navRef" class="app-bottom-nav__inner relative mx-auto grid grid-cols-5 gap-1">
      <div
        class="pointer-events-none absolute rounded-full bg-ink-100/90 shadow-control dark:bg-ink-800/80"
        :style="[indicatorStyle, { transition: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)' }]"
      ></div>

      <RouterLink
        v-for="item in items"
        :key="item.key"
        :ref="element => setNavElement(item.key, element)"
        :to="item.to"
        class="app-bottom-nav__item"
        :class="{ 'app-bottom-nav__item--active': item.isActive }"
        @click="$emit('navigate', item.isActive)"
      >
        <span class="app-bottom-nav__icon" aria-hidden="true">
          <AppIcon :name="item.icon" :size="4.5" :stroke-width="1.9" />
        </span>
        <span class="app-bottom-nav__label">{{ item.label }}</span>
      </RouterLink>

      <RouterLink
        :ref="element => setNavElement('notifications', element)"
        to="/notifications"
        class="app-bottom-nav__item"
        :class="{ 'app-bottom-nav__item--active': activeKey === 'notifications' }"
        :aria-label="t(hasUnread ? 'notification.notificationsUnread' : 'navigation.notify')"
        @click="$emit('navigate', activeKey === 'notifications')"
      >
        <span class="app-bottom-nav__icon relative" aria-hidden="true">
          <AppIcon name="bell" :size="4.5" :stroke-width="1.9" />
          <span v-if="hasUnread" class="app-bottom-nav__badge absolute h-2 w-2 rounded-full bg-error"></span>
        </span>
        <span class="app-bottom-nav__label">{{ t('navigation.notify') }}</span>
      </RouterLink>

      <RouterLink
        :ref="element => setNavElement('settings', element)"
        to="/settings"
        class="app-bottom-nav__item overflow-visible"
        :class="{ 'app-bottom-nav__item--active': profileActive }"
      >
        <span class="app-bottom-nav__icon overflow-hidden rounded-full" aria-hidden="true">
          <UserAvatar :photo-url="photoUrl" :name="userName" size="sm" :alt-text="t('settings.userAvatar')" class="!h-5 !w-5 rounded-full" />
        </span>
        <span class="app-bottom-nav__label">{{ t('settings.mine') }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import UserAvatar from '@/components/ui/atoms/UserAvatar.vue';
import type { AppNavigationItem } from './types';
import { useI18n } from '@/i18n';

const props = defineProps<{
  activeKey: string;
  bottomGap: number;
  hasUnread: boolean;
  items: AppNavigationItem[];
  photoUrl: string | null;
  profileActive: boolean;
  userName: string;
}>();
const { t } = useI18n();

defineEmits<{
  navigate: [isActive: boolean];
}>();

const navRef = ref<HTMLDivElement | null>(null);
const navElements = new Map<string, HTMLElement>();
const indicatorStyle = ref({ height: '0px', left: '0px', top: '0px', width: '0px' });

function resolveElement(element: Element | { $el?: Element } | null) {
  if (!element) return null;
  return '$el' in element ? element.$el ?? null : element;
}

function setNavElement(key: string, element: Element | { $el?: Element } | null) {
  const resolved = resolveElement(element);
  if (resolved instanceof HTMLElement) navElements.set(key, resolved);
  else navElements.delete(key);
}

async function updateIndicator() {
  await nextTick();
  const activeElement = navElements.get(props.activeKey);
  if (!activeElement || !navRef.value) {
    indicatorStyle.value = { height: '0px', left: '0px', top: '0px', width: '0px' };
    return;
  }
  const navRect = navRef.value.getBoundingClientRect();
  const itemRect = activeElement.getBoundingClientRect();
  indicatorStyle.value = {
    height: `${itemRect.height}px`,
    left: `${itemRect.left - navRect.left}px`,
    top: `${itemRect.top - navRect.top}px`,
    width: `${itemRect.width}px`,
  };
}

watch(() => props.activeKey, updateIndicator, { immediate: true });

onMounted(() => {
  window.addEventListener('resize', updateIndicator);
  window.setTimeout(updateIndicator, 100);
});

onBeforeUnmount(() => window.removeEventListener('resize', updateIndicator));
</script>
