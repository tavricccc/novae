<template>
  <div class="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
    <PageLoadFailure
      v-if="sessionLoadingHasProblem"
      :title="sessionProblemTitle"
      :description="sessionProblemDescription"
      :retry-disabled="!sessionOnline"
      @retry="reloadPage"
    />

    <div v-else-if="sessionLoading" class="space-y-6" aria-label="正在載入提案" aria-busy="true">
      <div class="flex items-center justify-between border-b border-ink-200/80 pb-4 dark:border-ink-800/80">
        <span class="h-7 w-16 rounded bg-ink-200/60 animate-skeleton dark:bg-ink-700/50"></span>
        <div class="flex gap-2">
          <span class="h-9 w-24 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
          <span class="h-9 w-20 rounded-full bg-ink-200/60 dark:bg-ink-700/50 animate-skeleton"></span>
        </div>
      </div>
      <IssueBoardTable
        :issues="[]"
        :loading="true"
        error=""
      />
    </div>

    <div v-else-if="!isAllowedUser" class="sr-only" role="status">正在前往登入頁</div>

    <IssueBoard
      v-if="isAllowedUser"
      class="min-h-0 flex-1"
      :is-form-open="isFormOpen"
      @toggle-form="toggleForm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import IssueBoard from '@/components/IssueBoard.vue';
import IssueBoardTable from '@/components/IssueBoardTable.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import { useSession } from '@/composables/useSession';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { resetAppConnection } from '@/lib/reconnect';

const { initialized, isAllowedUser, loading } = useSession();
const sessionLoading = computed(() => loading.value || !initialized.value);
const {
  hasProblem: sessionLoadingHasProblem,
  isOnline: sessionOnline,
  problemDescription: sessionProblemDescription,
  problemTitle: sessionProblemTitle,
} = useLoadingTimeout(sessionLoading, 5_000);
const isFormOpen = ref(false);

function toggleForm() {
  isFormOpen.value = !isFormOpen.value;
}

async function reloadPage() {
  await resetAppConnection();
  window.location.reload();
}
</script>
