import { getSupabaseClient } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/request';
import { auth } from '@/lib/firebase';
import { readSupabaseFunctionError } from '@/services/supabase-function-error';

export interface BackendActionResult<TResponse> {
  data: TResponse;
}

export function invokeBackendAction<TRequest = Record<string, unknown>, TResponse = unknown>(
  name: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const client = getSupabaseClient();

  return (payload: TRequest): Promise<BackendActionResult<TResponse>> => withRequestTimeout(
    async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        throw new Error('請先登入後再操作。');
      }

      const result = await client.functions.invoke<TResponse>('backendAction', {
        body: { action: name, payload },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (result.error) {
        throw new Error(await readSupabaseFunctionError(result));
      }
      if (result.data === null) {
        throw new Error('服務沒有回傳資料。');
      }
      return { data: result.data };
    },
    { label: name, signal: options.signal, timeoutMs: options.timeoutMs },
  );
}
