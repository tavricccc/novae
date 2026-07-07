import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogFocusOptions {
  onClose: () => void;
  initialFocus?: string;
  persistent?: Ref<boolean> | boolean;
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
}

function isTopDialog(root: HTMLElement) {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[data-dialog-root]'));
  return dialogs[dialogs.length - 1] === root;
}

export function useDialogFocus(open: Ref<boolean>, options: DialogFocusOptions) {
  const dialogRef = ref<HTMLElement | null>(null);
  let previousFocus: Element | null = null;

  function focusInitialElement() {
    const root = dialogRef.value;
    if (!root) {
      return;
    }

    const target = options.initialFocus
      ? root.querySelector<HTMLElement>(options.initialFocus)
      : root.querySelector<HTMLElement>('[data-autofocus]');
    const firstFocusable = getFocusableElements(root)[0];

    // preventScroll: true — the dialog is a fixed overlay; we must not
    // scroll the page just to bring a focused element "into view".
    (target ?? firstFocusable ?? root).focus({ preventScroll: true });
  }

  function handleKeydown(event: KeyboardEvent) {
    const root = dialogRef.value;
    if (!root || !open.value || !isTopDialog(root)) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      const isPersistent = typeof options.persistent === 'object' && 'value' in options.persistent
        ? options.persistent.value
        : Boolean(options.persistent);

      if (!isPersistent) {
        options.onClose();
      }
      return;
    }


    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(root);
    if (focusableElements.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        previousFocus = document.activeElement;
        document.addEventListener('keydown', handleKeydown);
        await nextTick();
        focusInitialElement();
        return;
      }

      document.removeEventListener('keydown', handleKeydown);
      if (previousFocus instanceof HTMLElement) {
        // preventScroll: true — after a dialog closes the page scroll position
        // may have changed (scroll lock shifts things); restoring focus should
        // not cause the browser to additionally scroll the element into view.
        previousFocus.focus({ preventScroll: true });
      }
      previousFocus = null;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  return {
    dialogRef,
  };
}
