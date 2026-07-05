-- Aggregate dashboard data in Postgres so the Edge Function does not download entire tables.

create or replace function app_api.get_platform_dashboard_snapshot()
returns jsonb
language sql
security definer
set search_path = app_private, public
as $$
with
counters as (
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) value
  from app_private.platform_counters
),
issue_categories as (
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb) value
  from (select category, count(*)::bigint total from app_private.issues group by category) grouped
),
comment_categories as (
  select coalesce(jsonb_object_agg(category, total), '{}'::jsonb) value
  from (
    select issues.category, count(*)::bigint total
    from app_private.comments
    join app_private.issues on issues.id = comments.issue_id
    group by issues.category
  ) grouped
),
activity as (
  select greatest(
    coalesce((select max(greatest(created_at, updated_at)) from app_private.issues), 'epoch'::timestamptz),
    coalesce((select max(greatest(created_at, updated_at)) from app_private.comments), 'epoch'::timestamptz),
    coalesce((select max(greatest(created_at, updated_at)) from app_private.announcements), 'epoch'::timestamptz),
    coalesce((select max(greatest(created_at, updated_at)) from app_private.announcement_comments), 'epoch'::timestamptz)
  ) value
),
outbox_counts as (
  select
    count(*) filter (where status = 'failed')::bigint failed,
    count(*) filter (where status in ('pending','processing'))::bigint pending,
    count(*) filter (where status = 'failed' and notion_completed_at is null)::bigint notion_failed,
    count(*) filter (where status in ('pending','processing') and notion_completed_at is null)::bigint notion_pending,
    min(created_at) filter (where status in ('pending','processing') and notion_completed_at is null) oldest_notion
  from app_private.outbox_events
),
operation_counts as (
  select
    (select count(*) from app_private.push_delivery_logs where status = 'failed')::bigint push_failed,
    (select count(*) from app_private.uploads where status = 'pending')::bigint upload_pending,
    (select count(*) from app_private.deletion_jobs where status in ('pending','failed','processing'))::bigint deletion_pending
),
maintenance as (
  select coalesce(to_jsonb(row), '{}'::jsonb) value
  from (
    select status, started_at, completed_at, error, details
    from app_private.maintenance_runs
    where task_name = 'maintenance.cleanup'
    order by started_at desc limit 1
  ) row
),
recent_failures as (
  select coalesce(jsonb_agg(item order by updated_at desc), '[]'::jsonb) value
  from (
    select id::text, 'outbox'::text source, status, coalesce(last_error,'') message, updated_at
    from app_private.outbox_events where status='failed'
    union all
    select id::text, 'push'::text, status, coalesce(error_message,''), updated_at
    from app_private.push_delivery_logs where status='failed'
    order by updated_at desc limit 8
  ) item
)
select jsonb_build_object(
  'counters', counters.value,
  'issues_by_category', issue_categories.value,
  'comments_by_category', comment_categories.value,
  'last_activity_at', activity.value,
  'outbox_failed', outbox_counts.failed,
  'outbox_pending', outbox_counts.pending,
  'notion_failed', outbox_counts.notion_failed,
  'notion_pending', outbox_counts.notion_pending,
  'oldest_pending_notion_at', outbox_counts.oldest_notion,
  'push_failed', operation_counts.push_failed,
  'upload_pending', operation_counts.upload_pending,
  'deletion_pending', operation_counts.deletion_pending,
  'maintenance', maintenance.value,
  'recent_failures', recent_failures.value,
  'users_seen', (select count(*) from app_private.user_profiles)
)
from counters, issue_categories, comment_categories, activity, outbox_counts, operation_counts, maintenance, recent_failures;
$$;

revoke all on function app_api.get_platform_dashboard_snapshot() from public, anon, authenticated;
grant execute on function app_api.get_platform_dashboard_snapshot() to service_role;
