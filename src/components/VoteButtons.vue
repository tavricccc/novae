<template>
  <div class="relative">
    <button
      type="button"
      :class="[supportClass, compact ? '!h-8 !px-2.5 !gap-1 text-xs' : '']"
      :disabled="busy || supportClosed"
      :title="supportClosed ? (statusLabel ? `此提案目前為「${statusLabel}」狀態，不開放附議` : '附議已截止') : optimisticSupported ? '取消附議' : '進行附議'"
      :aria-label="optimisticSupported ? '取消附議' : '進行附議'"
      @click="toggle"
    >
      <AppIcon name="thumbs-up" :size="compact ? 4 : 5" />
      <!-- Support count display -->
      <span class="text-sm font-semibold select-none leading-none">{{ displaySupportCount }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useVoteSupport } from '@/composables/useVoteSupport';

const props = defineProps<{
  issueId: string;
  currentUserSupported: boolean;
  supportCount: number;
  supportClosed: boolean;
  statusLabel?: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
  supported: [payload: { supported: boolean; supportCount: number }];
}>();

const supportClosed = computed(() => props.supportClosed);
const {
  busy,
  optimisticSupported,
  displaySupportCount,
  supportClass,
  toggle,
} = useVoteSupport({
  issueId: toRef(props, 'issueId'),
  currentUserSupported: toRef(props, 'currentUserSupported'),
  supportCount: toRef(props, 'supportCount'),
  supportClosed,
  statusLabel: computed(() => props.statusLabel),
  onSupported: (payload) => emit('supported', payload),
  onContentUnavailable: (issueId) => emit('contentUnavailable', issueId),
});
</script>
