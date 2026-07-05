import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { requireEnv } from "../_shared/env.ts";
import { errorMessage, errorStatus, jsonResponse, requireMethod, textResponse } from "../_shared/http.ts";
import { verifyCloudinarySignature } from "../_shared/webhook.ts";

Deno.serve(async (request) => {
  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  try {
    const rawBody = await request.text();
    const signatureFailure = await verifyCloudinarySignature(request, rawBody);
    if (signatureFailure) return signatureFailure;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new Error("invalid-json");
    }
    const publicId = String(payload.public_id ?? "");
    if (!publicId) {
      return textResponse("Missing public_id", { status: 400 });
    }

    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { error } = await supabase
      .schema("app_private")
      .from("uploads")
      .update({
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("cloudinary_public_id", publicId)
      .eq("status", "pending");

    if (error) {
      throw error;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage(error) }, { status: errorStatus(error) });
  }
});
