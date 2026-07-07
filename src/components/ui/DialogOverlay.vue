<template>
  <Teleport to="body">
    <Transition :name="transitionName" appear>
      <div
        v-if="open"
        class="dialog-overlay fixed inset-0 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm"
        :class="zIndexClass"
        :data-padding="paddingMode"
        @click.self="handleOverlayClick"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDialogThemeColor } from '@/composables/useDialogThemeColor';

const props = withDefaults(defineProps<{
  open: boolean;
  noPadding?: boolean;
  padded?: boolean;
  transitionName?: string;
  zIndexClass?: string;
  persistent?: boolean;
}>(), {
  noPadding: false,
  padded: false,
  transitionName: 'dialog',
  zIndexClass: 'z-50',
  persistent: false,
});


const emit = defineEmits<{
  close: [];
}>();

function handleOverlayClick() {
  if (!props.persistent) {
    emit('close');
  }
}

const isMobileViewport = ref(false);
let mobileMediaQuery: MediaQueryList | null = null;

const isFullScreen = computed(() => {
  return props.noPadding || (!props.padded && isMobileViewport.value);
});

useDialogThemeColor(computed(() => props.open), isFullScreen);

const paddingMode = computed(() => {
  if (props.noPadding) return 'none';
  return props.padded ? 'padded' : 'responsive';
});

function syncMobileViewport(event?: MediaQueryListEvent) {
  isMobileViewport.value = event?.matches ?? mobileMediaQuery?.matches ?? false;
}

onMounted(() => {
  mobileMediaQuery = window.matchMedia('(max-width: 767px)');
  syncMobileViewport();
  mobileMediaQuery.addEventListener('change', syncMobileViewport);
});

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener('change', syncMobileViewport);
});
</script>
