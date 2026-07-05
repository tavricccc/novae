export type Json = boolean | null | number | string | Json[] | { [key: string]: Json | undefined };

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Insert: Insert;
  Relationships: [];
  Row: Row;
  Update: Update;
};

type AppFunction<Args extends Record<string, unknown>, Returns> = {
  Args: Args;
  Returns: Returns;
};

interface IssueRow {
  id: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  category: string;
  content: string;
  created_at: string;
  deleting: boolean;
  response_deadline_at: string | null;
  review_rejection_reason: string | null;
  status: string;
  support_count: number;
  support_deadline_at: string | null;
  support_enabled: boolean;
  support_goal: number | null;
  support_met_at: string | null;
  title: string;
  title_search: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  issue_id: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  content: string;
  is_admin_comment: boolean;
  created_at: string;
  updated_at: string;
}

interface AnnouncementRow {
  id: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  title: string;
  content: string;
  like_count: number;
  comment_count: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

interface AnnouncementCommentRow {
  id: string;
  announcement_id: string;
  author_uid: string;
  author_name: string;
  author_photo_url: string | null;
  content: string;
  is_admin_comment: boolean;
  created_at: string;
  updated_at: string;
}

interface NotificationRow {
  id: string;
  source: "admin" | "broadcast" | "user";
  recipient_uid: string | null;
  type: string;
  target_type: "announcement" | "issue";
  target_id: string;
  title: string;
  actor_uid: string | null;
  actor_name: string | null;
  actor_photo_url: string | null;
  body_preview: string | null;
  issue_category: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  expires_at: string;
}

interface NotificationStateRow {
  uid: string;
  broadcast_opened_at: string | null;
  admin_opened_at: string | null;
  user_opened_at: string | null;
  push_comments_enabled: boolean;
  push_issue_updates_enabled: boolean;
  updated_at: string;
}

interface OutboxEventRow {
  id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  actor_uid: string;
  payload: Json;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
  occurred_at: string;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

interface UploadRow {
  id: string;
  owner_uid: string;
  status: string;
  cloudinary_public_id: string | null;
  original_url: string | null;
  preview_url: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

interface DeletionJobRow {
  id: string;
  target_type: string;
  target_id: string;
  cloudinary_public_id: string | null;
  notion_page_id: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface NotionPageRow {
  id: string;
  target_type: string;
  target_id: string;
  notion_page_id: string;
  created_at: string;
  updated_at: string;
}

interface PushTokenRow {
  uid: string;
  device_id: string;
  token: string;
  permission: string;
  platform: string;
  user_agent: string;
  created_at: string;
  updated_at: string;
}

interface UserProfileRow {
  uid: string;
  cached_photo_url: string | null;
  photo_url: string | null;
  display_name: string | null;
  updated_at: string;
}

interface UserRoleRow {
  uid: string;
  role: string;
  updated_at: string;
}

interface BackendActionIdempotencyRow {
  idempotency_key: string;
  status: string;
  response: Json | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

interface AppPrivateTables {
  announcement_comments: Table<AnnouncementCommentRow>;
  announcement_likes: Table<{ announcement_id: string; uid: string; created_at: string }>;
  announcements: Table<AnnouncementRow>;
  backend_action_idempotency: Table<BackendActionIdempotencyRow>;
  comments: Table<CommentRow>;
  deletion_jobs: Table<DeletionJobRow>;
  issues: Table<IssueRow>;
  notion_pages: Table<NotionPageRow>;
  notification_states: Table<NotificationStateRow>;
  notifications: Table<NotificationRow>;
  outbox_events: Table<OutboxEventRow>;
  private_issue_authors: Table<{
    issue_id: string;
    author_uid: string;
    author_name: string;
    author_photo_url: string | null;
    created_at: string;
    updated_at: string;
  }>;
  push_delivery_logs: Table<{
    id: string;
    error_message: string | null;
    notification_type: string;
    status: string;
    target_id: string;
    target_type: string;
    token_uid: string;
    created_at: string;
  }>;
  push_tokens: Table<PushTokenRow>;
  supports: Table<{ issue_id: string; uid: string; created_at: string }>;
  uploads: Table<UploadRow>;
  user_profiles: Table<UserProfileRow>;
  user_roles: Table<UserRoleRow>;
}

interface AppApiFunctions {
  claim_backend_action: AppFunction<{ idempotency_key: string }, Json>;
  claim_outbox_events: AppFunction<{ batch_size?: number }, OutboxEventRow[]>;
  complete_backend_action: AppFunction<{ idempotency_key: string; response: Json }, void>;
  complete_outbox_event: AppFunction<{ event_id: string }, void>;
  fail_outbox_event: AppFunction<{ error_message: string; event_id: string }, void>;
  release_backend_action: AppFunction<{ error_message: string; idempotency_key: string }, void>;
}

interface EmptySchema {
  CompositeTypes: Record<string, never>;
  Enums: Record<string, never>;
  Functions: Record<string, never>;
  Tables: Record<string, never>;
  Views: Record<string, never>;
}

export interface Database {
  app_api: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: AppApiFunctions;
    Tables: Record<string, never>;
    Views: Record<string, never>;
  };
  app_private: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: Record<string, never>;
    Tables: AppPrivateTables;
    Views: Record<string, never>;
  };
  public: EmptySchema;
}
