export interface CommentResponseRecord {
  id: string;
  issue_id: string;
  parent_comment_id: string | null;
  content: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  created_at_ms: number | null;
  replies?: CommentResponseRecord[];
}
