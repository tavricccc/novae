import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { requireEnv } from "../_shared/env.ts";
import {
  asRecord,
  asString,
  errorMessage,
  errorStatus,
  handleCorsPreflight,
  jsonResponse,
  readJsonRecord,
  requireMethod,
} from "../_shared/http.ts";
import { handleHealthcheck, requireAdmin, requireAuth } from "./auth.ts";
import { getPlatformDashboard } from "./dashboard.ts";
import { handleUserAction, isUserAction } from "./users.ts";
import { handleUploadAction, isUploadAction } from "./uploads.ts";
import { handleIssueAction, isIssueAction } from "./issues.ts";
import { handleAnnouncementAction, isAnnouncementAction } from "./announcements.ts";
import { handleNotificationAction, isNotificationAction } from "./notifications.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";

const idempotentActions = new Set([
  "createImageUploadSession",
  "finalizeImageUpload",
  "deleteUploadedImage",
  "createIssue",
  "moderateIssueStatus",
  "toggleSupport",
  "deleteIssue",
  "createComment",
  "deleteComment",
  "createAnnouncement",
  "updateAnnouncement",
  "deleteAnnouncement",
  "createAnnouncementComment",
  "deleteAnnouncementComment",
]);

async function runWithIdempotency(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
  execute: () => Promise<JsonRecord>,
) {
  const requestId = asString(payload.requestId);
  if (!requestId || !idempotentActions.has(action)) {
    return await execute();
  }

  const { data: claimData, error: claimError } = await supabase
    .schema("app_api")
    .rpc("claim_idempotency_key", {
      action_name: action,
      actor_uid: auth.uid,
      request_id: requestId,
    })
    .single();
  if (claimError) throw claimError;

  const claim = asRecord(claimData);
  if (claim.completed === true) return asRecord(claim.response);
  if (claim.claimed !== true) throw new Error("request-in-progress");

  try {
    const response = await execute();
    const { error: completeError } = await supabase
      .schema("app_api")
      .rpc("complete_idempotency_key", {
        action_name: action,
        action_response: response,
        actor_uid: auth.uid,
        request_id: requestId,
      });
    if (completeError) throw completeError;
    return response;
  } catch (error) {
    await supabase
      .schema("app_api")
      .rpc("release_idempotency_key", {
        action_name: action,
        actor_uid: auth.uid,
        request_id: requestId,
      });
    throw error;
  }
}

async function handleAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (isUserAction(action)) return await handleUserAction(action, payload, auth, supabase);
  if (isUploadAction(action)) return await handleUploadAction(action, payload, auth, supabase);
  if (isIssueAction(action)) return await handleIssueAction(action, payload, auth, supabase);
  if (isAnnouncementAction(action)) return await handleAnnouncementAction(action, payload, auth, supabase);
  if (isNotificationAction(action)) return await handleNotificationAction(action, payload, auth, supabase);
  if (action === "getPlatformDashboard") {
    requireAdmin(auth);
    return await getPlatformDashboard(supabase);
  }
  throw new Error(`Unsupported action: ${action}`);
}

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  const requestId = crypto.randomUUID();
  let action = "";

  try {
    const body = await readJsonRecord(request);
    action = asString(body.action);
    const payload = asRecord(body.payload);
    if (!action) throw new Error("missing action");

    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    if (action === "healthcheck") {
      return jsonResponse(await handleHealthcheck(request, supabase));
    }

    const auth = await requireAuth(supabase, request);
    const data = await runWithIdempotency(
      action,
      payload,
      auth,
      supabase,
      () => handleAction(action, payload, auth, supabase),
    );
    return jsonResponse(data);
  } catch (error) {
    const status = errorStatus(error);
    console.error(JSON.stringify({
      action: action || "unknown",
      error: errorMessage(error),
      requestId,
      stack: error instanceof Error ? error.stack : undefined,
      status,
    }));
    return jsonResponse({ error: errorMessage(error), requestId }, { status });
  }
});
