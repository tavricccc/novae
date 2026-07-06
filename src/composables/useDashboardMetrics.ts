import { computed, type Ref } from 'vue';
import { ISSUE_CATEGORY_LABELS } from '@/constants/categories';
import { formatDate } from '@/lib/format';
import type { PlatformDashboardOperations, PlatformDashboardStats } from '@/types';

export function useDashboardMetrics(
  stats: Ref<PlatformDashboardStats | null>,
  operations: Ref<PlatformDashboardOperations | null>,
) {
  const updatedLabel = computed(() => formatDate(stats.value?.updated_at ?? stats.value?.last_activity_at ?? null) || '尚未更新');

  const heroStats = computed(() => {
    if (!stats.value) return [];

    return [
      { label: '使用過平台', value: stats.value.total_users_seen, caption: '人', meta: 'Users' },
      { label: '累積提案', value: stats.value.total_issues_created, caption: '筆', meta: 'Issues' },
      { label: '累積留言', value: stats.value.total_comments_created, caption: '則', meta: 'Comments' },
      { label: '累積附議', value: stats.value.total_supports_added, caption: '次', meta: 'Support' },
    ];
  });

  const categoryComparisonRows = computed(() => buildCategoryComparisonRows(stats.value));

  const operationsStatus = computed(() => statusView(operations.value?.overall_status ?? 'healthy'));

  const operationSummaryCards = computed(() => {
    if (!operations.value) return [];
    return [
      {
        label: '系統狀態',
        value: operationsStatus.value.label,
        caption: operationsStatus.value.caption,
        toneClass: operationsStatus.value.toneClass,
      },
      {
        label: '待同步',
        value: formatCappedCount(operations.value.pending_notion_sync_count, operations.value.pending_notion_sync_capped),
        caption: operations.value.oldest_pending_sync_at
          ? `最早 ${formatDate(operations.value.oldest_pending_sync_at)}`
          : '目前沒有等待項目',
        toneClass: operations.value.pending_notion_sync_count > 0
          ? 'border-warning/35 bg-warning-container/30 text-on-warning-container'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      },
      {
        label: '同步異常',
        value: formatCappedCount(operations.value.failed_notion_sync_count, operations.value.failed_notion_sync_capped),
        caption: operations.value.next_sync_count > 0 ? `下一輪 ${operations.value.next_sync_count} 筆` : '沒有下一輪聚合項目',
        toneClass: operations.value.failed_notion_sync_count > 0
          ? 'border-error/35 bg-error-container/40 text-on-error-container'
          : 'border-ink-200 bg-white text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100',
      },
      {
        label: '最近活動',
        value: updatedLabel.value,
        caption: '最新活動時間',
        toneClass: 'border-ink-200 bg-white text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100',
      },
    ];
  });

  const operationRows = computed(() => {
    if (!operations.value) return [];
    const maintenance = operations.value.scheduled_maintenance;
    return [
      {
        label: 'Notion 同步',
        value: `${formatCappedCount(operations.value.pending_notion_sync_count, operations.value.pending_notion_sync_capped)} 待同步`,
        detail: operations.value.oldest_pending_sync_at
          ? `最早等待：${formatDate(operations.value.oldest_pending_sync_at)}`
          : '目前沒有等待同步的工作',
        statusLabel: operations.value.failed_notion_sync_count > 0 ? '異常' : operations.value.pending_notion_sync_count > 0 ? '排隊中' : '正常',
        toneClass: operations.value.failed_notion_sync_count > 0 ? 'text-error' : operations.value.pending_notion_sync_count > 0 ? 'text-warning' : 'text-emerald-600 dark:text-emerald-300',
      },
      {
        label: '通知與同步',
        value: `${formatCappedCount(operations.value.failed_outbox_count, operations.value.failed_outbox_capped)} 失敗`,
        detail: '通知、同步與清理工作的處理結果',
        statusLabel: operations.value.failed_outbox_count > 0 ? '需處理' : '正常',
        toneClass: operations.value.failed_outbox_count > 0 ? 'text-error' : 'text-emerald-600 dark:text-emerald-300',
      },
      {
        label: '推播通知',
        value: `${formatCappedCount(operations.value.failed_push_delivery_count, operations.value.failed_push_delivery_capped)} 異常`,
        detail: '背景推播配送結果彙總',
        statusLabel: operations.value.failed_push_delivery_count > 0 ? '需查看' : '正常',
        toneClass: operations.value.failed_push_delivery_count > 0 ? 'text-error' : 'text-emerald-600 dark:text-emerald-300',
      },
      {
        label: '圖片上傳',
        value: `${formatCappedCount(operations.value.stuck_upload_count, operations.value.stuck_upload_capped)} 卡住`,
        detail: '超過 20 分鐘仍未完成的圖片處理',
        statusLabel: operations.value.stuck_upload_count > 0 ? '需清理' : '正常',
        toneClass: operations.value.stuck_upload_count > 0 ? 'text-warning' : 'text-emerald-600 dark:text-emerald-300',
      },
      {
        label: '刪除清理',
        value: `${formatCappedCount(operations.value.cleanup_backlog_count, operations.value.cleanup_backlog_capped)} 待清`,
        detail: '外部圖片與同步頁面的清理工作',
        statusLabel: operations.value.cleanup_backlog_count > 0 ? '待維護' : '正常',
        toneClass: operations.value.cleanup_backlog_count > 0 ? 'text-warning' : 'text-emerald-600 dark:text-emerald-300',
      },
      {
        label: '維護排程',
        value: maintenanceStatusLabel(maintenance.status),
        detail: maintenance.completed_at
          ? `上次完成：${formatDate(maintenance.completed_at)}`
          : maintenance.updated_at
            ? `上次更新：${formatDate(maintenance.updated_at)}`
            : '尚無排程紀錄',
        statusLabel: maintenance.failed_tasks.length > 0 ? maintenance.failed_tasks.join('、') : maintenanceStatusLabel(maintenance.status),
        toneClass: maintenance.status === 'failed'
          ? 'text-error'
          : maintenance.status === 'running' || maintenance.status === 'attention'
            ? 'text-warning'
            : 'text-emerald-600 dark:text-emerald-300',
      },
    ];
  });

  const recentFailureRows = computed(() => {
    if (!operations.value) return [];
    return operations.value.recent_failures.map((failure) => ({
      ...failure,
      sourceLabel: failure.source === 'notion'
        ? 'Notion'
        : failure.source === 'outbox'
          ? 'Outbox'
          : failure.source === 'push'
            ? '推播'
            : failure.source === 'cleanup'
              ? '清理'
              : failure.source,
      createdLabel: formatDate(failure.created_at) || '時間未知',
      detailLabel: failure.detail_type || failure.target_type || '未標示類型',
      nextAttemptLabel: formatDate(failure.next_attempt_at) || '尚未排程',
      targetLabel: failure.target_type && failure.target_id
        ? `${failure.target_type} / ${failure.target_id}`
        : failure.target_type || failure.target_id || '未標示目標',
      updatedLabel: formatDate(failure.updated_at) || '時間未知',
      message: failure.message || '未提供錯誤訊息',
    }));
  });

  return {
    updatedLabel,
    heroStats,
    categoryComparisonRows,
    operationsStatus,
    operationSummaryCards,
    operationRows,
    recentFailureRows,
  };
}

function formatCappedCount(count: number, capped: boolean) {
  return capped ? `${count}+` : String(count);
}

function statusView(status: PlatformDashboardOperations['overall_status']) {
  switch (status) {
    case 'critical':
      return {
        label: '需處理',
        caption: '有失敗事件需要管理員查看',
        toneClass: 'border-error/35 bg-error-container/40 text-on-error-container',
      };
    case 'attention':
      return {
        label: '注意',
        caption: '有排隊或待清理項目',
        toneClass: 'border-warning/35 bg-warning-container/30 text-on-warning-container',
      };
    case 'healthy':
      return {
        label: '正常',
        caption: '目前沒有快速掃描到異常',
        toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      };
  }
}

function maintenanceStatusLabel(status: string) {
  if (status === 'success') return '正常';
  if (status === 'running') return '執行中';
  if (status === 'attention') return '注意';
  if (status === 'failed') return '失敗';
  return '尚無紀錄';
}

function buildCategoryComparisonRows(stats: PlatformDashboardStats | null) {
  if (!stats) return [];

  const total = Math.max(1, stats.total_issues_created + stats.total_comments_created);
  const barClasses = [
    'bg-emerald-500 dark:bg-emerald-300',
    'bg-indigo-500 dark:bg-indigo-300',
    'bg-ink-700 dark:bg-ink-100',
  ];

  return Object.entries(ISSUE_CATEGORY_LABELS).map(([key, label], index) => {
    const category = key as keyof typeof ISSUE_CATEGORY_LABELS;
    const issues = stats.issues_by_category[category] ?? 0;
    const comments = stats.comments_by_category[category] ?? 0;
    const value = issues + comments;
    const exactPercent = Math.round((value / total) * 100);

    return {
      label,
      issues,
      comments,
      percent: value === 0 ? 0 : Math.max(8, exactPercent),
      percentLabel: `${exactPercent}%`,
      barClass: barClasses[index] ?? barClasses[0],
    };
  });
}
