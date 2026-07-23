import type { AppDatabaseClient } from "./database-client.ts";
import type { Database } from "./database.ts";
import { optionalEnv, requireEnv } from "./env.ts";
import { createMediaDeliveryUrl } from "./media-delivery.ts";

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
  "unable-to-handle": "無法處理",
};
const FACILITY_STATUS_LABELS: Record<string, string> = {
  pending: "待受理",
  processing: "處理中",
  completed: "已完成",
  "unable-to-handle": "無法處理",
};

type AppSupabase = AppDatabaseClient;
const NOTION_API_VERSION = "2026-03-11";
const knownSelectOptions = new Set<string>();
const knownDateProperties = new Set<string>();
const knownRichTextProperties = new Set<string>();
let discoveredDataSourceId: Promise<string> | undefined;
let cachedDataSource: Promise<Record<string, unknown>> | undefined;

function translateStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function translateFacilityStatus(status: string): string {
  return FACILITY_STATUS_LABELS[status] ?? status;
}

async function translateCategory(supabase: AppSupabase, targetType: string, category: string): Promise<string> {
  if (category === "公告") return "公告";
  const table = targetType === "facility" ? "facility_categories" : "issue_categories";
  const { data, error } = await supabase.schema("app_private").from(table)
    .select("label").eq("id", category).maybeSingle();
  if (error) throw error;
  return String(data?.label ?? category);
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

function normalizeNotionId(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

async function contentHash(content: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function notionEnabled(): boolean {
  if (optionalEnv("NOTION_ENABLED") === "false") return false;
  return Boolean(optionalEnv("NOTION_TOKEN") && optionalEnv("NOTION_DATABASE_ID"));
}

async function callNotionAPI(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Notion API error (${response.status}): ${await response.text()}`);
  }
  return response.status === 204 ? {} : response.json();
}

async function discoverDataSourceId(): Promise<string> {
  const configuredId = optionalEnv("NOTION_DATA_SOURCE_ID");
  if (configuredId) return configuredId;

  const database = await callNotionAPI(`/databases/${requireEnv("NOTION_DATABASE_ID")}`, "GET");
  const dataSources = isRecord(database) && Array.isArray(database.data_sources)
    ? database.data_sources.filter(isRecord)
    : [];
  const ids = dataSources
    .map((dataSource) => typeof dataSource.id === "string" ? dataSource.id : "")
    .filter(Boolean);
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error("Notion database has no accessible data source");
  throw new Error(
    "Notion database has multiple data sources; set NOTION_DATA_SOURCE_ID to select one",
  );
}

function getDataSourceId(): Promise<string> {
  discoveredDataSourceId ??= discoverDataSourceId().catch((error) => {
    discoveredDataSourceId = undefined;
    throw error;
  });
  return discoveredDataSourceId;
}

async function retrieveDataSource(): Promise<Record<string, unknown>> {
  cachedDataSource ??= (async () => {
    const dataSource = await callNotionAPI(`/data_sources/${await getDataSourceId()}`, "GET");
    if (!isRecord(dataSource)) throw new Error("Notion data source response is invalid");
    const parent = dataSource.parent;
    if (
      !isRecord(parent) ||
      typeof parent.database_id !== "string" ||
      normalizeNotionId(parent.database_id) !== normalizeNotionId(requireEnv("NOTION_DATABASE_ID"))
    ) {
      throw new Error("NOTION_DATA_SOURCE_ID does not belong to NOTION_DATABASE_ID");
    }
    return dataSource;
  })().catch((error) => {
    cachedDataSource = undefined;
    throw error;
  });
  return await cachedDataSource;
}

async function updateDataSourceProperties(properties: Record<string, unknown>): Promise<void> {
  await callNotionAPI(`/data_sources/${await getDataSourceId()}`, "PATCH", { properties });
  cachedDataSource = undefined;
}

async function ensureSelectOption(propertyName: "分類" | "狀態", label: string): Promise<void> {
  if (!label) return;
  const cacheKey = `${propertyName}:${label}`;
  if (knownSelectOptions.has(cacheKey)) return;
  const dataSource = await retrieveDataSource();
  if (!isRecord(dataSource.properties)) return;
  const property = dataSource.properties[propertyName];
  if (!isRecord(property) || property.type !== "select" || !isRecord(property.select)) return;
  const options = Array.isArray(property.select.options) ? property.select.options : [];
  if (options.some((option) => isRecord(option) && option.name === label)) {
    knownSelectOptions.add(cacheKey);
    return;
  }

  await updateDataSourceProperties({
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
  });
  knownSelectOptions.add(cacheKey);
}

async function ensureDateProperty(propertyName: string): Promise<void> {
  if (!propertyName || knownDateProperties.has(propertyName)) return;
  const dataSource = await retrieveDataSource();
  if (!isRecord(dataSource.properties)) return;
  const property = dataSource.properties[propertyName];
  if (isRecord(property) && property.type === "date") {
    knownDateProperties.add(propertyName);
    return;
  }

  await updateDataSourceProperties({ [propertyName]: { date: {} } });
  knownDateProperties.add(propertyName);
}

async function ensureRichTextProperty(propertyName: string): Promise<void> {
  if (!propertyName || knownRichTextProperties.has(propertyName)) return;
  const dataSource = await retrieveDataSource();
  if (!isRecord(dataSource.properties)) return;
  const property = dataSource.properties[propertyName];
  if (isRecord(property) && property.type === "rich_text") {
    knownRichTextProperties.add(propertyName);
    return;
  }
  await updateDataSourceProperties({ [propertyName]: { rich_text: {} } });
  knownRichTextProperties.add(propertyName);
}

function dateProperty(value: unknown) {
  return typeof value === "string" && value
    ? { date: { start: value } }
    : { date: null };
}

function richTextProperty(value: unknown) {
  const chunks = String(value ?? "").match(/[\s\S]{1,1900}/gu) ?? [];
  return {
    rich_text: chunks.map((content) => ({
      type: "text",
      text: { content },
    })),
  };
}

function issueTimeProperties(issue: Partial<Database["app_private"]["Tables"]["issues"]["Row"]>) {
  return {
    "提案時間": dateProperty(issue.created_at),
    "審核通過時間": dateProperty(issue.review_approved_at),
    "附議截止時間": dateProperty(issue.support_deadline_at),
    "附議達標時間": dateProperty(issue.support_met_at),
    "回覆期限": dateProperty(issue.response_deadline_at),
    "結案時間": dateProperty(issue.closed_at),
  };
}

async function ensureIssueTimeProperties() {
  await Promise.all(Object.keys(issueTimeProperties({})).map(ensureDateProperty));
}

async function updateIssueTimeProperties(
  pageId: string,
  issue: Partial<Database["app_private"]["Tables"]["issues"]["Row"]>,
) {
  await ensureIssueTimeProperties();
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: issueTimeProperties(issue),
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

const UPLOAD_PATTERN = /!\[([^\]]*)\]\(srp-upload:\/\/([0-9a-fA-F-]{36})\)/gu;
async function uploadImageToNotion(publicId: string, filename: string) {
  const sourceUrl = await createMediaDeliveryUrl(publicId, "full", true);
  const source = await fetch(sourceUrl.url, { signal: AbortSignal.timeout(15_000) });
  if (!source.ok) throw new Error("notion-image-source-failed");
  const bytes = await source.arrayBuffer();
  const created = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: JSON.stringify({ mode: "single_part", filename, content_type: "image/webp" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!created.ok) throw new Error(`notion-file-create:${created.status}`);
  const upload = await created.json() as { id?: string };
  if (!upload.id) throw new Error("notion-file-id-missing");
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/webp" }), filename);
  const sent = await fetch(`https://api.notion.com/v1/file_uploads/${upload.id}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Notion-Version": NOTION_API_VERSION,
    },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!sent.ok) throw new Error(`notion-file-send:${sent.status}`);
  return upload.id;
}

function textBlocks(content: string) {
  const text = content.replace(UPLOAD_PATTERN, "").trim();
  const chunks = text.match(/[\s\S]{1,1900}/gu) ?? [];
  return chunks.map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: chunk } }] },
  }));
}

async function replaceManagedContent(
  supabase: AppSupabase,
  targetType: string,
  targetId: string,
  pageId: string,
  content: string,
) {
  const nextContentHash = await contentHash(content);
  const { data: mapping, error } = await supabase.schema("app_private").from("notion_pages")
    .select("managed_block_ids,content_hash").eq("target_type", targetType).eq("target_id", targetId).single();
  if (error) throw error;
  if (mapping.content_hash === nextContentHash) return;
  const oldIds = Array.isArray(mapping.managed_block_ids)
    ? mapping.managed_block_ids.filter((id): id is string => typeof id === "string")
    : [];
  for (let offset = 0; offset < oldIds.length; offset += 10) {
    await Promise.all(oldIds.slice(offset, offset + 10).map((id) => callNotionAPI(`/blocks/${id}`, "DELETE")));
  }

  const uploadMatches = [...content.matchAll(UPLOAD_PATTERN)];
  const uploadIds = uploadMatches.map((match) => match[2]).filter(Boolean);
  const { data: uploads, error: uploadError } = uploadIds.length
    ? await supabase.schema("app_private").from("uploads")
      .select("id,cloudinary_public_id").in("id", uploadIds).in("status", ["ready", "attached"])
    : { data: [], error: null };
  if (uploadError) throw uploadError;
  const publicIds = new Map((uploads ?? []).map((upload) => [upload.id, upload.cloudinary_public_id]));
  const imageBlocks = [];
  for (const [index, match] of uploadMatches.entries()) {
    const publicId = publicIds.get(match[2]);
    if (!publicId) continue;
    const fileUploadId = await uploadImageToNotion(publicId, `${targetType}-${targetId}-${index + 1}.webp`);
    imageBlocks.push({
      object: "block",
      type: "image",
      image: {
        type: "file_upload",
        file_upload: { id: fileUploadId },
        caption: match[1] ? [{ type: "text", text: { content: match[1].slice(0, 500) } }] : [],
      },
    });
  }
  const blocks = [...textBlocks(content), ...imageBlocks];
  const createdIds: string[] = [];
  for (let offset = 0; offset < blocks.length; offset += 100) {
    const response = await callNotionAPI(`/blocks/${pageId}/children`, "PATCH", {
      children: blocks.slice(offset, offset + 100),
    }) as { results?: Array<{ id?: string }> };
    createdIds.push(...(response.results ?? []).map((block) => block.id ?? "").filter(Boolean));
  }
  const { error: updateError } = await supabase.schema("app_private").from("notion_pages")
    .update({
      content_hash: nextContentHash,
      managed_block_ids: createdIds,
      updated_at: new Date().toISOString(),
    })
    .eq("target_type", targetType).eq("target_id", targetId);
  if (updateError) throw updateError;
}

function appendContentSection(parts: string[], label: string, value: unknown) {
  const content = String(value ?? "").trim();
  if (content) parts.push(`【${label}】\n${content}`);
}

async function buildIssueManagedContent(
  supabase: AppSupabase,
  targetId: string,
  issue: Partial<Database["app_private"]["Tables"]["issues"]["Row"]>,
) {
  const parts = [String(issue.content ?? "").trim()].filter(Boolean);
  appendContentSection(parts, "審核未通過原因", issue.review_rejection_reason);
  appendContentSection(parts, "提案結果", issue.result_content);

  const { data: comments, error: commentsError } = await supabase
    .schema("app_private")
    .from("comments")
    .select("id,author_uid,content,created_at")
    .eq("issue_id", targetId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (commentsError) throw commentsError;
  if (!comments?.length) return parts.join("\n\n");

  const authorUids = [...new Set(comments.map((comment) => String(comment.author_uid)).filter(Boolean))];
  const { data: profiles, error: profilesError } = authorUids.length
    ? await supabase.schema("app_private").from("user_profiles")
      .select("uid,display_name").in("uid", authorUids)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const displayNames = new Map(
    (profiles ?? []).map((profile) => [String(profile.uid), String(profile.display_name)]),
  );
  const commentLines = comments.map((comment) => {
    const uid = String(comment.author_uid);
    const authorName = (displayNames.get(uid) ?? uid) || "使用者";
    return `${String(comment.created_at)} | ${authorName}：${String(comment.content)}`;
  });
  appendContentSection(parts, "留言", commentLines.join("\n\n"));
  return parts.join("\n\n");
}

function buildFacilityManagedContent(
  facility: Partial<Database["app_private"]["Tables"]["facility_reports"]["Row"]>,
) {
  const parts = [String(facility.content ?? "").trim()].filter(Boolean);
  appendContentSection(parts, "地點", facility.location);
  appendContentSection(parts, "處理結果", facility.result_content);
  return parts.join("\n\n");
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
  countProperty = "附議數",
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

  const categoryLabel = await translateCategory(supabase, targetType, category);
  const statusLabel = translateStatus(status);
  await Promise.all([
    ensureSelectOption("分類", categoryLabel),
    ensureSelectOption("狀態", statusLabel),
    ensureRichTextProperty(countProperty),
  ]);

  const result = await callNotionAPI("/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: await getDataSourceId() },
    properties: {
      "名稱": { title: [{ text: { content: title } }] },
      "分類": { select: { name: categoryLabel } },
      "狀態": { select: { name: statusLabel } },
      "作者": { rich_text: [{ text: { content: authorName } }] },
      [countProperty]: { rich_text: [{ text: { content: supportLabel(supportCount, supportGoal) } }] },
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

async function resolveDisplayName(supabase: AppSupabase, uid: unknown) {
  const normalizedUid = typeof uid === "string" ? uid : "";
  if (!normalizedUid) return "使用者";
  const { data, error } = await supabase.schema("app_private").from("user_profiles")
    .select("display_name").eq("uid", normalizedUid).maybeSingle();
  if (error) throw error;
  return String(data?.display_name ?? normalizedUid);
}

/**
 * Mark a Notion page as deleted by setting its 狀態 to 已刪除.
 * Called when the target content is deleted from the platform.
 */
export async function markNotionPageDeleted(pageId: string): Promise<void> {
  if (!notionEnabled()) return;
  await ensureSelectOption("狀態", "已刪除");
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: { "狀態": { select: { name: "已刪除" } } },
  });
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
    .select("title, content, category, status, author_uid, support_count, support_goal, review_rejection_reason, result_content, created_at, review_approved_at, support_deadline_at, support_met_at, response_deadline_at, closed_at")
    .eq("id", targetId)
    .maybeSingle();

  const authorName = await resolveDisplayName(supabase, issue?.author_uid ?? payload.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? payload.title ?? "未命名提案"),
    String(issue?.category ?? payload.category ?? "公共議題"),
    String(issue?.status ?? "pending"),
    authorName,
    issue?.support_count ?? payload.support_count,
    issue?.support_goal ?? payload.support_goal,
  );
  if (pageId) {
    await updateIssueTimeProperties(pageId, issue ?? {});
    await Promise.all([
      ensureRichTextProperty("審核未通過原因"),
      ensureRichTextProperty("提案結果"),
    ]);
    await callNotionAPI(`/pages/${pageId}`, "PATCH", {
      properties: {
        "審核未通過原因": richTextProperty(issue?.review_rejection_reason),
        "提案結果": richTextProperty(issue?.result_content),
      },
    });
    await replaceManagedContent(
      supabase,
      "issue",
      targetId,
      pageId,
      await buildIssueManagedContent(supabase, targetId, {
        ...issue,
        content: issue?.content ?? String(payload.content ?? ""),
      }),
    );
  }
}

export async function syncFacilityCreatedToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;
  const { data: facility, error } = await supabase.schema("app_private").from("facility_reports")
    .select("title,content,location,status,author_uid,affected_count,category_id,created_at,started_at,closed_at,result_content")
    .eq("id", targetId).maybeSingle();
  if (error) throw error;
  if (!facility) return;
  const authorName = await resolveDisplayName(supabase, facility.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase, "facility", targetId, String(facility.title ?? payload.title ?? "設備"),
    String(facility.category_id), translateFacilityStatus(String(facility.status)), authorName, facility.affected_count, null, "遇到人數",
  );
  if (!pageId) return;
  await Promise.all([ensureRichTextProperty("地點"), ...["建立時間", "開始處理時間", "結案時間"].map(ensureDateProperty)]);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", { properties: {
    "地點": richTextProperty(facility.location),
    "建立時間": dateProperty(facility.created_at),
    "開始處理時間": dateProperty(facility.started_at),
    "結案時間": dateProperty(facility.closed_at),
  } });
  await replaceManagedContent(
    supabase,
    "facility",
    targetId,
    pageId,
    buildFacilityManagedContent(facility),
  );
}

export async function syncFacilityStatusToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;
  const { data: facility, error } = await supabase.schema("app_private").from("facility_reports")
    .select("title,content,location,status,author_uid,affected_count,category_id,created_at,started_at,closed_at,result_content")
    .eq("id", targetId).maybeSingle();
  if (error) throw error;
  if (!facility) return;
  const terminal = ["completed", "unable-to-handle"].includes(String(facility.status));
  if (!terminal) return;
  const authorName = await resolveDisplayName(supabase, facility.author_uid);
  const pageId = await getOrCreateNotionPage(supabase, "facility", targetId, String(facility.title), String(facility.category_id),
    translateFacilityStatus(String(facility.status)), authorName, 1, null, "遇到人數");
  if (!pageId) return;
  const statusLabel = translateFacilityStatus(String(facility.status));
  await Promise.all([
    ensureSelectOption("狀態", statusLabel), ensureRichTextProperty("處理結果"), ensureRichTextProperty("遇到人數"),
    ...["建立時間", "開始處理時間", "結案時間"].map(ensureDateProperty),
  ]);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", { properties: {
    "狀態": { select: { name: statusLabel } },
    "建立時間": dateProperty(facility.created_at),
    "開始處理時間": dateProperty(facility.started_at),
    "結案時間": dateProperty(facility.closed_at),
    "遇到人數": { rich_text: [{ text: { content: String(facility.affected_count) } }] },
    "處理結果": richTextProperty(facility.result_content ?? payload.result_content),
  } });
  await replaceManagedContent(
    supabase,
    "facility",
    targetId,
    pageId,
    buildFacilityManagedContent(facility),
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
    .select("title, content, category, author_uid, support_count, support_goal, review_rejection_reason, result_content, created_at, review_approved_at, support_deadline_at, support_met_at, response_deadline_at, closed_at")
    .eq("id", targetId)
    .maybeSingle();

  const authorName = await resolveDisplayName(supabase, issue?.author_uid ?? payload.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? payload.title ?? "提案"),
    String(issue?.category ?? "公共議題"),
    newStatus,
    authorName,
    issue?.support_count ?? payload.support_count,
    issue?.support_goal ?? payload.support_goal,
  );
  if (!pageId) return;

  await Promise.all([
    ensureSelectOption("狀態", newStatusLabel),
    ensureIssueTimeProperties(),
    ensureRichTextProperty("審核未通過原因"),
    ensureRichTextProperty("提案結果"),
    ensureRichTextProperty("附議數"),
  ]);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: {
      "狀態": { select: { name: newStatusLabel } },
      "附議數": richTextProperty(
        supportLabel(
          issue?.support_count ?? payload.support_count,
          issue?.support_goal ?? payload.support_goal,
        ),
      ),
      "審核未通過原因": richTextProperty(issue?.review_rejection_reason ?? payload.reason),
      "提案結果": richTextProperty(issue?.result_content),
      ...issueTimeProperties(issue ?? {}),
    },
  });
  await replaceManagedContent(
    supabase,
    "issue",
    targetId,
    pageId,
    await buildIssueManagedContent(supabase, targetId, issue ?? {
      review_rejection_reason: String(payload.reason ?? ""),
    }),
  );
  const oldLabel = oldStatus ? `${translateStatus(oldStatus)} → ` : "";
  await appendBlock(pageId, `【狀態更新】${oldLabel}${newStatusLabel}`);
}

export async function syncIssueSupportToNotion(
  supabase: AppSupabase,
  targetId: string,
  options: { appendTimeline?: boolean } = {},
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: issue } = await supabase
    .schema("app_private")
    .from("issues")
    .select("title, category, status, author_uid, support_count, support_goal, created_at, review_approved_at, support_deadline_at, support_met_at, response_deadline_at, closed_at")
    .eq("id", targetId)
    .maybeSingle();

  const authorName = await resolveDisplayName(supabase, issue?.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? "提案"),
    String(issue?.category ?? "公共議題"),
    String(issue?.status ?? "pending"),
    authorName,
    issue?.support_count,
    issue?.support_goal,
  );
  if (!pageId) return;

  const label = supportLabel(issue?.support_count, issue?.support_goal);
  await ensureIssueTimeProperties();
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: {
      "附議數": { rich_text: [{ text: { content: label } }] },
      ...issueTimeProperties(issue ?? {}),
    },
  });
  if (options.appendTimeline !== false) {
    await appendBlock(pageId, `【附議更新】目前附議數：${label}`);
  }
}

export async function syncIssueResultUpdatedToNotion(
  supabase: AppSupabase,
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!notionEnabled()) return;

  const { data: issue } = await supabase
    .schema("app_private")
    .from("issues")
    .select("title, content, category, status, author_uid, support_count, support_goal, review_rejection_reason, result_content, created_at, review_approved_at, support_deadline_at, support_met_at, response_deadline_at, closed_at")
    .eq("id", targetId)
    .maybeSingle();

  const authorName = await resolveDisplayName(supabase, issue?.author_uid ?? payload.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase,
    "issue",
    targetId,
    String(issue?.title ?? payload.title ?? "提案"),
    String(issue?.category ?? "公共議題"),
    String(issue?.status ?? "pending"),
    authorName,
    issue?.support_count ?? payload.support_count,
    issue?.support_goal ?? payload.support_goal,
  );
  if (!pageId) return;

  await Promise.all([
    updateIssueTimeProperties(pageId, issue ?? {}),
    ensureRichTextProperty("提案結果"),
  ]);
  await callNotionAPI(`/pages/${pageId}`, "PATCH", {
    properties: {
      "提案結果": richTextProperty(issue?.result_content ?? payload.result_content),
    },
  });
  await replaceManagedContent(
    supabase,
    "issue",
    targetId,
    pageId,
    await buildIssueManagedContent(supabase, targetId, issue ?? {
      result_content: String(payload.result_content ?? ""),
    }),
  );
  await appendBlock(pageId, `【結果更新】${String(issue?.result_content ?? payload.result_content ?? "").slice(0, 150)}`);
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
    .select("title,content,author_uid")
    .eq("id", targetId)
    .maybeSingle();

  const authorName = await resolveDisplayName(supabase, announcement?.author_uid ?? payload.author_uid);
  const pageId = await getOrCreateNotionPage(
    supabase,
    "announcement",
    targetId,
    String(announcement?.title ?? payload.title ?? "未命名公告"),
    "公告",
    "發布",
    authorName,
    0,
    null,
  );
  if (pageId) {
    await callNotionAPI(`/pages/${pageId}`, "PATCH", {
      properties: {
        "名稱": { title: [{ text: { content: String(announcement?.title ?? payload.title ?? "未命名公告") } }] },
        "作者": { rich_text: [{ text: { content: authorName } }] },
      },
    });
    await replaceManagedContent(
      supabase,
      "announcement",
      targetId,
      pageId,
      String(announcement?.content ?? payload.content ?? ""),
    );
  }
}
