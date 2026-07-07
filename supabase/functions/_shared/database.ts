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
  result_content: string | null;
  result_updated_at: string | null;
  review_approved_at: string | null;
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
  parent_comment_id: string | null;
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
  parent_comment_id: string | null;
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
  notification_completed_at: string | null;
  notion_completed_at: string | null;
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
  attached_target_id: string | null;
  attached_target_type: string | null;
  content_type: string | null;
  delivery_type: string;
  expires_at: string;
  resource_type: string;
  secure_url: string | null;
  delivery_url: string | null;
  delivery_url_expires_at: string | null;
  size_bytes: number | null;
  original_url: string | null;
  preview_url: string | null;
  visibility: string | null;
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
  managed_block_ids: Json;
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
  avatar_hash: string | null;
  avatar_public_id: string | null;
  avatar_source_url: string | null;
  avatar_version: number;
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

interface IdempotencyKeyRow {
  action: string;
  created_at: string;
  expires_at: string;
  request_id: string;
  response: Json | null;
  status: string;
  uid: string;
  updated_at: string;
}

interface MaintenanceRunRow {
  id: string;
  completed_at: string | null;
  details: Json;
  error: string | null;
  started_at: string;
  status: string;
  task_name: string;
}

interface AppPrivateTables {
  announcement_comments: Table<AnnouncementCommentRow>;
  announcement_likes: Table<{ announcement_id: string; uid: string; created_at: string }>;
  announcements: Table<AnnouncementRow>;
  comments: Table<CommentRow>;
  deletion_jobs: Table<DeletionJobRow>;
  idempotency_keys: Table<IdempotencyKeyRow>;
  issues: Table<IssueRow>;
  maintenance_runs: Table<MaintenanceRunRow>;
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
    updated_at: string;
  }>;
  runtime_settings: Table<{ key: string; value: string; updated_at: string }>;
  push_tokens: Table<PushTokenRow>;
  supports: Table<{ issue_id: string; uid: string; created_at: string }>;
  uploads: Table<UploadRow>;
  user_profiles: Table<UserProfileRow>;
  user_roles: Table<UserRoleRow>;
}

interface AppApiFunctions {
  backend_toggle_support: AppFunction<{
    actor_uid: string;
    issue_id: string;
    remove_support: boolean;
    response_deadline_days: number | null;
  }, Array<{ goal_met: boolean; support_count: number; supported: boolean }>>;
  claim_deletion_jobs: AppFunction<{ batch_size?: number }, DeletionJobRow[]>;
  claim_idempotency_key: AppFunction<{ action_name: string; actor_uid: string; request_id: string }, Array<{
    claimed: boolean;
    completed: boolean;
    response: Json | null;
  }>>;
  claim_outbox_events: AppFunction<{ batch_size?: number }, OutboxEventRow[]>;
  complete_deletion_job: AppFunction<{ job_id: string }, void>;
  complete_idempotency_key: AppFunction<{ action_name: string; action_response: Json; actor_uid: string; request_id: string }, void>;
  complete_outbox_event: AppFunction<{ event_id: string }, void>;
  fail_deletion_job: AppFunction<{ error_message: string; job_id: string }, void>;
  fail_outbox_event: AppFunction<{ error_message: string; event_id: string }, void>;
  get_platform_dashboard_snapshot: AppFunction<Record<string, never>, Json>;
  backend_delete_issue: AppFunction<{ actor_is_admin: boolean; actor_uid: string; issue_id: string }, void>;
  release_idempotency_key: AppFunction<{ action_name: string; actor_uid: string; request_id: string }, void>;
  run_maintenance_cleanup: AppFunction<{ valid_issue_categories?: string[] | null }, Json>;
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
