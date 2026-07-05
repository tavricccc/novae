import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { requireEnv } from "../_shared/env.ts";
import { requireEligibleFirebaseUser } from "../_shared/firebase-auth.ts";
import { getGoogleAccessToken } from "../_shared/google-oauth.ts";
import { errorMessage, errorStatus, handleCorsPreflight, jsonResponse, requireMethod } from "../_shared/http.ts";

function parseCustomAttributes(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function isAdminEmail(email: string) {
  return requireEnv("ADMIN_EMAILS")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  try {
    const projectId = requireEnv("FIREBASE_PROJECT_ID");
    const user = await requireEligibleFirebaseUser(request);
    const appRole = isAdminEmail(user.email) ? "admin" : "user";

    const accessToken = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/firebase",
    ]);
    const updateResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localId: user.uid,
          customAttributes: JSON.stringify({
            ...parseCustomAttributes(user.customAttributes),
            role: "authenticated",
          }),
        }),
      },
    );
    if (!updateResponse.ok) {
      throw new Error(`Firebase custom claim update failed: ${await updateResponse.text()}`);
    }

    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { error } = await supabase
      .schema("app_private")
      .from("user_roles")
      .upsert({ role: appRole, uid: user.uid, updated_at: new Date().toISOString() }, { onConflict: "uid" });
    if (error) throw error;

    return jsonResponse({ ok: true, role: "authenticated", userRole: appRole });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage(error) }, { status: errorStatus(error) });
  }
});
