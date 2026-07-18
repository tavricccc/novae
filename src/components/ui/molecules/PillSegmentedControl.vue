<template>
  <div
    ref="containerRef"
    class="segmented-control relative isolate flex items-center"
    :style="containerStyle"
  >
    <div
      class="pointer-events-none absolute top-0 left-0 rounded-full border-0 bg-surface shadow-control dark:bg-ink-800"
      :style="indicatorStyle"
    ></div>

    <button
      v-for="item in options"
      :key="item.value"
      ref="buttonRefs"
      type="button"
      class="segmented-control__button relative z-10 flex h-full items-center justify-center rounded-full text-xs font-semibold select-none"
      :class="modelValue === item.value
        ? [activeClass, 'segmented-control__button--active']
        : [inactiveClass, 'segmented-control__button--compact']"
      :title="item.title ?? item.label"
      :aria-label="item.ariaLabel ?? item.title ?? item.label"
      :aria-pressed="modelValue === item.value"
      :data-value="item.value"
      @click="emit('update:modelValue', item.value)"
    >
      <AppIcon :name="item.icon" :size="3.5" />
      <span
        class="inline-block overflow-hidden whitespace-nowrap transition-[opacity,transform,max-width,margin] duration-300 ease-[var(--motion-ease-enter)]"
        :class="modelValue === item.value
          ? 'ml-1.5 max-w-28 translate-x-0 opacity-100'
          : 'ml-0 max-w-0 -translate-x-1 opacity-0'"
      >
        {{ item.label }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="TValue extends string">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import type { AppIconName } from '@/components/ui/atoms/AppIcon.vue';

export interface PillSegmentedControlOption<TValue extends string> {
  ariaLabel?: string;
  icon: AppIconName;
  label: string;
  title?: string;
  value: TValue;
}

const props = defineProps<{
  modelValue: TValue;
  options: readonly PillSegmentedControlOption<TValue>[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TValue];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const buttonRefs = ref<HTMLButtonElement[]>([]);
let resizeObserver: ResizeObserver | null = null;

const ACTIVE_SEGMENT_WIDTH_REM = 7;
const COMPACT_SEGMENT_WIDTH_REM = 2;
const SEGMENT_GAP_REM = 0.125;
const CONTROL_INLINE_PADDING_REM = 0.25;

const activeClass = 'text-ink-950 dark:text-ink-50';
const inactiveClass = 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200';
const containerStyle = computed(() => {
  const compactSegmentCount = Math.max(0, props.options.length - 1);
  const gapCount = Math.max(0, props.options.length - 1);
  const width = ACTIVE_SEGMENT_WIDTH_REM
    + compactSegmentCount * COMPACT_SEGMENT_WIDTH_REM
    + gapCount * SEGMENT_GAP_REM
    + CONTROL_INLINE_PADDING_REM;

  return { width: `${width}rem` };
});

const indicatorStyle = ref({
  height: '0px',
  transform: 'translate3d(0px, 0px, 0)',
  transition: 'transform var(--motion-duration-panel) var(--motion-ease-enter), width var(--motion-duration) var(--motion-ease-enter)',
  width: '0px',
});

function measureIndicator() {
  const activeIndex = props.options.findIndex((option) => option.value === props.modelValue);
  const activeButton = buttonRefs.value[activeIndex];
  if (!activeButton) return;

  indicatorStyle.value = {
    height: `${activeButton.offsetHeight}px`,
    transform: `translate3d(${activeButton.offsetLeft}px, ${activeButton.offsetTop}px, 0)`,
    transition: 'transform var(--motion-duration-panel) var(--motion-ease-enter), width var(--motion-duration) var(--motion-ease-enter)',
    width: `${activeButton.offsetWidth}px`,
  };
}

function observeControlSize() {
  resizeObserver?.disconnect();
  if (!resizeObserver) return;
  if (containerRef.value) resizeObserver.observe(containerRef.value);
  buttonRefs.value.forEach((button) => resizeObserver?.observe(button));
}

function updateIndicator() {
  void nextTick(() => {
    measureIndicator();
    observeControlSize();
  });
}

watch(
  () => [props.modelValue, props.options],
  updateIndicator,
  { immediate: true },
);

onMounted(() => {
  resizeObserver = new ResizeObserver(measureIndicator);
  window.addEventListener('resize', updateIndicator);
  updateIndicator();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', updateIndicator);
});
</script>
