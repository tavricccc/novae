import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "./database.ts";
import { optionalEnv, requireEnv } from "./env.ts";
import { getIssueCategoryLabel } from "./issue-categories.ts";

// ---------------------------------------------------------------------------
// Status label translation (matches ISSUE_STATUS_LABELS in src/constants/statuses.ts)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  "pending": "未回覆",
  "under-review": "待審核",
  "processing": "處理中",
  "auto-rejected": "未通過",
  "review-rejected": "審核未通過",
  "infeasible": "無法實行",
  "completed": "已完成",
  "已刪除": "已刪除",
  "發布": "發布",
};

type AppSupabase = SupabaseClient<Database>;

function translateStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function translateCategory(category: string): string {
  if (category === "公告") return "公告";
  return getIssueCategoryLabel(category);
}

function supportLabel(supportCount: unknown, supportGoal: unknown): string {
  const count = typeof supportCount === "number" ? supportCount : Number(supportCount ?? 0);
  const goal = typeof supportGoal === "number" ? supportGoal : Number(supportGoal ?? 0);
  if (!Number.isFinite(count)) return "0";
  if (!Number.isFinite(goal) || goal <= 0) return String(count);
  return `${count}/${goal}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function notionEnabled(): boolean {
  return Boolean(optionalEnv("NOTION_TOKEN") && optionalEnv("NOTION_DATABASE_ID"));
}

async function callNotionAPI(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Content-Type": "application/json",
      "Notion-Version": optionalEnv("NOTION_VERSION") || "2022-06-28",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Notion API error (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function ensureSelectOption(propertyName: "分類" | "狀態", label: string): Promise<void> {
  if (!label) return;
  const database = await callNotionAPI(`/databases/${requireEnv("NOTION_DATABASE_ID")}`, "GET");
  if (!isRecord(database) || !isRecord(database.properties)) return;
  const property = database.properties[propertyName];
  if (!isRecord(property) || property.type !== "select" || !isRecord(property.select)) return;
  const options = Array.isArray(property.select.options) ? property.select.options : [];
  if (options.some((option) => isRecord(option) && option.name === label)) return;

  await callNotionAPI(`/databases/${requireEnv("NOTION_DATABASE_ID")}`, "PATCH", {
    properties: {
      [propertyName]: {
        select: {
          options: [
            ...options
              .filter(isRecord)
              .map((option) => ({
                name: String(option.name ?? ""),
                color: typeof option.color === "string" ? option.color : "default",
              }))
              .filter((option) => option.name),
            { name: label, color: "default" },
          ],
        },
      },
    },
  });
}

/** Append a single paragraph block to a Notion page. */
function appendBlock(pageId: string, content: string): Promise<unknown> {
  return callNotionAPI(`/blocks/${pageId}/children`, "PATCH", {
    children: [{
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ text: { content } }] },
    }],
  });
}

/**
 * Return the existing Notion page ID for a target, or create a new page in the
 * configured database and record it in app_private.notion_pages.
 */
async function getOrCreateNotionPage(
  supabase: AppSupabase,
  targetType: string,
  targetId: string,
  title: string,
  category: string,
  status: string,
  authorName: string,
  supportCount?: unknown,
  supportGoal?: unknown,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("app_private")
    .from("notion_pages")
    .select("notion_page_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();
  if (error) throw error;
  if (data?.notion_page_id) return String(data.notion_page_id);

  const categoryLabel = translateCategory(category);
  const statusLabel = translateStatus(status);
  await Promise.all([
    ensureSelectOption("分類", categoryLabel),
    ensureSelectOption("狀態", statusLabel),
  ]);

  const result = await callNotionAPI("/pages", "POST", {
    parent: { database_id: requireEnv("NOTION_DATABASE_ID") },
    properties: {
      "名稱": { title: [{ text: { content: title } }] },
      "分類": { select: { name: categoryLabel } },
      "狀態": { select: { name: statusLabel } },
      "作者": { rich_text: [{ text: { content: authorName } }] },
      "附議數": { rich_text: [{ text: { content: supportLabel(supportCount, supportGoal) } }] },
    },
  }) as { id?: string };

  const pageId = result?.id;
  if (!pageId) throw new Error("Notion page creation did not return an ID");

  const { error: insertError } = await supabase
    .schema("app_private")
    .from("notion_pages")
    .insert({ target_type: targetType, target_id: targetId, notion_page_id: pageId });
  if (insertError) throw insertError;

  return pageId;
}

// ---------------------------------------------------------------------------
// Public API — called from outboxWorker
// ---------------------------------------------------------------------------

/**
 * Mark a Notion page as deleted by setting its 狀態 to 已刪除.
 * Called when the target content is deleted from the platform.
 */
export async function markNotionPageDeleted(pageId: string): Promise<void> {
  if (!optionalEnv("NOTION_TOKEN")) return;
  await ensureSelectOption("狀態", "已刪除");

  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Content-Type": "application/json",
      "Notion-Version": optionalEnv("NOTION_VERSION") || "2022-06-28",
    },
    body: JSON.stringify({ properties: { "狀態": { select: { name: "已刪除" } } } }),
  });

  if (!response.ok) {
    throw new Error(`Notion delete mark failed: ${response.status} ${await response.text()}`);
  }
}

/**
 * Create a Notion page when a new issue is submitted.
 * Queries the issues table to get full issue details.
 */
export async function syncIssueCreatedToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: issue } = await supabase
    .schema("app_private")
    .from("issues")
    .select("title, category, status, author_name, support_count, support_goal")
    .eq("id", targetId)
    .maybeSingle();

  await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? payload.title ?? "未命名提案"),
    String(issue?.category ?? payload.category ?? "公共議題"),
    String(issue?.status ?? "pending"),
    String(issue?.author_name ?? "匿名使用者"),
    issue?.support_count ?? payload.support_count,
    issue?.support_goal ?? payload.support_goal,
  );
}

/**
 * Update the 狀態 property on the Notion page and append a timeline entry
 * when an admin changes the issue status.
 */
export async function syncIssueStatusChangedToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;

  const oldStatus = String(payload.old_status ?? "");
  const newStatus = String(payload.new_status ?? "");
  if (!newStatus) return;
  const newStatusLabel = translateStatus(newStatus);

  const { data: issue } = await supabase
    .schema("app_private")
    .from("issues")
    .select("title, category, author_name, support_count, support_goal")
    .eq("id", targetId)
    .maybeSingle();

  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? payload.title ?? "提案"),
    String(issue?.category ?? "公共議題"),
    newStatus,
    String(issue?.author_name ?? "匿名使用者"),
    issue?.support_count ?? payload.support_count,
    issue?.support_goal ?? payload.support_goal,
  );
  if (!pageId) return;

  await ensureSelectOption("狀態", newStatusLabel);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: {
      "狀態": { select: { name: newStatusLabel } },
      "附議數": { rich_text: [{ text: { content: supportLabel(issue?.support_count ?? payload.support_count, issue?.support_goal ?? payload.support_goal) } }] },
    },
  });
  const oldLabel = oldStatus ? `${translateStatus(oldStatus)} → ` : "";
  await appendBlock(pageId, `【狀態更新】${oldLabel}${newStatusLabel}`);
}

export async function syncIssueSupportToNotion(
  supabase: AppSupabase,
  targetId: string,
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: issue } = await supabase
    .schema("app_private")
    .from("issues")
    .select("title, category, status, author_name, support_count, support_goal")
    .eq("id", targetId)
    .maybeSingle();

  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? "提案"),
    String(issue?.category ?? "公共議題"),
    String(issue?.status ?? "pending"),
    String(issue?.author_name ?? "匿名使用者"),
    issue?.support_count,
    issue?.support_goal,
  );
  if (!pageId) return;

  const label = supportLabel(issue?.support_count, issue?.support_goal);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: { "附議數": { rich_text: [{ text: { content: label } }] } },
  });
  await appendBlock(pageId, `【附議更新】目前附議數：${label}`);
}

/**
 * Append the newest comment to the Notion page for an issue.
 * Queries the comments table to get the latest comment content.
 * Skips silently if the issue has no Notion page yet.
 */
export async function syncIssueCommentToNotion(
  supabase: AppSupabase,
  targetId: string,
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: pageRow } = await supabase
    .schema("app_private")
    .from("notion_pages")
    .select("notion_page_id")
    .eq("target_type", "issue")
    .eq("target_id", targetId)
    .maybeSingle();
  if (!pageRow?.notion_page_id) return;

  const { data: comment } = await supabase
    .schema("app_private")
    .from("comments")
    .select("author_name, content")
    .eq("issue_id", targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const authorName = String(comment?.author_name ?? "使用者");
  const contentPreview = String(comment?.content ?? "").slice(0, 150);

  await appendBlock(
    String(pageRow.notion_page_id),
    `【新增留言】${authorName}：${contentPreview}`,
  );
}

/**
 * Create a Notion page when a new announcement is published.
 */
export async function syncAnnouncementCreatedToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: announcement } = await supabase
    .schema("app_private")
    .from("announcements")
    .select("title, author_name")
    .eq("id", targetId)
    .maybeSingle();

  await getOrCreateNotionPage(
    supabase,
    "announcement",
    targetId,
    String(announcement?.title ?? payload.title ?? "未命名公告"),
    "公告",
    "發布",
    String(announcement?.author_name ?? "管理員"),
    0,
    null,
  );
}
