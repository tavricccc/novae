import { computed, ref, watch, type Ref } from 'vue';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { removeSupport, toggleSupport } from '@/services/issues';
import { isContentUnavailableError } from '@/services/issues-core';

interface VoteSupportOptions {
  issueId: Ref<string>;
  currentUserSupported: Ref<boolean>;
  supportCount: Ref<number>;
  supportClosed: Ref<boolean>;
  statusLabel: Ref<string | undefined>;
  onSupported: (payload: { supported: boolean; supportCount: number }) => void;
  onContentUnavailable?: (issueId: string) => void;
}

export function useVoteSupport(options: VoteSupportOptions) {
  const { user } = useSession();
  const { showProgressToast, showToast } = useToast();
  const busy = ref(false);
  const optimisticSupported = ref(options.currentUserSupported.value);

  watch(options.currentUserSupported, (value) => {
    optimisticSupported.value = value;
  });

  const displaySupportCount = computed(() => {
    if (optimisticSupported.value === options.currentUserSupported.value) {
      return options.supportCount.value;
    }

    let count = options.supportCount.value;
    if (options.currentUserSupported.value) {
      count -= 1;
    }
    if (optimisticSupported.value) {
      count += 1;
    }
    return count;
  });

  const supportClass = computed(() =>
    optimisticSupported.value
      ? 'button-icon-pill-filled'
      : 'button-icon-pill',
  );

  async function toggle() {
    if (!user.value) {
      showToast('請先登入後再附議。', 'error');
      return;
    }

    if (options.supportClosed.value) {
      return;
    }

    const nextSupported = !optimisticSupported.value;
    const previousSupported = optimisticSupported.value;
    optimisticSupported.value = nextSupported;
    busy.value = true;
    const progressToast = showProgressToast(nextSupported ? '正在附議...' : '正在取消附議...');

    try {
      const result = nextSupported
        ? await toggleSupport(options.issueId.value)
        : await removeSupport(options.issueId.value);

      optimisticSupported.value = result.supported;
      options.onSupported({
        supported: result.supported,
        supportCount: result.support_count,
      });
      progressToast.succeed(result.supported ? '已完成附議。' : '已取消附議。');
    } catch (err) {
      optimisticSupported.value = previousSupported;
      const errMsg = err instanceof Error ? err.message : '';
      if (isContentUnavailableError(err)) {
        progressToast.fail(errMsg || '這篇提案已刪除，無法繼續操作。');
        options.onContentUnavailable?.(options.issueId.value);
      } else if (errMsg.includes('permission-denied') || errMsg.toLowerCase().includes('permission denied')) {
        progressToast.fail(
          options.statusLabel.value
            ? `此提案目前為「${options.statusLabel.value}」狀態，不開放附議`
            : '本提案目前的狀態不開放附議。',
        );
      } else {
        progressToast.fail('附議失敗，請稍後再試。');
      }
    } finally {
      busy.value = false;
    }
  }

  return {
    busy,
    optimisticSupported,
    displaySupportCount,
    supportClass,
    toggle,
  };
}
