import { createClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/database.ts";
import { deleteCloudinaryAsset } from "../_shared/cloudinary.ts";
import { requireEnv } from "../_shared/env.ts";
import { errorMessage, jsonResponse, requireMethod } from "../_shared/http.ts";
import { markNotionPageDeleted } from "../_shared/notion.ts";
import { requireBearerSecret } from "../_shared/webhook.ts";

interface DeletionJob {
  id: string;
  cloudinary_public_id?: string | null;
  notion_page_id?: string | null;
  target_id: string;
  target_type: string;
}

Deno.serve(async (request) => {
  const methodFailure = requireMethod(request, "POST");
  if (methodFailure) return methodFailure;

  const authFailure = requireBearerSecret(request);
  if (authFailure) return authFailure;

  try {
    const supabase = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .schema("app_api")
      .rpc("claim_deletion_jobs", { batch_size: 50 });

    if (error) throw error;

    const jobs = (data ?? []) as DeletionJob[];
    for (const job of jobs) {
      try {
        if (job.cloudinary_public_id) {
          await deleteCloudinaryAsset(job.cloudinary_public_id);
        }
        if (job.notion_page_id) {
          await markNotionPageDeleted(job.notion_page_id);
        }
        const { error: completeError } = await supabase
          .schema("app_api")
          .rpc("complete_deletion_job", { job_id: job.id });
        if (completeError) throw completeError;
      } catch (error) {
        const { error: failError } = await supabase
          .schema("app_api")
          .rpc("fail_deletion_job", {
            job_id: job.id,
            error_message: errorMessage(error),
          });
        if (failError) throw failError;
      }
    }

    return jsonResponse({ ok: true, processedCount: jobs.length });
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
});
