<template>
  <section class="page-bottom-safe space-y-5">
    <PageLoadFailure
      v-if="dashboardLoadingHasProblem"
      :title="dashboardProblemTitle"
      :description="dashboardProblemDescription"
      :retry-disabled="!dashboardOnline"
      @retry="retryDashboard"
    />

    <SkeletonDashboard v-else-if="sessionLoading || loading" />

    <EmptyStatePanel
      v-else-if="!isAdmin"
      title="無法查看儀表板"
      description="此頁面僅限管理員使用。"
      icon="lock"
    />

    <EmptyStatePanel
      v-else-if="error"
      title="統計讀取失敗"
      :description="error"
      icon="warning"
      tone="danger"
      action-label="重新整理"
      @action="retryDashboard"
    />

    <div v-else-if="stats && operations" class="space-y-5">
      <header class="border-b border-ink-200/80 pb-4 dark:border-ink-800/80">
        <div class="min-w-0">
          <h2 class="hidden text-2xl font-bold tracking-tight text-ink-950 dark:text-ink-50 md:block sm:text-3xl">統計</h2>
          <p class="max-w-2xl text-sm leading-6 text-ink-500 dark:text-ink-400 md:mt-2">
            快速掃描同步、排程與清理狀態，成果數字保留為維護時的背景脈絡。
          </p>
        </div>
      </header>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="item in operationSummaryCards"
          :key="item.label"
          class="rounded-[1.25rem] border p-5 shadow-note"
          :class="item.toneClass"
        >
          <p class="text-xs font-semibold text-current/65">{{ item.label }}</p>
          <p class="mt-3 text-2xl font-bold tabular-nums tracking-tight text-current">{{ item.value }}</p>
          <p class="mt-2 text-xs font-medium leading-5 text-current/70">{{ item.caption }}</p>
        </article>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <div class="grid gap-5">
          <section class="dashboard-surface">
            <div class="dashboard-section-head">
              <div>
                <h3 class="dashboard-section-title">維運狀態</h3>
                <p class="dashboard-section-subtitle">快速掌握同步、清理與排程是否需要處理。</p>
              </div>
              <span class="dashboard-total">{{ operationsStatus.label }}</span>
            </div>
            <div class="mt-4 divide-y divide-ink-200/80 overflow-hidden rounded-xl border border-ink-200/80 dark:divide-ink-800/80 dark:border-ink-800/80">
              <div
                v-for="row in operationRows"
                :key="row.label"
                class="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(9rem,0.9fr)_minmax(0,1.2fr)_auto]"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-ink-900 dark:text-ink-100">{{ row.label }}</p>
                  <p class="mt-1 text-xs font-medium text-ink-400 dark:text-ink-500">{{ row.detail }}</p>
                </div>
                <p class="text-sm font-semibold tabular-nums text-ink-700 dark:text-ink-200">{{ row.value }}</p>
                <p class="text-left text-xs font-bold sm:text-right" :class="row.toneClass">{{ row.statusLabel }}</p>
              </div>
            </div>
          </section>

          <section class="dashboard-surface">
            <div class="dashboard-section-head">
              <div>
                <h3 class="dashboard-section-title">分類使用概況</h3>
                <p class="dashboard-section-subtitle">查看各分類的提案與討論分布。</p>
              </div>
              <span class="dashboard-total">{{ stats.total_issues_created + stats.total_comments_created }} 筆內容</span>
            </div>
            <div class="mt-4 overflow-hidden rounded-xl border border-ink-200/80 dark:border-ink-800/80">
              <div class="grid grid-cols-[1fr_5rem_5rem_4rem] gap-3 border-b border-ink-200/80 bg-ink-50/70 px-4 py-2 text-xs font-bold text-ink-500 dark:border-ink-800/80 dark:bg-ink-950/40 dark:text-ink-400">
                <span>分類</span>
                <span class="text-right">提案</span>
                <span class="text-right">留言</span>
                <span class="text-right">占比</span>
              </div>
              <div
                v-for="row in categoryComparisonRows"
                :key="row.label"
                class="grid grid-cols-[1fr_5rem_5rem_4rem] items-center gap-3 border-b border-ink-200/70 px-4 py-3 last:border-b-0 dark:border-ink-800/70"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-ink-900 dark:text-ink-100">{{ row.label }}</p>
                  <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div class="h-full rounded-full" :class="row.barClass" :style="{ width: `${row.percent}%` }"></div>
                  </div>
                </div>
                <p class="text-right text-sm font-bold tabular-nums text-ink-950 dark:text-ink-50">{{ row.issues }}</p>
                <p class="text-right text-sm font-bold tabular-nums text-ink-950 dark:text-ink-50">{{ row.comments }}</p>
                <p class="text-right text-xs font-semibold tabular-nums text-ink-400 dark:text-ink-500">{{ row.percentLabel }}</p>
              </div>
            </div>
          </section>
        </div>

        <aside class="grid gap-5">
          <section class="dashboard-surface">
            <div class="dashboard-section-head">
              <div>
                <h3 class="dashboard-section-title">平台成果</h3>
                <p class="dashboard-section-subtitle">平台使用狀況的整體摘要。</p>
              </div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div
                v-for="item in heroStats"
                :key="item.label"
                class="rounded-xl border border-ink-200/80 px-4 py-3 dark:border-ink-800/80"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-ink-600 dark:text-ink-300">{{ item.label }}</p>
                  <span class="text-xs font-bold text-ink-400 dark:text-ink-500">{{ item.caption }}</span>
                </div>
                <p class="mt-2 text-2xl font-bold tabular-nums text-ink-950 dark:text-ink-50">{{ item.value }}</p>
              </div>
            </div>
          </section>

          <section class="dashboard-surface">
            <div class="dashboard-section-head">
              <div>
                <h3 class="dashboard-section-title">最近異常</h3>
                <p class="dashboard-section-subtitle">使用追蹤碼到 Edge Function log 查詢完整錯誤。</p>
              </div>
            </div>
            <div v-if="recentFailureRows.length > 0" class="mt-4 space-y-3">
              <div
                v-for="failure in recentFailureRows"
                :key="`${failure.source}-${failure.id}`"
                class="rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-950/50"
              >
                <div class="flex items-start justify-between gap-3">
                  <p class="text-sm font-bold text-ink-900 dark:text-ink-100">{{ failure.sourceLabel }}</p>
                  <p class="text-xs font-semibold text-ink-400 dark:text-ink-500">{{ failure.updatedLabel }}</p>
                </div>
                <p class="mt-2 break-all text-xs font-semibold text-error">
                  追蹤碼：{{ failure.trackingCode }}
                </p>
              </div>
            </div>
            <p v-else class="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-500 dark:bg-ink-950/50 dark:text-ink-400">
              目前沒有快速掃描到失敗事件。
            </p>
          </section>
        </aside>
      </section>
    </div>

    <EmptyStatePanel
      v-else
      title="尚無統計資料"
      description="目前沒有可顯示的平台成果。"
      icon="chart"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import SkeletonDashboard from '@/components/ui/SkeletonDashboard.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import { useDashboardMetrics } from '@/composables/useDashboardMetrics';
import { usePlatformDashboard } from '@/composables/usePlatformDashboard';
import { useSession } from '@/composables/useSession';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { resetAppConnection } from '@/lib/reconnect';

const { initialized, isAdmin, loading: authLoading } = useSession();
const { stats, operations, loading, error, loadDashboard } = usePlatformDashboard();
async function retryDashboard() {
  await resetAppConnection();
  await loadDashboard();
}
const sessionLoading = computed(() => authLoading.value || !initialized.value);
const dashboardLoading = computed(() => sessionLoading.value || loading.value);
const {
  hasProblem: dashboardLoadingHasProblem,
  isOnline: dashboardOnline,
  problemDescription: dashboardProblemDescription,
  problemTitle: dashboardProblemTitle,
} = useLoadingTimeout(dashboardLoading, 5_000);
const {
  heroStats,
  categoryComparisonRows,
  operationsStatus,
  operationSummaryCards,
  operationRows,
  recentFailureRows,
} = useDashboardMetrics(stats, operations);

watch(
  [initialized, isAdmin],
  ([ready, admin]) => {
    if (!ready || !admin || stats.value || loading.value) return;
    void loadDashboard();
  },
  { immediate: true },
);
</script>
