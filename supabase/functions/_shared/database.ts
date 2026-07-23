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
  category: string;
  comments_enabled: boolean;
  read_access: string;
  author_visible: boolean;
  content: string;
  closed_at: string | null;
  created_at: string;
  response_deadline_at: string | null;
  result_content: string | null;
  review_approved_at: string | null;
  review_rejection_reason: string | null;
  status: string;
  support_count: number;
  support_deadline_at: string | null;
  support_deadline_days: number | null;
  support_enabled: boolean;
  support_goal: number | null;
  response_deadline_days: number | null;
  support_met_at: string | null;
  title: string;
  title_search: string;
}

interface CommentRow {
  id: string;
  issue_id: string;
  parent_comment_id: string | null;
  author_uid: string;
  content: string;
  created_at: string;
}

interface AnnouncementRow {
  id: string;
  author_uid: string;
  title: string;
  content: string;
  like_count: number;
  comment_count: number;
  published_at: string;
}

interface AnnouncementCommentRow {
  id: string;
  announcement_id: string;
  parent_comment_id: string | null;
  author_uid: string;
  content: string;
  created_at: string;
}

interface NotificationRow {
  id: string;
  source: "admin" | "broadcast" | "user";
  recipient_uid: string | null;
  type: string;
  target_type: "announcement" | "facility" | "issue";
  target_id: string;
  comment_id: string | null;
  title: string;
  actor_uid: string | null;
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
  push_facility_updates_enabled: boolean;
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
  error_trace_id: string | null;
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
  expires_at: string;
  size_bytes: number | null;
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
  error_trace_id: string | null;
  locked_at: string | null;
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
  content_hash: string | null;
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
  topic_broadcast: boolean;
}

interface UserProfileRow {
  uid: string;
  email: string | null;
  avatar_hash: string | null;
  avatar_public_id: string | null;
  avatar_source_url: string | null;
  avatar_version: number;
  avatar_checked_at: string | null;
  cached_photo_url: string | null;
  photo_url: string | null;
  display_name: string | null;
  profile_version: number;
  updated_at: string;
}

interface UserRoleRow {
  uid: string;
  role: string;
  updated_at: string;
}

interface FacilityRow {
  id: string;
  author_uid: string;
  title: string;
  title_search: string;
  location: string;
  content: string;
  category_id: string;
  status: string;
  affected_count: number;
  result_content: string | null;
  last_actor_uid: string | null;
  created_at: string;
  started_at: string | null;
  closed_at: string | null;
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
  error_trace_id: string | null;
  started_at: string;
  status: string;
  task_name: string;
}

interface RealtimeEventRow {
  actor_uid: string | null;
  category: string | null;
  created_at: string;
  event_type: string;
  expires_at: string;
  id: string;
  parent_id: string | null;
  target_id: string;
  target_type: string;
}

interface ContentRevisionRow {
  domain: string;
  revision: number;
  updated_at: string;
}

interface AppPrivateTables {
  announcement_comments: Table<AnnouncementCommentRow>;
  announcement_likes: Table<{ announcement_id: string; uid: string; created_at: string }>;
  announcements: Table<AnnouncementRow>;
  comments: Table<CommentRow>;
  issue_categories: Table<{
    id: string; label: string; read_access: string; author_visible: boolean;
    support_enabled: boolean; support_goal: number | null; support_deadline_days: number | null;
    response_deadline_days: number | null; comments_enabled: boolean; is_active: boolean;
    is_default: boolean; sort_order: number; created_by: string; created_at: string; updated_at: string;
  }>;
  facility_categories: Table<{
    id: string; label: string; is_active: boolean; is_default: boolean;
    sort_order: number; created_by: string; created_at: string; updated_at: string;
  }>;
  content_revisions: Table<ContentRevisionRow>;
  deletion_jobs: Table<DeletionJobRow>;
  facility_reports: Table<FacilityRow>;
  facility_report_affected_users: Table<{ facility_id: string; uid: string; created_at: string }>;
  idempotency_keys: Table<IdempotencyKeyRow>;
  issues: Table<IssueRow>;
  maintenance_runs: Table<MaintenanceRunRow>;
  notion_pages: Table<NotionPageRow>;
  notification_states: Table<NotificationStateRow>;
  notifications: Table<NotificationRow>;
  outbox_events: Table<OutboxEventRow>;
  push_delivery_logs: Table<{
    id: string;
    error_trace_id: string | null;
    notification_type: string;
    status: string;
    target_id: string;
    target_type: string;
    token_uid: string;
    created_at: string;
    updated_at: string;
  }>;
  realtime_events: Table<RealtimeEventRow>;
  runtime_settings: Table<{ key: string; value: string; updated_at: string }>;
  push_tokens: Table<PushTokenRow>;
  supports: Table<{ issue_id: string; uid: string; created_at: string }>;
  uploads: Table<UploadRow>;
  user_profiles: Table<UserProfileRow>;
  user_roles: Table<UserRoleRow>;
  roles: Table<{ code: string; label: string; created_at: string }>;
  permissions: Table<{ code: string; label: string }>;
  role_permissions: Table<{ role_code: string; permission_code: string }>;
  user_role_assignments: Table<{ uid: string; role_code: string; granted_by: string; granted_at: string }>;
  user_issue_category_assignments: Table<{ uid: string; category_id: string; granted_by: string; granted_at: string }>;
  user_facility_category_assignments: Table<{
    uid: string; category_id: string; notify_on_created: boolean; granted_by: string; granted_at: string;
  }>;
  category_configuration_audit: Table<{
    id: number; domain: string; category_id: string | null; operation: string; actor_uid: string;
    before_value: Json | null; after_value: Json | null; created_at: string;
  }>;
  access_assignment_audit: Table<{
    id: number; actor_uid: string; target_uid: string; before_value: Json; after_value: Json; created_at: string;
  }>;
  system_setup: Table<{
    singleton: boolean; completed_at: string | null; completed_by: string | null;
    issues_enabled: boolean; facilities_enabled: boolean; updated_at: string;
  }>;
  role_assignment_audit: Table<{ id: number; uid: string; role_code: string; operation: string; actor_uid: string; created_at: string }>;
}

interface AppApiFunctions {
  backend_commit_user_avatar: AppFunction<{
    actor_uid: string;
    next_avatar_hash: string;
    next_avatar_public_id: string;
    next_avatar_source_url: string;
    next_cached_photo_url: string;
    next_avatar_version: number;
    next_display_name: string;
  }, Json>;
  backend_complete_initial_setup: AppFunction<{
    actor_uid: string; issue_categories: Json; facility_categories: Json;
    issues_enabled: boolean; facilities_enabled: boolean;
  }, Json>;
  backend_update_platform_features: AppFunction<{
    actor_uid: string; issues_enabled: boolean; facilities_enabled: boolean;
  }, Json>;
  backend_get_access_context: AppFunction<{ actor_uid: string }, Json>;
  backend_get_notification_unread_hint: AppFunction<{ actor_is_admin: boolean; actor_uid: string }, Json>;
  backend_create_facility: AppFunction<{
    actor_uid: string;
    facility_title: string; facility_location: string; facility_content: string; facility_category: string;
  }, Json>;
  backend_get_facility: AppFunction<{ facility_id: string; actor_uid: string; actor_can_manage: boolean }, Json>;
  backend_list_facilities: AppFunction<{
    actor_uid: string; actor_can_manage: boolean; bucket: string; status_filter: string;
    search_query: string; sort_name: string; cursor_created_at: string | null;
    cursor_number: number | null; cursor_id: string | null; page_size: number;
  }, Json>;
  backend_toggle_facility_affected: AppFunction<{ facility_id: string; actor_uid: string }, Json>;
  backend_update_facility_status: AppFunction<{
    facility_id: string; actor_uid: string; actor_can_manage: boolean; next_status: string; result_content: string | null;
  }, Json>;
  backend_delete_facility: AppFunction<{ facility_id: string; actor_uid: string; actor_can_manage: boolean }, Json>;
  backend_announcement_to_json: AppFunction<{
    actor_uid: string;
    announcement_record: AnnouncementRow;
  }, Json>;
  backend_create_announcement: AppFunction<{
    actor_uid: string;
    announcement_content: string;
    announcement_title: string;
  }, Json>;
  backend_announcement_comment_to_json: AppFunction<{
    comment_record: AnnouncementCommentRow;
    replies?: Json;
  }, Json>;
  backend_assert_issue_comment_access: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    issue_id: string;
    private_to_owner_categories: string[];
    public_comment_categories: string[];
    review_required_categories: string[];
  }, IssueRow>;
  backend_comment_to_json: AppFunction<{
    comment_record: CommentRow;
    replies?: Json;
  }, Json>;
  backend_create_announcement_comment: AppFunction<{
    actor_uid: string;
    announcement_id: string;
    comment_content: string;
    parent_comment_id: string | null;
  }, Json>;
  backend_create_issue_comment: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    comment_content: string;
    issue_id: string;
    parent_comment_id: string | null;
    private_to_owner_categories: string[];
    public_comment_categories: string[];
    review_required_categories: string[];
  }, Json>;
  backend_create_issue: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    author_is_private: boolean;
    author_private_categories: string[];
    issue_category: string;
    issue_content: string;
    issue_status: string;
    issue_title: string;
    private_to_owner_categories: string[];
    response_deadline_at: string | null;
    review_required_categories: string[];
    support_deadline_at: string | null;
    support_enabled: boolean;
    support_goal: number | null;
  }, Json>;
  backend_delete_announcement: AppFunction<{ announcement_id: string }, Json>;
  backend_delete_announcement_comment: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    comment_id: string;
  }, Json>;
  backend_delete_issue_comment: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    comment_id: string;
  }, Json>;
  backend_delete_issue_with_upload_targets: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    issue_id: string;
  }, Json>;
  backend_get_issue: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    author_private_categories: string[];
    issue_id: string;
    private_to_owner_categories: string[];
    review_required_categories: string[];
  }, Json>;
  backend_get_announcement: AppFunction<{ actor_uid: string; announcement_id: string }, Json>;
  backend_list_announcements: AppFunction<{
    actor_uid: string;
    cursor_id: string | null;
    cursor_published_at: string | null;
    cursor_sort_number: number | null;
    page_size: number;
    sort_name: string;
  }, Json>;
  backend_list_announcement_comments: AppFunction<{
    announcement_id: string;
    cursor_created_at: string | null;
    cursor_id: string | null;
  }, Json>;
  backend_list_issue_comments: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    cursor_created_at: string | null;
    cursor_id: string | null;
    issue_id: string;
    private_to_owner_categories: string[];
    public_comment_categories: string[];
    review_required_categories: string[];
  }, Json>;
  backend_list_issues: AppFunction<{
    action_name: string;
    actor_is_admin: boolean;
    actor_uid: string;
    active_filter: string;
    author_private_categories: string[];
    cursor_created_at: string | null;
    cursor_id: string | null;
    cursor_sort_date: string | null;
    cursor_sort_number: number | null;
    page_size: number;
    private_to_owner_categories: string[];
    review_required_categories: string[];
    sort_name: string;
    status_bucket: string;
    title_query: string | null;
  }, Json>;
  backend_list_user_issues: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    author_private_categories: string[];
    cursor_created_at: string | null;
    cursor_id: string | null;
    cursor_sort_date: string | null;
    cursor_sort_number: number | null;
    page_size: number;
    private_to_owner_categories: string[];
    review_required_categories: string[];
    sort_name: string;
    status_bucket: string;
  }, Json>;
  backend_update_user_access_scope: AppFunction<{
    actor_uid: string;
    target_uid: string;
    scope_kind: string;
    category_id: string | null;
    grant_access: boolean;
  }, Json>;
  backend_reconcile_platform_admins: AppFunction<{
    actor_uid: string;
    admin_emails: string[];
  }, Json>;
  backend_list_notifications: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    cursor_created_at: string | null;
    cursor_id: string | null;
    notification_source: string;
    page_size: number;
  }, Json>;
  backend_get_notification_read_state: AppFunction<{ actor_uid: string }, Json>;
  backend_mark_notifications_opened: AppFunction<{
    actor_uid: string;
    opened_at: string;
  }, Json>;
  backend_moderate_issue_status: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    author_private_categories: string[];
    issue_id: string;
    next_status: string;
    private_to_owner_categories: string[];
    response_deadline_at: string | null;
    review_approved_at: string | null;
    review_rejection_reason: string | null;
    review_required_categories: string[];
    support_deadline_at: string | null;
  }, Json>;
  backend_notification_state_to_json: AppFunction<{ state_record: NotificationStateRow }, Json>;
  backend_notification_to_json: AppFunction<{
    notification_record: NotificationRow;
    opened_at: string | null;
  }, Json>;
  backend_push_notification_preference: AppFunction<{
    actor_uid: string;
    device_id: string;
    facility_updates_enabled: boolean;
    permission: string;
  }, Json>;
  backend_register_push_token: AppFunction<{
    actor_uid: string;
    device_id: string;
    permission: string;
    platform: string;
    token: string;
    user_agent: string;
  }, Json>;
  backend_unregister_push_token: AppFunction<{
    actor_uid: string;
    device_id: string;
    permission: string;
  }, Json>;
  backend_update_push_notification_preferences: AppFunction<{
    actor_uid: string;
    comments_enabled: boolean;
    device_id: string;
    facility_updates_enabled: boolean;
    issue_updates_enabled: boolean;
    permission: string;
  }, Json>;
  backend_set_announcement_like: AppFunction<{
    actor_uid: string;
    announcement_id: string;
    liked: boolean;
  }, Json>;
  backend_update_issue_result: AppFunction<{
    actor_is_admin: boolean;
    actor_uid: string;
    author_private_categories: string[];
    issue_id: string;
    private_to_owner_categories: string[];
    result_content: string | null;
    review_required_categories: string[];
  }, Json>;
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
  fail_deletion_job: AppFunction<{ error_trace_id: string; job_id: string }, void>;
  fail_outbox_event: AppFunction<{ error_trace_id: string; event_id: string }, void>;
  get_platform_dashboard_snapshot: AppFunction<Record<string, never>, Json>;
  backend_delete_issue: AppFunction<{ actor_is_admin: boolean; actor_uid: string; issue_id: string }, void>;
  release_idempotency_key: AppFunction<{ action_name: string; actor_uid: string; request_id: string }, void>;
  resignal_background_worker: AppFunction<{ worker_name: string }, void>;
  run_maintenance_cleanup: AppFunction<{
    retention_config?: Json;
    valid_issue_categories?: string[] | null;
  }, Json>;
  sync_runtime_settings: AppFunction<{ settings: Json }, void>;
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
