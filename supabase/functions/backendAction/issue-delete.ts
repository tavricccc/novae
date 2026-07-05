import { asString } from "../_shared/http.ts";
import { selectIssue } from "./issue-shared.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";

export async function deleteIssue(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  const issue = await selectIssue(supabase, asString(payload.issueId));
  const issueId = asString(issue.id);
  if (asString(issue.author_uid) !== auth.uid && !auth.isAdmin) throw new Error("permission-denied");
  const { error: outboxError } = await supabase.schema("app_private").from("outbox_events").insert({
    event_type: "issue.deleted",
    target_type: "issue",
    target_id: issueId,
    actor_uid: auth.uid,
    payload: { author_uid: issue.author_uid, issue_category: issue.category, issue_id: issueId, title: issue.title },
  });
  if (outboxError) throw outboxError;
  const { error } = await supabase.schema("app_private").from("issues").delete().eq("id", issueId);
  if (error) throw error;
  return { success: true, issueId };
}
