import type { Env } from './types';
import { createDatabaseClient } from './backend/database/client';
import { cachedOperationPolicies, readOperationPolicies } from './backend/shared/operation-policies';

/**
 * The policies a signed media request runs under.
 *
 * Media is the one entry point with no database work of its own, so it opens a
 * connection for the settings alone; the shared read means it only does that
 * when nothing in this isolate has read them in the last minute.
 */
export async function mediaPolicies(env: Env) {
  return cachedOperationPolicies(async () => {
    const database = await createDatabaseClient(env);
    try { return await readOperationPolicies(database); }
    finally { await database.close(); }
  });
}
