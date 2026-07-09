create or replace function app_private.issue_user_sort_date(
  issue_record app_private.issues,
  sort_name text
)
returns timestamptz
language sql
stable
as $$
  select case
    when sort_name = 'ending-soon' then issue_record.support_deadline_at
    when issue_record.status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed') then coalesce(issue_record.closed_at, issue_record.created_at)
    else coalesce(issue_record.review_approved_at, issue_record.created_at)
  end
$$;

create or replace function app_api.backend_list_user_issues(
  actor_uid text,
  actor_is_admin boolean,
  sort_name text,
  page_size integer,
  cursor_id uuid,
  cursor_created_at timestamptz,
  cursor_sort_date timestamptz,
  cursor_sort_number integer,
  private_to_owner_categories text[],
  review_required_categories text[],
  author_private_categories text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  query_limit integer := least(greatest(coalesce(page_size, 20), 1), 50) + 1;
  rows_json jsonb := '[]'::jsonb;
  last_issue jsonb;
  issue_record app_private.issues%rowtype;
begin
  for issue_record in
    select issue_row.*
    from app_private.issues issue_row
    where issue_row.author_uid = actor_uid
      and (
        cursor_id is null
        or case
          when sort_name = 'most-supported' and cursor_sort_number is not null then
            issue_row.support_count < cursor_sort_number
            or (issue_row.support_count = cursor_sort_number and app_private.issue_user_sort_date(issue_row, sort_name) < cursor_sort_date)
            or (issue_row.support_count = cursor_sort_number and app_private.issue_user_sort_date(issue_row, sort_name) = cursor_sort_date and issue_row.id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is not null then
            issue_row.support_deadline_at > cursor_sort_date
            or (issue_row.support_deadline_at = cursor_sort_date and issue_row.created_at < cursor_created_at)
            or (issue_row.support_deadline_at = cursor_sort_date and issue_row.created_at = cursor_created_at and issue_row.id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is null then
            issue_row.support_deadline_at is null
            and (issue_row.created_at < cursor_created_at or (issue_row.created_at = cursor_created_at and issue_row.id < cursor_id))
          else
            app_private.issue_user_sort_date(issue_row, sort_name) < cursor_sort_date
            or (app_private.issue_user_sort_date(issue_row, sort_name) = cursor_sort_date and issue_row.id < cursor_id)
        end
      )
    order by
      case when sort_name = 'most-supported' then issue_row.support_count end desc,
      case when sort_name = 'ending-soon' then issue_row.support_deadline_at end asc nulls last,
      case when sort_name = 'ending-soon' then issue_row.created_at end desc,
      case when sort_name <> 'ending-soon' then app_private.issue_user_sort_date(issue_row, sort_name) end desc,
      issue_row.id desc
    limit query_limit
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_issue_to_json(
      issue_record,
      actor_uid,
      actor_is_admin,
      private_to_owner_categories,
      review_required_categories,
      author_private_categories
    ));
  end loop;

  last_issue := rows_json -> (limited_page_size - 1);

  return jsonb_build_object(
    'issues', (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (
        select value
        from jsonb_array_elements(rows_json) with ordinality as items(value, position)
        where position <= limited_page_size
        order by position
      ) limited_rows
    ),
    'hasMore', jsonb_array_length(rows_json) > limited_page_size,
    'cursor', case
      when jsonb_array_length(rows_json) > limited_page_size and last_issue is not null then
        jsonb_build_object(
          'id', last_issue ->> 'id',
          'created_at', last_issue -> 'created_at_ms',
          'sort_date', case
            when sort_name = 'ending-soon' then last_issue -> 'support_deadline_at_ms'
            when (last_issue ->> 'status') in ('auto-rejected', 'review-rejected', 'infeasible', 'completed') then coalesce(last_issue -> 'closed_at_ms', last_issue -> 'created_at_ms')
            else coalesce(last_issue -> 'review_approved_at_ms', last_issue -> 'created_at_ms')
          end,
          'sort_number', case when sort_name = 'most-supported' then last_issue -> 'support_count' else null end
        )
      else null
    end
  );
end;
$$;

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
    coalesce((select max(created_at) from app_private.issues), 'epoch'::timestamptz),
    coalesce((select max(created_at) from app_private.comments), 'epoch'::timestamptz),
    coalesce((select max(published_at) from app_private.announcements), 'epoch'::timestamptz),
    coalesce((select max(created_at) from app_private.announcement_comments), 'epoch'::timestamptz)
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
    (select count(*) from app_private.deletion_jobs where status in ('pending','failed','processing'))::bigint deletion_pending,
    (select count(*) from app_private.deletion_jobs where status = 'failed')::bigint deletion_failed
),
maintenance as (
  select coalesce((
    select to_jsonb(row)
    from (
      select status, started_at, completed_at, error, details
      from app_private.maintenance_runs
      where task_name = 'maintenance.cleanup'
      order by started_at desc limit 1
    ) row
  ), '{}'::jsonb) value
),
recent_failures as (
  select coalesce(jsonb_agg(item order by updated_at desc), '[]'::jsonb) value
  from (
    select
      id::text,
      'outbox'::text source,
      status,
      coalesce(last_error,'') message,
      event_type detail_type,
      target_type,
      target_id,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    from app_private.outbox_events
    where status='failed'
    union all
    select
      id::text,
      'push'::text,
      status,
      coalesce(error_message,''),
      notification_type,
      target_type,
      target_id,
      null::integer,
      null::timestamptz,
      created_at,
      updated_at
    from app_private.push_delivery_logs
    where status='failed'
    union all
    select
      id::text,
      'cleanup'::text,
      status,
      coalesce(last_error,''),
      target_type,
      target_type,
      target_id,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    from app_private.deletion_jobs
    where status='failed'
    order by updated_at desc
    limit 12
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
  'deletion_failed', operation_counts.deletion_failed,
  'maintenance', maintenance.value,
  'recent_failures', recent_failures.value,
  'users_seen', (select count(*) from app_private.user_profiles)
)
from counters, issue_categories, comment_categories, activity, outbox_counts, operation_counts, maintenance, recent_failures;
$$;
