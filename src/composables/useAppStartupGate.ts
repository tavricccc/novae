import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/composables/useSession';

export function useAppStartupGate() {
  const router = useRouter();
  const { appReady, authChecking, userLoading, appInitializing } = useSession();
  const routerReady = ref(false);

  onMounted(() => {
    void router.isReady().then(() => {
      routerReady.value = true;
    });
  });

  const open = computed(() =>
    !routerReady.value
    || !appReady.value
    || authChecking.value
    || userLoading.value
    || appInitializing.value
  );

  return {
    open,
  };
}
