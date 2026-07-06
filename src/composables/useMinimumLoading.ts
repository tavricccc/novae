import { computed, type Ref } from 'vue';

interface MinimumLoadingOptions {
  trigger?: Ref<unknown>;
}

export function useMinimumLoading(
  loading: Ref<boolean>,
  _options: MinimumLoadingOptions = {},
) {
  const visibleLoading = computed(() => loading.value);

  return {
    visibleLoading,
  };
}
