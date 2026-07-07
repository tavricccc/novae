import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/composables/useSession';
import { useAppUpdate } from '@/composables/useAppUpdate';

export function useAppStartupGate() {
  const router = useRouter();
  const { appReady, authChecking, userLoading, appInitializing } = useSession();
  const { initialCheckDone } = useAppUpdate();
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
    || !initialCheckDone.value
  );

  return {
    open,
  };
}
