interface RecordedRequest {
  body: Record<string, unknown>;
  path: string;
}

const requests: RecordedRequest[] = [];
const port = Number(Deno.env.get("NOVAE_EXTERNAL_PROVIDER_TEST_PORT") ?? "54330");

Deno.serve({ hostname: "0.0.0.0", port }, async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/__requests" && request.method === "DELETE") {
    requests.length = 0;
    return Response.json({ ok: true });
  }
  if (url.pathname === "/__requests" && request.method === "GET") {
    return Response.json({ requests });
  }
  if (request.method === "GET" && url.pathname.startsWith("/image/authenticated/")) {
    const bytes = Uint8Array.from(
      atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"),
      (character) => character.charCodeAt(0),
    );
    return new Response(bytes, {
      headers: { "cache-control": "public, max-age=3600", "content-type": "image/webp" },
    });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json() as Record<string, unknown>
    : Object.fromEntries((await request.formData()).entries());
  requests.push({ body, path: url.pathname });
  if (url.pathname.startsWith("/iid/")) {
    const tokens = Array.isArray(body.registration_tokens) ? body.registration_tokens : [];
    return Response.json({ results: tokens.map(() => ({})) });
  }
  if (url.pathname.endsWith("/messages:send")) {
    return Response.json({ name: `local/${requests.length}` });
  }
  if (url.pathname.endsWith("/image/destroy")) {
    return Response.json({ result: "ok" });
  }
  return Response.json({ error: "not-found" }, { status: 404 });
});
