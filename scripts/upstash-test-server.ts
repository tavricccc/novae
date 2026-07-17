const port = Number(Deno.env.get("UPSTASH_TEST_PORT") ?? "54329");
const values = new Map<string, { expiresAt: number; value: string }>();

function readValue(key: string) {
  const entry = values.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    values.delete(key);
    return null;
  }
  return entry.value;
}

function execute(command: unknown) {
  if (!Array.isArray(command)) return { error: "invalid-command" };
  const name = String(command[0] ?? "").toUpperCase();
  if (name === "GET") return { result: readValue(String(command[1] ?? "")) };
  if (name === "SET") {
    const key = String(command[1] ?? "");
    const value = String(command[2] ?? "");
    const seconds = String(command[3] ?? "").toUpperCase() === "EX" ? Number(command[4]) : 3600;
    values.set(key, { expiresAt: Date.now() + Math.max(1, seconds) * 1000, value });
    return { result: "OK" };
  }
  if (name === "EVAL") {
    const key = String(command[3] ?? "");
    const seconds = Math.max(1, Number(command[4]) || 1);
    const units = Math.max(1, Number(command[5]) || 1);
    const count = Number(readValue(key) ?? "0") + units;
    values.set(key, { expiresAt: Date.now() + seconds * 1000, value: String(count) });
    return { result: count };
  }
  return { error: "unsupported-command" };
}

Deno.serve({ hostname: "0.0.0.0", port }, async (request) => {
  try {
    const body = await request.json();
    const result = new URL(request.url).pathname === "/pipeline"
      ? Array.isArray(body) ? body.map(execute) : [{ error: "invalid-pipeline" }]
      : execute(body);
    return Response.json(result);
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }
});
