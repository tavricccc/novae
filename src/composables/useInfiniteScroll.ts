import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

interface InfiniteScrollOptions {
  disabled?: Ref<boolean>;
  onLoadMore: () => void | Promise<void>;
  root?: Ref<HTMLElement | null>;
  rootMargin?: string;
}

export function useInfiniteScroll(options: InfiniteScrollOptions) {
  const sentinel = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;
  let loadPending = false;
  let disposed = false;

  function stopObserver() {
    observer?.disconnect();
    observer = null;
  }

  async function triggerLoadMore() {
    if (loadPending || options.disabled?.value) return;
    loadPending = true;
    try {
      await options.onLoadMore();
    } finally {
      loadPending = false;
      await nextTick();
      if (!disposed && !options.disabled?.value) {
        startObserver(sentinel.value, options.root?.value ?? null);
      }
    }
  }

  function startObserver(element: HTMLElement | null, root: HTMLElement | null) {
    stopObserver();
    if (!element) return;

    observer = new IntersectionObserver((entries) => {
      if (options.disabled?.value) return;
      if (entries.some((entry) => entry.isIntersecting)) {
        void triggerLoadMore();
      }
    }, {
      root,
      rootMargin: options.rootMargin ?? '360px 0px',
    });
    observer.observe(element);
  }

  watch(
    [sentinel, () => options.root?.value ?? null, () => options.disabled?.value ?? false],
    async ([element, root, disabled]) => {
      stopObserver();
      if (disabled) return;
      await nextTick();
      startObserver(element as HTMLElement | null, root as HTMLElement | null);
    },
    { flush: 'post', immediate: true },
  );
  onBeforeUnmount(() => {
    disposed = true;
    stopObserver();
  });

  return {
    sentinel,
  };
}
