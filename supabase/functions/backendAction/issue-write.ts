import { createIssue } from "./issue-create.ts";
import { deleteIssue } from "./issue-delete.ts";
import { moderateIssueStatus, updateIssueResult } from "./issue-moderation.ts";
import { updateSupport } from "./issue-support.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";

export function isIssueWriteAction(action: string) {
  return action === "createIssue"
    || action === "moderateIssueStatus"
    || action === "updateIssueResult"
    || action === "toggleSupport"
    || action === "removeSupport"
    || action === "deleteIssue";
}

export async function handleIssueWriteAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "createIssue") return createIssue(payload, auth, supabase);
  if (action === "moderateIssueStatus") return moderateIssueStatus(payload, auth, supabase);
  if (action === "updateIssueResult") return updateIssueResult(payload, auth, supabase);
  if (action === "toggleSupport" || action === "removeSupport") return updateSupport(action, payload, auth, supabase);
  if (action === "deleteIssue") return deleteIssue(payload, auth, supabase);
  throw new Error("unsupported-action");
}
