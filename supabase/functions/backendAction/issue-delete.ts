import { asRecord, asString } from "../_shared/http.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { queueAttachedUploadsForDeletion } from "./uploads.ts";
import { asUuid } from "./utils.ts";

function uploadTargetsFromResult(data: unknown, fallbackIssueId: string) {
  const result = asRecord(data);
  return Array.isArray(result.upload_targets)
    ? result.upload_targets.map((target) => {
      const record = asRecord(target);
      return {
        id: asString(record.id),
        type: asString(record.type) as "issue" | "comment",
      };
    }).filter((target) => target.id && (target.type === "issue" || target.type === "comment"))
    : [{ id: fallbackIssueId, type: "issue" as const }];
}

export async function deleteIssue(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const issueId = asUuid(payload.issueId);
  if (!issueId) return { success: true, issueId: "" };
  const { data, error } = await supabase.schema("app_api").rpc("backend_delete_issue_with_upload_targets", {
    issue_id: issueId,
    actor_uid: auth.uid,
    actor_is_admin: auth.isAdmin,
  });
  if (error) throw error;
  await queueAttachedUploadsForDeletion(supabase, uploadTargetsFromResult(data, issueId));
  return { success: true, issueId };
}
