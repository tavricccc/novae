import { invokeBackendAction } from '@/services/backend-action';
import type { OperationPolicies } from '@/generated/operations';
import { longRequestTimeoutMs } from '@/lib/request';

export interface OperationsConsole {
  hasMore: boolean;
  cleanupBacklog: Array<{ jobId: string; createdAt: string; payload: unknown }>;
  sampledAt: string;
  errors: Array<{ action: string; code: string; status: number; count: number; lastAt: string; operationId: string; failureId: string | null }>;
  metrics: Array<{ bucket: string; databaseBytes: number; measuredAt: string }>;
  failedDeliveries: Array<{ id: string; destination: string; eventType: string; operationId: string; attemptCount: number; lastAttemptId: string | null; errorDetail: unknown }>;
  databaseBytes: number;
  settings: { revision: number; values: OperationPolicies };
  capacity: Array<{ name: string; rows: number; deadRows: number; tableBytes: number; indexBytes: number; totalBytes: number }>;
  jobs: Array<{ id: string; jobType: string; status: string; attemptCount: number; affectedRows: number; estimatedRows: number; processedRows: number; lastAttemptId: string | null; errorDetail: unknown; updatedAt: string }>;
  deliveries: Array<{ destination: string; status: string; count: number; oldestAt: string }>;
  history: Array<{ id: number; actorUid: string; revision: number; reason: string; createdAt: string; beforeValue: OperationPolicies; afterValue: OperationPolicies }>;
}
/**
 * The console's ten readings. None of them needs another, so the Worker sends
 * each as it lands and `onPanel` is called with that one reading rather than
 * the screen waiting for the slowest.
 */
export function fetchOperationsConsole(
  payload: { page?: number },
  options: { onPanel?: (panel: Partial<OperationsConsole>) => void } = {},
) {
  return invokeBackendAction<{ page?: number }, OperationsConsole>('getOperationsConsole', {
    onSegment: (key, data) => {
      if (key) options.onPanel?.({ [key]: data } as Partial<OperationsConsole>);
    },
  })(payload);
}

export function fetchOperationsProgress(page: number) {
  return invokeBackendAction<
    { page: number; progressOnly: true },
    Pick<OperationsConsole, 'jobs'>
  >('getOperationsConsole')({ page, progressOnly: true });
}
export const clearOperationalErrors = invokeBackendAction<Record<string, never>, {
  cleared: number;
  success: boolean;
}>('clearOperationalErrors');
export const clearScheduledWork = invokeBackendAction<Record<string, never>, {
  cleanup: number;
  cleared: number;
  jobs: number;
  success: boolean;
}>('clearScheduledWork');
export const retryOperationalWork = invokeBackendAction<
  { kind: 'job' | 'delivery' | 'cleanup' | 'all'; id?: string },
  { success: boolean; retried?: number }
>('retryOperationalWork');
export const queueNotionArchiveRebuild = invokeBackendAction<Record<string, never>, {
  cleared: { cleanup: number; deliveries: number; jobs: number; mappings: number };
  jobId: string;
  success: boolean;
}>('rebuildNotionArchive');
export interface ProviderDiagnostic { provider: string; status: 'available' | 'not-configured' | 'unavailable'; checkedAt: string; data?: unknown; error?: string; nextCursor?: string | null; until?: number }
export const getProviderDiagnostics = invokeBackendAction<{ provider: string; cursor?: string; until?: number; query?: string }, ProviderDiagnostic>('getProviderDiagnostics', { timeoutMs: longRequestTimeoutMs });
export const saveOperationPolicies = invokeBackendAction<{
  revision: number; values: OperationPolicies; reason: string;
}, { revision: number; values: OperationPolicies }>('saveOperationPolicies');
