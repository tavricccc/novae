// Generated from the fully migrated PostgreSQL schema. Do not edit by hand.
export type GeneratedJson = null | boolean | number | string | GeneratedJson[] | { [key: string]: GeneratedJson };

export interface GeneratedDatabaseTables {
  "access_assignment_audit": {
    "id": number;
    "actor_uid": string;
    "target_uid": string;
    "before_value": GeneratedJson;
    "after_value": GeneratedJson;
    "created_at": string;
  };
  "admin_audit_log": {
    "id": number;
    "actor_uid": string;
    "action": string;
    "domain": string;
    "target_id": string | null;
    "detail": GeneratedJson;
    "created_at": string;
    "operation_id": string | null;
  };
  "announcement_comments": {
    "id": string;
    "announcement_id": string;
    "author_uid": string;
    "content": string;
    "created_at": string;
    "parent_comment_id": string | null;
    "revision": number;
  };
  "announcement_likes": {
    "announcement_id": string;
    "uid": string;
    "created_at": string;
  };
  "announcements": {
    "id": string;
    "author_uid": string;
    "title": string;
    "content": string;
    "like_count": number;
    "comment_count": number;
    "published_at": string;
    "comments_enabled": boolean;
    "revision": number;
  };
  "background_jobs": {
    "id": string;
    "job_type": string;
    "scope_id": string;
    "payload": GeneratedJson;
    "status": string;
    "estimated_rows": number;
    "processed_rows": number;
    "affected_rows": number;
    "batch_size": number;
    "attempt_count": number;
    "last_attempt_id": string | null;
    "next_attempt_at": string;
    "locked_at": string | null;
    "started_at": string | null;
    "completed_at": string | null;
    "result": GeneratedJson;
    "error_detail": GeneratedJson | null;
    "created_by": string;
    "created_at": string;
    "updated_at": string;
    "expires_at": string;
  };
  "category_configuration_audit": {
    "id": number;
    "domain": string;
    "category_id": string | null;
    "operation": string;
    "actor_uid": string;
    "before_value": GeneratedJson | null;
    "after_value": GeneratedJson | null;
    "created_at": string;
  };
  "claimable_event_deliveries": {
    "id": string | null;
    "event_id": string | null;
    "destination": string | null;
    "status": string | null;
    "attempt_count": number | null;
    "last_attempt_id": string | null;
    "next_attempt_at": string | null;
    "locked_at": string | null;
    "completed_at": string | null;
    "error_detail": GeneratedJson | null;
    "created_at": string | null;
    "updated_at": string | null;
    "expires_at": string | null;
  };
  "comments": {
    "id": string;
    "issue_id": string;
    "author_uid": string;
    "content": string;
    "created_at": string;
    "parent_comment_id": string | null;
    "revision": number;
  };
  "content_versions": {
    "domain": string;
    "version": number;
    "updated_at": string;
  };
  "domain_event_types": {
    "event_type": string;
  };
  "domain_events": {
    "event_id": string;
    "operation_id": string;
    "aggregate_type": string;
    "aggregate_id": string;
    "event_type": string;
    "actor_uid": string;
    "occurred_at": string;
    "payload": GeneratedJson;
    "aggregate_version": number;
  };
  "event_deliveries": {
    "id": string;
    "event_id": string;
    "destination": string;
    "status": string;
    "attempt_count": number;
    "last_attempt_id": string | null;
    "next_attempt_at": string;
    "locked_at": string | null;
    "completed_at": string | null;
    "error_detail": GeneratedJson | null;
    "created_at": string;
    "updated_at": string;
    "expires_at": string;
  };
  "event_destinations": {
    "destination": string;
  };
  "external_cleanup_backlog": {
    "job_id": string;
    "payload": GeneratedJson;
    "created_at": string;
  };
  "facility_categories": {
    "id": string;
    "label": string;
    "is_active": boolean;
    "is_default": boolean;
    "sort_order": number;
    "created_by": string;
    "created_at": string;
    "updated_at": string;
    "author_delete_enabled": boolean;
  };
  "facility_report_affected_users": {
    "facility_id": string;
    "uid": string;
    "created_at": string;
  };
  "facility_reports": {
    "id": string;
    "author_uid": string;
    "title": string;
    "title_search": string;
    "location": string;
    "content": string;
    "status": string;
    "affected_count": number;
    "result_content": string | null;
    "last_actor_uid": string | null;
    "created_at": string;
    "started_at": string | null;
    "closed_at": string | null;
    "updated_at": string;
    "category_id": string;
    "revision": number;
  };
  "issue_categories": {
    "id": string;
    "label": string;
    "read_access": string;
    "author_visible": boolean;
    "support_enabled": boolean;
    "support_goal": number | null;
    "support_deadline_days": number | null;
    "comments_enabled": boolean;
    "is_active": boolean;
    "is_default": boolean;
    "sort_order": number;
    "created_by": string;
    "created_at": string;
    "updated_at": string;
    "author_delete_enabled": boolean;
  };
  "issues": {
    "id": string;
    "author_uid": string;
    "title": string;
    "content": string;
    "status": string;
    "category": string;
    "created_at": string;
    "support_count": number;
    "support_enabled": boolean;
    "support_goal": number | null;
    "support_deadline_at": string | null;
    "support_met_at": string | null;
    "review_rejection_reason": string | null;
    "title_search": string;
    "last_actor_uid": string | null;
    "result_content": string | null;
    "review_approved_at": string | null;
    "closed_at": string | null;
    "comments_enabled": boolean;
    "read_access": string;
    "author_visible": boolean;
    "support_deadline_days": number | null;
    "revision": number;
  };
  "notification_states": {
    "uid": string;
    "broadcast_opened_at": string | null;
    "admin_opened_at": string | null;
    "user_opened_at": string | null;
    "updated_at": string;
    "announcement_opened_at": string;
  };
  "notifications": {
    "id": string;
    "source": string;
    "recipient_uid": string | null;
    "type": string;
    "target_type": string;
    "target_id": string;
    "title": string;
    "actor_uid": string | null;
    "body_preview": string | null;
    "issue_category": string | null;
    "old_status": string | null;
    "new_status": string | null;
    "created_at": string;
    "expires_at": string;
    "comment_id": string | null;
    "origin": string;
  };
  "notion_pages": {
    "target_type": string;
    "target_id": string;
    "notion_page_id": string;
    "updated_at": string;
  };
  "operation_policy_history": {
    "id": number;
    "actor_uid": string;
    "revision": number;
    "before_value": GeneratedJson;
    "after_value": GeneratedJson;
    "reason": string;
    "created_at": string;
  };
  "operational_errors": {
    "bucket": string;
    "action": string;
    "code": string;
    "status": number;
    "count": number;
    "first_at": string;
    "last_at": string;
    "operation_id": string | null;
    "failure_id": string | null;
  };
  "operational_metrics": {
    "bucket": string;
    "database_bytes": number;
    "measured_at": string;
  };
  "operations": {
    "operation_id": string;
    "actor_uid": string;
    "action": string;
    "status": string;
    "response": GeneratedJson | null;
    "error_detail": GeneratedJson | null;
    "created_at": string;
    "updated_at": string;
    "expires_at": string;
    "response_expired": boolean;
  };
  "permissions": {
    "code": string;
    "label": string;
  };
  "platform_admin_notification_preferences": {
    "uid": string;
    "issue_notifications_enabled": boolean;
    "facility_notifications_enabled": boolean;
    "comment_notifications_enabled": boolean;
    "updated_at": string;
  };
  "platform_category_counters": {
    "category": string;
    "issues": number;
    "comments": number;
  };
  "platform_counters": {
    "key": string;
    "value": number;
    "updated_at": string;
  };
  "push_delivery_receipts": {
    "delivery_id": string;
    "token_hash": string;
  };
  "push_tokens": {
    "uid": string;
    "device_id": string;
    "token": string;
    "permission": string;
    "platform": string;
    "user_agent": string;
    "created_at": string;
    "updated_at": string;
    "last_confirmed_at": string;
  };
  "role_assignment_audit": {
    "id": number;
    "uid": string;
    "role_code": string;
    "operation": string;
    "actor_uid": string;
    "created_at": string;
  };
  "role_permissions": {
    "role_code": string;
    "permission_code": string;
  };
  "roles": {
    "code": string;
    "label": string;
    "created_at": string;
  };
  "runtime_settings": {
    "key": string;
    "value": string;
    "updated_at": string;
  };
  "supports": {
    "issue_id": string;
    "uid": string;
    "created_at": string;
  };
  "system_setup": {
    "singleton": boolean;
    "completed_at": string | null;
    "completed_by": string | null;
    "updated_at": string;
    "issues_enabled": boolean;
    "facilities_enabled": boolean;
    "announcement_comments_enabled": boolean;
  };
  "uploads": {
    "id": string;
    "owner_uid": string;
    "cloudinary_public_id": string;
    "status": string;
    "visibility": string;
    "attached_target_type": string | null;
    "attached_target_id": string | null;
    "created_at": string;
    "updated_at": string;
    "expires_at": string;
    "width": number | null;
    "height": number | null;
    "size_bytes": number | null;
    "content_type": string | null;
  };
  "user_facility_category_assignments": {
    "uid": string;
    "category_id": string;
    "notify_on_created": boolean;
    "granted_by": string;
    "granted_at": string;
  };
  "user_issue_category_assignments": {
    "uid": string;
    "category_id": string;
    "granted_by": string;
    "granted_at": string;
  };
  "user_profiles": {
    "uid": string;
    "display_name": string | null;
    "photo_url": string | null;
    "cached_photo_url": string | null;
    "updated_at": string;
    "last_seen_at": string | null;
    "avatar_public_id": string | null;
    "avatar_source_url": string | null;
    "avatar_hash": string | null;
    "avatar_version": number;
    "email": string | null;
    "profile_version": number;
    "avatar_checked_at": string | null;
    "created_at": string;
  };
  "user_restrictions": {
    "uid": string;
    "restricted_until": string | null;
    "restricted_permanently": boolean;
    "reason": string | null;
    "updated_by": string;
    "created_at": string;
    "updated_at": string;
    "target_type": string;
    "preset": string;
  };
  "user_role_assignments": {
    "uid": string;
    "role_code": string;
    "granted_by": string;
    "granted_at": string;
  };
  "user_roles": {
    "uid": string;
    "role": string;
    "created_at": string;
    "updated_at": string;
  };
}

export const GENERATED_DATABASE_FUNCTION_SIGNATURES = [
  "backend_announcement_comment_to_json(comment_record app_private.announcement_comments, replies jsonb) -> jsonb",
  "backend_announcement_to_json(announcement_record app_private.announcements, actor_uid text) -> jsonb",
  "backend_assert_issue_comment_access(issue_id uuid, actor_uid text, actor_is_admin boolean, private_to_owner_categories text[], review_required_categories text[], public_comment_categories text[]) -> app_private.issues",
  "backend_comment_to_json(comment_record app_private.comments, replies jsonb) -> jsonb",
  "backend_commit_user_avatar(actor_uid text, next_avatar_hash text, next_avatar_public_id text, next_avatar_source_url text, next_cached_photo_url text, next_avatar_version integer, next_display_name text) -> jsonb",
  "backend_complete_initial_setup(actor_uid text, issue_categories jsonb, facility_categories jsonb, issues_enabled boolean, facilities_enabled boolean) -> jsonb",
  "backend_create_announcement(actor_uid text, announcement_title text, announcement_content text) -> jsonb",
  "backend_create_announcement_comment(announcement_id uuid, parent_comment_id uuid, actor_uid text, comment_content text) -> jsonb",
  "backend_create_facility(actor_uid text, facility_title text, facility_location text, facility_content text, facility_category text) -> jsonb",
  "backend_create_issue(actor_uid text, issue_title text, issue_content text, issue_category text, issue_status text, support_enabled boolean, support_goal integer, support_deadline_at timestamp with time zone, author_is_private boolean, actor_is_admin boolean, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_create_issue_comment(issue_id uuid, parent_comment_id uuid, actor_uid text, actor_is_admin boolean, comment_content text, private_to_owner_categories text[], review_required_categories text[], public_comment_categories text[]) -> jsonb",
  "backend_delete_announcement(announcement_id uuid) -> jsonb",
  "backend_delete_announcement_comment(comment_id uuid, actor_uid text, actor_is_admin boolean) -> jsonb",
  "backend_delete_facility(facility_id uuid, actor_uid text, actor_can_manage boolean, author_delete_enabled boolean) -> jsonb",
  "backend_delete_facility_category(category_id text, actor_uid text) -> jsonb",
  "backend_delete_issue(issue_id uuid, actor_uid text, actor_is_admin boolean) -> void",
  "backend_delete_issue_category(category_id text, actor_uid text) -> jsonb",
  "backend_delete_issue_comment(comment_id uuid, actor_uid text, actor_is_admin boolean) -> jsonb",
  "backend_delete_issue_with_upload_targets(issue_id uuid, actor_uid text, actor_can_manage boolean, author_delete_enabled boolean) -> jsonb",
  "backend_estimate_category_policy_changes(actor_uid text, issue_categories jsonb, deleted_issue_category_ids text[], announcement_comments_enabled boolean) -> jsonb",
  "backend_estimate_retention_cleanup(actor_uid text, retention_config jsonb) -> jsonb",
  "backend_get_access_context(actor_uid text) -> jsonb",
  "backend_get_announcement(announcement_id uuid, actor_uid text) -> jsonb",
  "backend_get_announcement_unread_hint(actor_uid text) -> jsonb",
  "backend_get_facility(facility_id uuid, actor_uid text, actor_can_manage boolean) -> jsonb",
  "backend_get_issue(issue_id uuid, actor_uid text, actor_is_admin boolean, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_get_notification_read_state(actor_uid text) -> jsonb",
  "backend_get_notification_unread_hint(actor_uid text, actor_is_admin boolean) -> jsonb",
  "backend_get_platform_admin_notification_preferences(actor_uid text) -> jsonb",
  "backend_get_session_bootstrap_snapshot(actor_uid text, actor_is_admin boolean, actor_email text, actor_name text, actor_photo_url text, record_visit boolean) -> jsonb",
  "backend_issue_list_to_json(issue_record app_private.issues, actor_uid text, actor_is_admin boolean, current_user_supported boolean, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_issue_to_json(issue_record app_private.issues, actor_uid text, actor_is_admin boolean, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_list_admin_activity(window_hours integer, before_occurred_at timestamp with time zone, before_key text, page_limit integer) -> jsonb",
  "backend_list_admin_audit(search_query text, page_limit integer, page_offset integer) -> jsonb",
  "backend_list_admin_users(search_query text, page_limit integer, page_offset integer) -> jsonb",
  "backend_list_announcement_comments(announcement_id uuid, cursor_id uuid, cursor_created_at timestamp with time zone) -> jsonb",
  "backend_list_announcement_comments(announcement_id uuid, cursor_id uuid, cursor_created_at timestamp with time zone, page_size integer, sort_name text) -> jsonb",
  "backend_list_announcements(actor_uid text, page_size integer, cursor_id uuid, cursor_published_at timestamp with time zone) -> jsonb",
  "backend_list_announcements_snapshot(actor_uid text, page_size integer, cursor_id uuid, cursor_published_at timestamp with time zone) -> jsonb",
  "backend_list_facilities(actor_uid text, actor_is_admin boolean, managed_category_ids text[], category_filter text, bucket text, status_filter text, search_query text, sort_name text, cursor_created_at timestamp with time zone, cursor_number integer, cursor_id uuid, page_size integer) -> jsonb",
  "backend_list_facilities_snapshot(actor_uid text, actor_is_admin boolean, managed_category_ids text[], category_filter text, bucket text, status_filter text, search_query text, sort_name text, cursor_created_at timestamp with time zone, cursor_number integer, cursor_id uuid, page_size integer) -> jsonb",
  "backend_list_issue_comments(issue_id uuid, actor_uid text, actor_is_admin boolean, cursor_id uuid, cursor_created_at timestamp with time zone, page_size integer, sort_name text, private_to_owner_categories text[], review_required_categories text[], public_comment_categories text[]) -> jsonb",
  "backend_list_issue_comments(issue_id uuid, actor_uid text, actor_is_admin boolean, cursor_id uuid, cursor_created_at timestamp with time zone, private_to_owner_categories text[], review_required_categories text[], public_comment_categories text[]) -> jsonb",
  "backend_list_issues(action_name text, actor_uid text, actor_is_admin boolean, active_filter text, status_bucket text, sort_name text, page_size integer, title_query text, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_list_issues_snapshot(action_name text, actor_uid text, actor_can_manage boolean, active_filter text, status_bucket text, sort_name text, page_size integer, title_query text, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer) -> jsonb",
  "backend_list_notifications(actor_uid text, actor_is_admin boolean, notification_source text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone) -> jsonb",
  "backend_list_platform_jobs(actor_uid text, page_limit integer) -> jsonb",
  "backend_list_user_issues(actor_uid text, actor_is_admin boolean, sort_name text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_list_user_issues(actor_uid text, actor_is_admin boolean, status_bucket text, sort_name text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_list_user_issues(actor_uid text, actor_is_admin boolean, status_bucket text, sort_name text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[], title_query text) -> jsonb",
  "backend_list_user_issues_snapshot(actor_uid text, actor_is_admin boolean, status_bucket text, sort_name text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer) -> jsonb",
  "backend_list_user_issues_snapshot(actor_uid text, actor_is_admin boolean, status_bucket text, sort_name text, page_size integer, cursor_id uuid, cursor_created_at timestamp with time zone, cursor_sort_date timestamp with time zone, cursor_sort_number integer, title_query text) -> jsonb",
  "backend_mark_announcements_opened(actor_uid text, opened_through timestamp with time zone) -> jsonb",
  "backend_mark_notifications_opened(actor_uid text, opened_at timestamp with time zone) -> jsonb",
  "backend_moderate_issue_status(issue_id uuid, actor_uid text, actor_is_admin boolean, next_status text, review_rejection_reason text, support_deadline_at timestamp with time zone, review_approved_at timestamp with time zone, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_notification_state_to_json(state_record app_private.notification_states) -> jsonb",
  "backend_notification_to_json(notification_record app_private.notifications, opened_at timestamp with time zone) -> jsonb",
  "backend_platform_admin_notification_recipients(notification_kind text) -> jsonb",
  "backend_process_platform_job_batch(batch_size integer) -> jsonb",
  "backend_push_notification_preference(actor_uid text, device_id text, permission text) -> jsonb",
  "backend_reconcile_platform_admins(actor_uid text, admin_emails text[]) -> jsonb",
  "backend_register_push_token(actor_uid text, device_id text, token text, permission text, platform text, user_agent text) -> jsonb",
  "backend_save_category_management(actor_uid text, issue_categories jsonb, facility_categories jsonb, deleted_issue_category_ids text[], deleted_facility_category_ids text[], issues_enabled boolean, facilities_enabled boolean) -> jsonb",
  "backend_save_category_management(actor_uid text, issue_categories jsonb, facility_categories jsonb, deleted_issue_category_ids text[], deleted_facility_category_ids text[], issues_enabled boolean, facilities_enabled boolean, announcement_comments_enabled boolean) -> jsonb",
  "backend_save_platform_settings(actor_uid text, image_settings jsonb, retention_config jsonb) -> jsonb",
  "backend_set_announcement_like(announcement_id uuid, actor_uid text, liked boolean) -> jsonb",
  "backend_toggle_facility_affected(facility_id uuid, actor_uid text) -> jsonb",
  "backend_toggle_support(issue_id uuid, actor_uid text, remove_support boolean) -> TABLE(supported boolean, support_count integer, goal_met boolean)",
  "backend_update_facility_status(facility_id uuid, actor_uid text, actor_can_manage boolean, next_status text, result_content text) -> jsonb",
  "backend_update_issue_result(issue_id uuid, actor_uid text, actor_is_admin boolean, result_content text, private_to_owner_categories text[], review_required_categories text[], author_private_categories text[]) -> jsonb",
  "backend_update_platform_admin_notification_preferences(actor_uid text, issue_notifications_enabled boolean, facility_notifications_enabled boolean, comment_notifications_enabled boolean) -> jsonb",
  "backend_update_platform_features(actor_uid text, issues_enabled boolean, facilities_enabled boolean) -> jsonb",
  "backend_update_platform_features(actor_uid text, issues_enabled boolean, facilities_enabled boolean, announcement_comments_enabled boolean) -> jsonb",
  "backend_update_user_access_scope(actor_uid text, target_uid text, scope_kind text, category_id text, grant_access boolean) -> jsonb",
  "backend_upsert_notification_state(actor_uid text) -> app_private.notification_states",
  "claim_background_jobs(requested_batch_size integer) -> TABLE(id uuid, job_type text, scope_id text, payload jsonb, status text, estimated_rows bigint, processed_rows bigint, affected_rows bigint, batch_size integer, attempt_count integer, last_attempt_id uuid, next_attempt_at timestamp with time zone, locked_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, result jsonb, error_detail jsonb, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, expires_at timestamp with time zone)",
  "claim_event_deliveries(target_destination text, batch_size integer) -> TABLE(delivery_id uuid, event_id uuid, operation_id uuid, destination text, attempt_count integer, event_type text, aggregate_type text, aggregate_id text, actor_uid text, occurred_at timestamp with time zone, payload jsonb, aggregate_version integer, last_attempt_id uuid)",
  "claim_operation(operation_id uuid, actor_uid text, action_name text) -> TABLE(claimed boolean, completed boolean, response jsonb)",
  "complete_background_job(job_id uuid, attempt_id uuid, job_result jsonb) -> void",
  "complete_event_delivery(delivery_id uuid, attempt_id uuid) -> void",
  "complete_operation(operation_id uuid, action_response jsonb) -> void",
  "enqueue_background_job(job_type text, scope_id text, payload jsonb, created_by text) -> uuid",
  "fail_background_job(job_id uuid, attempt_id uuid, error_info jsonb) -> void",
  "fail_event_delivery(delivery_id uuid, attempt_id uuid, error_info jsonb) -> void",
  "fail_operation(operation_id uuid, error_detail jsonb) -> void",
  "get_admin_overview(window_hours integer) -> jsonb",
  "get_platform_dashboard_snapshot() -> jsonb",
  "pending_delivery_destinations() -> text[]",
  "record_domain_event(operation_id uuid, aggregate_type text, aggregate_id text, event_type text, actor_uid text, payload jsonb, destinations text[]) -> uuid",
  "reject_expired_support_issues() -> integer",
  "run_scheduled_maintenance_cleanup() -> jsonb",
  "save_operation_policies(actor_uid text, expected_revision integer, policy_values jsonb, reason text) -> jsonb",
  "set_operation_context(operation_id uuid) -> void",
] as const;

