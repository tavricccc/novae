export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export function handleCorsPreflight(request: Request) {
  return request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export function requireMethod(request: Request, method: string) {
  if (request.method === method) return null;
  return jsonResponse(
    { error: "method-not-allowed" },
    {
      headers: { Allow: method },
      status: 405,
    },
  );
}

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = asString(record.code);
    const message = asString(record.message);
    const details = asString(record.details);
    const hint = asString(record.hint);
    const parts = [
      code,
      message,
      details ? `details: ${details}` : "",
      hint ? `hint: ${hint}` : "",
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(record);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function errorStatus(error: unknown) {
  const message = errorMessage(error);
  if (message === "unauthenticated") return 401;
  if (message === "permission-denied") return 403;
  if (message === "not-found") return 404;
  if (message === "missing action" || message.startsWith("Unsupported action:")) return 400;
  if (message === "invalid-json") return 400;
  if (message === "request-in-progress") return 409;
  if (message.endsWith(" is not configured.")) return 503;
  return 500;
}

export async function readJsonRecord(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    throw new Error("invalid-json");
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
