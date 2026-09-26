import { requireEnv, optionalEnv } from "./env.ts";
import { createMediaDeliveryUrl } from "./media-delivery.ts";

/**
 * The Notion HTTP boundary: how a request is made, what a property looks like,
 * and how the database's own schema is grown to hold one.
 *
 * Everything above this file talks about proposals and audit entries. This file
 * is the only place that knows the shape of Notion's API, which of its columns
 * have been created in this isolate already, and how a block of text or an
 * image gets onto a page without being written twice.
 */
const NOTION_API_VERSION = "2026-03-11";
const knownSelectOptions = new Set<string>();
const knownDateProperties = new Set<string>();
const knownRichTextProperties = new Set<string>();
const knownNumberProperties = new Set<string>();
let discoveredDataSourceId: Promise<string> | undefined;
export function notionEnabled(): boolean {
  if (optionalEnv("NOTION_ENABLED") === "false") return false;
  return Boolean(optionalEnv("NOTION_TOKEN") && optionalEnv("NOTION_DATABASE_ID"));
}
export function notionBaseUrl(): string {
  const base = optionalEnv("NOTION_API_BASE_URL") || "https://api.notion.com";
  return base.replace(/\/+$/u, "");
}
/** A refusal from Notion, with the code it named, so a caller can read it. */
export class NotionApiError extends Error {
  constructor(readonly status: number, readonly code: string, body: string) {
    super(`Notion API error (${status}): ${body}`);
    this.name = "NotionApiError";
  }
}

/**
 * Whether Notion refused because the page a request names is no longer there:
 * deleted outright, or already in the trash and no longer writable.
 */
export function notionPageGone(error: unknown): boolean {
  if (!(error instanceof NotionApiError)) return false;
  if (error.status === 404 || error.code === "object_not_found") return true;
  return error.status === 400 && /archiv|trash/iu.test(error.message);
}

/** Notion names its refusals in a `code` field; an outage page names nothing. */
function notionErrorCode(body: string): string {
  return /"code"\s*:\s*"([a-z_]+)"/u.exec(body)?.[1] ?? "";
}

/**
 * Notion accepts roughly three requests a second and refuses everything above
 * that, so every call made by this isolate starts a fixed gap after the one
 * before it instead of all of them leaving at once. A rebuild writes hundreds
 * of pages in a row; unpaced, it spent most of its attempts being refused.
 */
const NOTION_REQUEST_SPACING_MS = 350;
const NOTION_REFUSAL_RETRIES = 5;
let notionTurn: Promise<void> = Promise.resolve();
let requestsMade = 0;
let invocationRequestLimit = Number.POSITIVE_INFINITY;

export class NotionInvocationBudgetExceeded extends Error {
  constructor() {
    super("notion-invocation-request-budget-exhausted");
    this.name = "NotionInvocationBudgetExceeded";
  }
}

/**
 * What this Worker invocation has spent of its outgoing-request allowance.
 *
 * Work that writes a record at a time cannot tell how many requests the next
 * record will need -- a proposal costs a request for its page, one for each
 * image and one for every hundred blocks of discussion -- so work that can stop
 * and resume reads this before starting another one.
 */
export function notionRequestsMade(): number {
  return requestsMade;
}

/**
 * Starts the count again for a new Worker invocation.
 *
 * The allowance belongs to one invocation, but this module lives as long as the
 * isolate behind it, so a counter that only ever grew said nothing about what
 * the invocation now running had spent. A sweep begins by clearing it, and
 * everything the sweep does afterwards -- the deliveries it carries as much as
 * the rebuild it advances -- is counted against the same allowance.
 */
export function beginNotionInvocation(requestLimit = Number.POSITIVE_INFINITY): void {
  requestsMade = 0;
  invocationRequestLimit = requestLimit;
}

function countedFetch(url: string, init: RequestInit): Promise<Response> {
  if (requestsMade >= invocationRequestLimit) throw new NotionInvocationBudgetExceeded();
  requestsMade += 1;
  return fetch(url, init);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Takes the next turn on the wire, releasing the one after it a gap later. */
async function pacedFetch(url: string, init: RequestInit): Promise<Response> {
  const ready = notionTurn;
  let release = () => {};
  notionTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  await ready;
  setTimeout(release, NOTION_REQUEST_SPACING_MS);
  // Queueing and Retry-After are not time spent waiting on the network. Start
  // a fresh deadline only once this attempt can actually leave the isolate.
  return countedFetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
}

export async function callNotionAPI(path: string, method: string, body?: unknown): Promise<unknown> {
  const base = notionBaseUrl();
  const url = path.startsWith("http") ? path : `${base}/v1${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  for (let attempt = 0; ; attempt += 1) {
    const response = await pacedFetch(url, init);
    if (!response.ok) {
      const failure = await response.text();
      // A refusal for going too fast names how long to wait, and waiting is the
      // whole answer to it -- it is not a failure of the work being done.
      if (response.status === 429 && attempt < NOTION_REFUSAL_RETRIES) {
        const namedWait = Number(response.headers.get("Retry-After"));
        await sleep(Number.isFinite(namedWait) && namedWait > 0
          ? namedWait * 1000
          : NOTION_REQUEST_SPACING_MS * (attempt + 2));
        continue;
      }
      throw new NotionApiError(response.status, notionErrorCode(failure), failure);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}
export async function getDataSourceId(): Promise<string> {
  const configured = optionalEnv("NOTION_DATA_SOURCE_ID");
  if (configured) return configured;
  if (discoveredDataSourceId) return discoveredDataSourceId;
  discoveredDataSourceId = (async () => {
    const databaseId = requireEnv("NOTION_DATABASE_ID");
    const db = (await callNotionAPI(`/databases/${databaseId}`, "GET")) as {
      data_sources?: Array<{ id?: string }>;
    };
    const firstId = db.data_sources?.[0]?.id;
    if (!firstId) throw new Error("notion-data-source-missing");
    return firstId;
  })().catch((error: unknown) => {
    // A transient discovery failure must not poison every subsequent job in this isolate.
    discoveredDataSourceId = undefined;
    throw error;
  });
  return discoveredDataSourceId;
}
export function richTextProperty(value: unknown) {
  const content = String(value ?? "").trim();
  return {
    rich_text: content ? [{ type: "text", text: { content: content.slice(0, 2000) } }] : [],
  };
}
export function dateProperty(value: unknown) {
  if (!value) return { date: null };
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return { date: null };
  return { date: { start: parsed.toISOString() } };
}
export function numberProperty(value: unknown) {
  const parsed = Number(value);
  return { number: Number.isFinite(parsed) ? parsed : null };
}
export async function ensureSelectOption(propertyName: string, optionName: string): Promise<void> {
  if (!optionName) return;
  const key = `${propertyName}:${optionName}`;
  if (knownSelectOptions.has(key)) return;
  const dataSourceId = await getDataSourceId();
  await callNotionAPI(`/data_sources/${dataSourceId}`, "PATCH", {
    properties: {
      [propertyName]: { select: { options: [{ name: optionName }] } },
    },
  });
  knownSelectOptions.add(key);
}
export async function ensureRichTextProperty(propertyName: string): Promise<void> {
  if (knownRichTextProperties.has(propertyName)) return;
  const dataSourceId = await getDataSourceId();
  await callNotionAPI(`/data_sources/${dataSourceId}`, "PATCH", {
    properties: { [propertyName]: { rich_text: {} } },
  });
  knownRichTextProperties.add(propertyName);
}
export async function ensureNumberProperty(propertyName: string): Promise<void> {
  if (knownNumberProperties.has(propertyName)) return;
  const dataSourceId = await getDataSourceId();
  await callNotionAPI(`/data_sources/${dataSourceId}`, "PATCH", {
    properties: { [propertyName]: { number: { format: "number" } } },
  });
  knownNumberProperties.add(propertyName);
}
export async function ensureDateProperty(propertyName: string): Promise<void> {
  if (knownDateProperties.has(propertyName)) return;
  const dataSourceId = await getDataSourceId();
  await callNotionAPI(`/data_sources/${dataSourceId}`, "PATCH", {
    properties: { [propertyName]: { date: {} } },
  });
  knownDateProperties.add(propertyName);
}
export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}
export function getBlockPlainText(block: NotionBlock): string {
  const type = typeof block.type === "string" ? block.type : "";
  const sub = block[type];
  if (sub && typeof sub === "object" && "rich_text" in sub && Array.isArray(sub.rich_text)) {
    return sub.rich_text
      .map((item: { plain_text?: string; text?: { content?: string } }) => item.plain_text ?? item.text?.content ?? "")
      .join("");
  }
  return "";
}
export async function fetchAllBlockChildren(pageId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let startCursor: string | undefined = undefined;
  let hasMore = true;
  while (hasMore) {
    const url = `/blocks/${pageId}/children?page_size=100${startCursor ? `&start_cursor=${startCursor}` : ""}`;
    const response = (await callNotionAPI(url, "GET")) as {
      results?: NotionBlock[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    if (Array.isArray(response.results)) {
      blocks.push(...response.results);
    }
    hasMore = Boolean(response.has_more && response.next_cursor);
    startCursor = response.next_cursor ?? undefined;
  }
  return blocks;
}
export async function uploadImageToNotion(publicId: string, filename: string): Promise<string> {
  const delivery = await createMediaDeliveryUrl(publicId, "full", true, "notion-sync");
  const imageResponse = await countedFetch(delivery.url, {});
  if (!imageResponse.ok) throw new Error(`failed-to-fetch-image: ${imageResponse.status}`);
  const imageData = await imageResponse.arrayBuffer();

  const fileUpload = (await callNotionAPI("/file_uploads", "POST", {
    filename,
    content_type: "image/webp",
  })) as { id: string; upload_url?: string };

  if (fileUpload.upload_url) {
    const uploadRes = await countedFetch(fileUpload.upload_url, {
      method: "POST",
      body: imageData,
      headers: { "Content-Type": "image/webp" },
    });
    if (!uploadRes.ok) throw new Error(`notion-file-upload-failed: ${uploadRes.status}`);
  }
  return fileUpload.id;
}
export function splitNotionText(content: string): string[] {
  if (!content) return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < content.length; offset += 1900) {
    chunks.push(content.slice(offset, offset + 1900));
  }
  return chunks;
}
