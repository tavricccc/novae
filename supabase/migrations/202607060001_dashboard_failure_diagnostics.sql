-- Expand dashboard failure diagnostics and keep operational error records for seven days.

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

revoke all on function app_api.get_platform_dashboard_snapshot() from public, anon, authenticated;
grant execute on function app_api.get_platform_dashboard_snapshot() to service_role;

create or replace function app_private.run_maintenance_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  cleanup_details jsonb := '{}'::jsonb;
  deleted_count integer := 0;
  failed_deletion_jobs_too_old integer := 0;
  queued_count integer := 0;
  run_id uuid;
  run_status text := 'success';
begin
  insert into app_private.maintenance_runs (task_name, status, started_at)
  values ('maintenance.cleanup', 'running', now())
  returning id into run_id;

  with stale_uploads as (
    select id, cloudinary_public_id
    from app_private.uploads
    where cloudinary_public_id is not null
      and (
        (status = 'pending' and created_at < now() - interval '24 hours')
        or (status = 'ready' and attached_target_id is null and updated_at < now() - interval '7 days')
        or (status = 'failed' and updated_at < now() - interval '7 days')
      )
  ),
  queued_upload_deletions as (
    insert into app_private.deletion_jobs (target_type, target_id, cloudinary_public_id)
    select 'upload', id::text, cloudinary_public_id
    from stale_uploads
    returning 1
  ),
  deleted_uploads as (
    delete from app_private.uploads
    where id in (select id from stale_uploads)
    returning 1
  )
  select
    (select count(*) from queued_upload_deletions),
    (select count(*) from deleted_uploads)
  into queued_count, deleted_count;
  cleanup_details := cleanup_details || jsonb_build_object(
    'uploads_queued_for_deletion', queued_count,
    'uploads_deleted', deleted_count
  );

  delete from app_private.notifications
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('notifications_deleted', deleted_count);

  delete from app_private.outbox_events
  where status in ('completed', 'failed')
    and updated_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('outbox_events_deleted', deleted_count);

  delete from app_private.push_delivery_logs
  where updated_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('push_delivery_logs_deleted', deleted_count);

  delete from app_private.idempotency_keys
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('idempotency_keys_deleted', deleted_count);

  delete from app_private.push_tokens
  where permission <> 'granted'
    or updated_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('push_tokens_deleted', deleted_count);

  delete from app_private.deletion_jobs
  where status in ('completed', 'failed')
    and updated_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('deletion_jobs_deleted', deleted_count);

  select count(*)::integer
  into failed_deletion_jobs_too_old
  from app_private.deletion_jobs
  where status = 'failed';
  cleanup_details := cleanup_details || jsonb_build_object('failed_deletion_jobs', failed_deletion_jobs_too_old);

  if failed_deletion_jobs_too_old > 0 then
    run_status := 'attention';
  end if;

  delete from app_private.maintenance_runs
  where task_name = 'maintenance.cleanup'
    and id <> run_id
    and started_at < now() - interval '7 days';

  update app_private.maintenance_runs
  set
    status = run_status,
    completed_at = now(),
    details = cleanup_details
  where id = run_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', run_id,
    'status', run_status,
    'details', cleanup_details
  );
exception
  when others then
    if run_id is not null then
      update app_private.maintenance_runs
      set
        status = 'failed',
        completed_at = now(),
        error = left(sqlerrm, 1000),
        details = cleanup_details
      where id = run_id;
    end if;
    raise;
end;
$$;
