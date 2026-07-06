<template>
  <svg
    class="text-current"
    :class="sizeClass"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'chart'">
      <path d="M3.75 19.5h16.5" />
      <path d="M6 16.5V9" />
      <path d="M12 16.5v-12" />
      <path d="M18 16.5v-6" />
    </template>
    <template v-else-if="name === 'comment'">
      <path d="M12 20l-3-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2l-3 3" />
      <path v-if="detail" d="M8 9h8" />
      <path v-if="detail" d="M8 13h6" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 18 18 6" />
      <path d="m6 6 12 12" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </template>
    <template v-else-if="name === 'image'">
      <path d="m4 16 4.6-4.6a2 2 0 0 1 2.8 0L16 16" />
      <path d="m14 14 1.6-1.6a2 2 0 0 1 2.8 0L20 14" />
      <path d="M14 8h.01" />
      <path d="M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
    </template>
    <template v-else-if="name === 'lock'">
      <path d="M16.5 10.5V6.75a4.5 4.5 0 0 0-9 0v3.75" />
      <path d="M6.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </template>
    <template v-else-if="name === 'send'">
      <path d="M10 14 21 3" />
      <path d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3Z" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </template>
    <template v-else-if="name === 'inbox'">
      <path d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.008 1.24l.885 1.77a2.25 2.25 0 0 0 2.007 1.24h1.98a2.25 2.25 0 0 0 2.007-1.24l.885-1.77a2.25 2.25 0 0 1 2.007-1.24h3.86m-18 0h18M2.25 13.5l.697-3.486A2.25 2.25 0 0 1 5.162 8h13.676a2.25 2.25 0 0 1 2.215 2.014l.697 3.486M2.25 13.5V19.5a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25V13.5m-10.5-6h3m-3 3h3" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.3 6.8L4 9" />
      <path d="M5.8 15A7 7 0 0 0 17.7 17.2L20 15" />
    </template>
    <template v-else-if="name === 'reply'">
      <path d="M9 7 4 12l5 5" />
      <path d="M5 12h8.5a5.5 5.5 0 0 1 5.5 5.5V18" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </template>
    <template v-else-if="name === 'sort'">
      <path d="M4 7h11" />
      <path d="M4 12h8" />
      <path d="M4 17h5" />
      <path d="m17 14 3 3 3-3" />
      <path d="M20 7v10" />
    </template>
    <template v-else-if="name === 'megaphone'">
      <path d="M4.5 14.25v-4.5" />
      <path d="M4.5 10.75 15.75 6.5v11L4.5 13.25" />
      <path d="M15.75 9.5h2.5a1.25 1.25 0 0 1 1.25 1.25v2.5a1.25 1.25 0 0 1-1.25 1.25h-2.5" />
      <path d="m7.25 14.1 1.35 3.4a.75.75 0 0 0 .7.5h1.95" />
    </template>
    <template v-else-if="name === 'user'">
      <path d="M12 12a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      <path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M12 3.75v2.1" />
      <path d="m18.54 6.46-1.48 1.48" />
      <path d="M20.25 12h-2.1" />
      <path d="m18.54 17.54-1.48-1.48" />
      <path d="M12 20.25v-2.1" />
      <path d="m6.94 16.06-1.48 1.48" />
      <path d="M5.85 12h-2.1" />
      <path d="m6.94 7.94-1.48-1.48" />
      <circle cx="12" cy="12" r="3.25" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 6 6 6-6 6" />
    </template>
    <template v-else-if="name === 'switch-horizontal'">
      <path d="M16 5h3v3" />
      <path d="M8 19H5v-3" />
      <path d="M19 8a7 7 0 0 0-12-2.5L5 8" />
      <path d="M5 16a7 7 0 0 0 12 2.5L19 16" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 4.5v10" />
      <path d="m8.5 11 3.5 3.5 3.5-3.5" />
      <path d="M5 18.5h14" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10 13.5 14 9.5" />
      <path d="M7.5 15.5 6 17a3 3 0 1 0 4.24 4.24l1.5-1.5" />
      <path d="M16.5 8.5 18 7a3 3 0 1 0-4.24-4.24l-1.5 1.5" />
    </template>
    <template v-else-if="name === 'h1'">
      <path d="M4 5v14M12 5v14M4 12h8M17 7v12M15 9l2-2" />
    </template>
    <template v-else-if="name === 'h2'">
      <path d="M4 5v14M12 5v14M4 12h8M15 8a2.5 2.5 0 0 1 5 0c0 1.5-2 3.5-5 5.5h5" />
    </template>
    <template v-else-if="name === 'list'">
      <path d="M3.5 6a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M3.5 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M3.5 18a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M9 6h11M9 12h11M9 18h11" />
    </template>
    <template v-else-if="name === 'numlist'">
      <path d="M4 5.5v3.5M3 6.5l1-1M9 7h11M3 12.5a1 1 0 0 1 2 0c0 .7-.8 1.3-2 2h2 M9 13h11M3 17.5h2l-2 2h2 M9 19h11" />
    </template>
    <template v-else-if="name === 'quote'">
      <path d="M4 5v14M5 5v14M9 7h11M9 12h11M9 17h11" />
    </template>
    <template v-else-if="name === 'code'">
      <path d="M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 5l-4 14" />
    </template>
    <template v-else-if="name === 'divider'">
      <path d="M5 8h14M3 12h18M5 16h14" />
    </template>
    <template v-else-if="name === 'table'">
      <path d="M3 5h18v14H3z M9 5v14M15 5v14 M3 10h18M3 15h18" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type AppIconName =
  | 'bell'
  | 'chart'
  | 'chevron-right'
  | 'close'
  | 'comment'
  | 'edit'
  | 'image'
  | 'inbox'
  | 'download'
  | 'link'
  | 'lock'
  | 'megaphone'
  | 'refresh'
  | 'reply'
  | 'search'
  | 'send'
  | 'settings'
  | 'sort'
  | 'switch-horizontal'
  | 'user'
  | 'warning'
  | 'h1'
  | 'h2'
  | 'list'
  | 'numlist'
  | 'quote'
  | 'code'
  | 'divider'
  | 'table';

const props = withDefaults(defineProps<{
  detail?: boolean;
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
}>(), {
  detail: false,
  size: 4,
  strokeWidth: 2,
});

const sizeMap: Record<number, string> = {
  3: 'h-3 w-3',
  4: 'h-4 w-4',
  5: 'h-5 w-5',
  6: 'h-6 w-6',
  8: 'h-8 w-8',
  10: 'h-10 w-10',
};

const sizeClass = computed(() => sizeMap[props.size] ?? 'h-4 w-4');
</script>
