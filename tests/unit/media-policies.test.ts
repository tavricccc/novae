import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OPERATION_POLICIES } from '../../cloudflare/generated/operations';
import { mediaPolicies } from '../../cloudflare/src/media-policies';
import { forgetOperationPolicies } from '../../cloudflare/src/backend/shared/operation-policies';
import type { Env } from '../../cloudflare/src/types';

const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), sqlOne: vi.fn() }));
vi.mock('../../cloudflare/src/backend/database/client', () => ({ createDatabaseClient: mocks.create }));
const env = {} as Env;
beforeEach(() => {
  vi.useFakeTimers(); forgetOperationPolicies();
  mocks.create.mockReset().mockResolvedValue({ close: mocks.close, sqlOne: mocks.sqlOne });
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.sqlOne.mockReset().mockResolvedValue({
    value: JSON.stringify({ revision: 1, values: Object.fromEntries(
      Object.entries(OPERATION_POLICIES).map(([key, spec]) => [key, spec.min]),
    ) }),
  });
});
afterEach(() => { forgetOperationPolicies(); vi.useRealTimers(); });

it('shares cached and concurrent media policy reads without opening more database connections', async () => {
  const [first, second] = await Promise.all([mediaPolicies(env), mediaPolicies(env)]);
  expect(first).toEqual(second);
  expect((await mediaPolicies(env)).revision).toBe(1);
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.sqlOne).toHaveBeenCalledOnce();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('refreshes after the existing one minute cache TTL or explicit invalidation', async () => {
  await mediaPolicies(env);
  await vi.advanceTimersByTimeAsync(60_000);
  await mediaPolicies(env);
  expect(mocks.create).toHaveBeenCalledTimes(2);
  forgetOperationPolicies(); await mediaPolicies(env);
  expect(mocks.create).toHaveBeenCalledTimes(3);
});

it('closes failed reads and allows a subsequent request to recover', async () => {
  mocks.sqlOne.mockRejectedValueOnce(new Error('temporary database failure'));
  await expect(mediaPolicies(env)).rejects.toThrow('temporary database failure');
  expect(mocks.close).toHaveBeenCalledOnce();
  await expect(mediaPolicies(env)).resolves.toMatchObject({ revision: 1 });
  expect(mocks.create).toHaveBeenCalledTimes(2);
});
