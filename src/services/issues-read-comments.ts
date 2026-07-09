import type { CommentRecord } from '@/types';
import { invokeBackendAction } from './backend-action';
import type { CommentCursor } from './comment-cursor';
import { normalizeCommentCursor } from './comment-cursor';
import { toReadableBackendError } from './issues-core';
import type { CommentResponseRecord } from './issues-read-shared';
import { READ_REQUEST_TIMEOUT_MS } from '@/lib/request';
import { getRouteRequestSignal } from '@/lib/route-request';

interface FetchCommentsOptions {
  signal?: AbortSignal | null;
}

function getCommentRequestSignal(options?: FetchCommentsOptions) {
  if (options && 'signal' in options) return options.signal ?? undefined;
  return getRouteRequestSignal();
}

export async function fetchComments(
  issueId: string,
  cursor?: CommentCursor | null,
  options?: FetchCommentsOptions,
) {
  try {
    const fn = invokeBackendAction<
      { issueId: string; cursor?: CommentCursor | null },
      { comments: CommentResponseRecord[]; cursor: CommentCursor | null; hasMore: boolean }
    >('listComments', {
      signal: getCommentRequestSignal(options),
      timeoutMs: READ_REQUEST_TIMEOUT_MS,
    });
    const result = await fn({ issueId, cursor });

    return {
      comments: result.comments.map((comment) => ({
        id: comment.id,
        issue_id: comment.issue_id,
        parent_comment_id: comment.parent_comment_id,
        content: comment.content,
        author_uid: comment.author_uid,
        author_name: comment.author_name,
        author_photo_url: comment.author_photo_url,
        created_at: comment.created_at_ms === null ? null : new Date(comment.created_at_ms),
        replies: (comment.replies ?? []).map((reply) => ({
          id: reply.id,
          issue_id: comment.issue_id,
          parent_comment_id: reply.parent_comment_id,
          content: reply.content,
          author_uid: reply.author_uid,
          author_name: reply.author_name,
          author_photo_url: reply.author_photo_url,
          created_at: reply.created_at_ms === null ? null : new Date(reply.created_at_ms),
          replies: [],
        })),
      })),
      cursor: normalizeCommentCursor(result.cursor),
      hasMore: result.hasMore,
    } satisfies { comments: CommentRecord[]; cursor: CommentCursor | null; hasMore: boolean };
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
