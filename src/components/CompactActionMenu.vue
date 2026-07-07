<template>
  <div class="relative inline-block text-left z-30">
    <button
      ref="triggerRef"
      type="button"
      class="button-toolbar h-8 w-8 rounded-full p-0"
      :class="{ 'text-ink-800 dark:text-ink-100': isOpen }"
      :title="title"
      :aria-label="title"
      @click="isOpen = !isOpen"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </svg>
    </button>

    <Teleport to="body">
      <transition name="popover">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="fixed z-[100] w-44 origin-top-right rounded-2xl border border-ink-200/80 bg-white p-1.5 shadow-lg dark:border-ink-700/80 dark:bg-ink-900"
          :style="dropdownStyle"
        >
          <button
            v-if="showEdit"
            type="button"
            class="menu-item"
            @click.stop="select('edit')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            <span>{{ editLabel }}</span>
          </button>
          <div class="border-error/20" :class="showEdit ? 'mt-1 border-t pt-1' : ''">
            <button
              type="button"
              class="menu-item menu-item-danger"
              :disabled="deleteDisabled"
              @click.stop="select('delete')"
            >
              <TrashIcon :size="3.5" />
              <span>{{ deleteLabel }}</span>
            </button>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import TrashIcon from '@/components/ui/TrashIcon.vue';
import { useDropdownPosition } from '@/composables/useDropdownPosition';

withDefaults(defineProps<{
  deleteDisabled?: boolean;
  deleteLabel?: string;
  editLabel?: string;
  showEdit?: boolean;
  title?: string;
}>(), {
  deleteDisabled: false,
  deleteLabel: '刪除公告',
  editLabel: '編輯公告',
  showEdit: true,
  title: '管理',
});

const emit = defineEmits<{
  delete: [];
  edit: [];
  'dropdown-open': [open: boolean];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);
const { dropdownStyle } = useDropdownPosition(
  triggerRef,
  isOpen,
  { fallbackHeight: 96, width: 176 },
  dropdownRef,
);

function closeMenu(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) {
    return;
  }
  isOpen.value = false;
}

function select(action: 'delete' | 'edit') {
  isOpen.value = false;
  if (action === 'delete') {
    emit('delete');
    return;
  }

  emit('edit');
}

watch(isOpen, (open) => {
  emit('dropdown-open', open);
  if (open) {
    window.addEventListener('click', closeMenu);
  } else {
    window.removeEventListener('click', closeMenu);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenu);
});
</script>
