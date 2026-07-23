import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { apiGatewayUrl } from '@/lib/api-gateway';

const imageAltSizePattern = /^(.*)\|(\d{1,5})x(\d{1,5})$/u;
const listItemPattern = /^ {0,3}(?:[-*+]\s+|\d{1,9}[.)]\s+)/u;
const indentedContinuationPattern = /^ {2,}\S/u;
const fencedCodePattern = /^ {0,3}(```|~~~)/u;
const markdownSyntaxPattern = /(?:^|\n)\s{0,3}(?:[#>*+-]|\d+[.)])\s|[`[\]_|~\\]|https?:\/\//u;
const markdownHtmlCache = new Map<string, string>();
const MARKDOWN_CACHE_LIMIT = 100;

interface MarkdownImageToken {
  href?: unknown;
  text?: unknown;
  title?: unknown;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function isMarkdownImageToken(value: unknown): value is MarkdownImageToken {
  return typeof value === 'object' && value !== null;
}

function renderImage(hrefOrToken: unknown, titleValue?: string | null, textValue?: string) {
  const href = isMarkdownImageToken(hrefOrToken)
    ? String(hrefOrToken.href ?? '')
    : String(hrefOrToken ?? '');
  const rawTitle = isMarkdownImageToken(hrefOrToken) ? hrefOrToken.title : titleValue;
  const title = rawTitle ? ` title="${escapeAttribute(String(rawTitle))}"` : '';
  const rawText = isMarkdownImageToken(hrefOrToken)
    ? String(hrefOrToken.text ?? '')
    : String(textValue ?? '');
  const sizeMatch = rawText.match(imageAltSizePattern);
  const altText = sizeMatch ? sizeMatch[1] : rawText;
  const width = sizeMatch ? Number(sizeMatch[2]) : 1200;
  const height = sizeMatch ? Number(sizeMatch[3]) : 675;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  let imageUrl: URL;
  try {
    imageUrl = new URL(href, window.location.origin);
  } catch {
    return escapeAttribute(altText);
  }
  const mediaGateway = new URL(apiGatewayUrl('/'));
  if (imageUrl.origin !== mediaGateway.origin || !imageUrl.pathname.startsWith('/v1/media/')) {
    return escapeAttribute(altText);
  }

  return `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(altText)}"${title} width="${safeWidth}" height="${safeHeight}" loading="lazy" decoding="async">`;
}

export function normalizeLooseListContinuations(markdown: string) {
  const lines = markdown.split('\n');
  const normalizedLines: string[] = [];
  let isInList = false;
  let isInFence = false;
  let fenceMarker: string | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(fencedCodePattern);
    if (fenceMatch && (!isInFence || fenceMatch[1] === fenceMarker)) {
      isInFence = !isInFence;
      fenceMarker = isInFence ? fenceMatch[1] : null;
      normalizedLines.push(line);
      continue;
    }

    if (isInFence) {
      normalizedLines.push(line);
      continue;
    }

    const isBlankLine = line.trim().length === 0;
    const isListItem = listItemPattern.test(line);
    const isIndentedContinuation = indentedContinuationPattern.test(line);

    if (isInList && !isBlankLine && !isListItem && !isIndentedContinuation) {
      const previousLine = normalizedLines[normalizedLines.length - 1] ?? '';
      if (previousLine.trim().length > 0) {
        normalizedLines.push('');
      }
      isInList = false;
    }

    normalizedLines.push(line);

    if (isBlankLine) {
      isInList = false;
    } else if (isListItem || (isInList && isIndentedContinuation)) {
      isInList = true;
    }
  }

  return normalizedLines.join('\n');
}

marked.use({
  renderer: {
    image: renderImage,
  },
});
marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(value: string) {
  return escapeAttribute(value).replace(/\n/gu, '<br>');
}

function cacheHtml(key: string, html: string) {
  markdownHtmlCache.delete(key);
  markdownHtmlCache.set(key, html);
  while (markdownHtmlCache.size > MARKDOWN_CACHE_LIMIT) {
    const oldestKey = markdownHtmlCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    markdownHtmlCache.delete(oldestKey);
  }
  return html;
}

export function useMarkdown(content: MaybeRefOrGetter<string>) {
  return computed(() => {
    const rawMarkdown = toValue(content) || '';
    const cached = markdownHtmlCache.get(rawMarkdown);
    if (cached !== undefined) {
      markdownHtmlCache.delete(rawMarkdown);
      markdownHtmlCache.set(rawMarkdown, cached);
      return cached;
    }
    if (!markdownSyntaxPattern.test(rawMarkdown)) {
      return cacheHtml(rawMarkdown, escapeHtml(rawMarkdown));
    }
    const normalizedMarkdown = normalizeLooseListContinuations(rawMarkdown);

    const rawHtml = marked.parse(normalizedMarkdown, { async: false }) as string;

    return cacheHtml(rawMarkdown, DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['loading', 'decoding'],
    }));
  });
}
