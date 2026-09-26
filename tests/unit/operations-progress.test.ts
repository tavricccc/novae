import { describe, expect, it, vi } from 'vitest';
import { handleOperationsAction } from '../../cloudflare/src/backend/actions/operations';
import type { AuthContext, BackendDatabase } from '../../cloudflare/src/backend/actions/types';

describe('operations progress', () => {
  it('reads only the jobs page, without capacity, history or diagnostic queries', async () => {
    const sql = vi.fn().mockResolvedValue({ rows: [{ id: 'job', status: 'processing' }] });
    const database = { sql } as unknown as BackendDatabase;
    const result = await handleOperationsAction('getOperationsConsole', { page: 2, progressOnly: true },
      { isAdmin: true } as AuthContext, database);
    expect(result).toEqual({ jobs: [{ id: 'job', status: 'processing' }] });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][1]).toBe(200);
    expect(sql.mock.calls[0][0].join('')).toContain('app_private.background_jobs');
  });

  it('keeps progress behind the same administrator boundary', async () => {
    const sql = vi.fn();
    await expect(handleOperationsAction('getOperationsConsole', { progressOnly: true },
      { isAdmin: false } as AuthContext, { sql } as unknown as BackendDatabase))
      .rejects.toThrow('permission-denied');
    expect(sql).not.toHaveBeenCalled();
  });
});
