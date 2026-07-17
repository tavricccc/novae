import { asRecord, asString } from "../_shared/http.ts";
import { hasPermission } from "./auth.ts";
import { claimBackendActionBusinessLimit } from "./rate-limit.ts";
import type { BackendActionDefinition } from "./action-registry.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";

async function runWithIdempotency(
  definition: BackendActionDefinition,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
  execute: () => Promise<JsonRecord>,
) {
  const action = definition.name;
  const requestId = asString(payload.requestId);
  if (definition.requiresRequestId && !requestId) {
    throw new Error("validation-required");
  }
  if (!requestId || !definition.idempotent) {
    await claimBackendActionBusinessLimit(action, payload, auth.uid);
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

  let response: JsonRecord;
  try {
    await claimBackendActionBusinessLimit(action, payload, auth.uid);
    response = await execute();
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
}

export async function executeBackendAction(
  definition: BackendActionDefinition,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (definition.requiredPermission && !hasPermission(auth, definition.requiredPermission)) {
    throw new Error("permission-denied");
  }
  return await runWithIdempotency(
    definition,
    payload,
    auth,
    supabase,
    () => definition.handler(definition.name, payload, auth, supabase),
  );
}
