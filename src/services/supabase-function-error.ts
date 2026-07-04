interface FunctionErrorResult {
  error: unknown;
  response?: Response;
}

function errorFallback(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function readSupabaseFunctionError(result: FunctionErrorResult) {
  const response = result.response;
  if (!response) {
    return errorFallback(result.error);
  }

  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await response.clone().json() as Record<string, unknown>;
      const message = body.error ?? body.message;
      return typeof message === 'string' && message.trim()
        ? message.trim()
        : errorFallback(result.error);
    }

    const text = await response.clone().text();
    return text.trim() || errorFallback(result.error);
  } catch {
    return errorFallback(result.error);
  }
}
