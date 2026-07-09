-- Tighten retention for transient operational data while keeping core content records.

alter table app_private.notifications
  alter column expires_at set default now() + interval '7 days';

alter table app_private.realtime_events
  alter column expires_at set default now() + interval '1 day';

alter table app_private.outbox_events
  alter column expires_at set default now() + interval '3 days';

alter table app_private.idempotency_keys
  alter column expires_at set default now() + interval '24 hours';

update app_private.notifications
set expires_at = created_at + interval '7 days'
where expires_at > created_at + interval '7 days';

update app_private.realtime_events
set expires_at = created_at + interval '1 day'
where expires_at > created_at + interval '1 day';

update app_private.outbox_events
set expires_at = least(
  expires_at,
  updated_at + case
    when status = 'completed' then interval '1 day'
    else interval '3 days'
  end
)
where status in ('completed', 'failed');

update app_private.idempotency_keys
set expires_at = least(expires_at, updated_at + interval '24 hours')
where expires_at > updated_at + interval '24 hours';

create or replace function app_api.complete_outbox_event(event_id uuid)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  update app_private.outbox_events
  set
    status = 'completed',
    updated_at = now(),
    expires_at = now() + interval '1 day'
  where id = event_id;
$$;

create or replace function app_api.fail_outbox_event(event_id uuid, error_message text)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  update app_private.outbox_events
  set
    status = 'failed',
    last_error = left(error_message, 1000),
    next_attempt_at = now() + make_interval(mins => least(60, greatest(1, attempt_count * 2))),
    updated_at = now(),
    expires_at = now() + interval '3 days'
  where id = event_id;
$$;

create or replace function app_api.complete_idempotency_key(
  actor_uid text,
  action_name text,
  request_id text,
  action_response jsonb
)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  update app_private.idempotency_keys
  set
    status = 'completed',
    response = action_response,
    updated_at = now(),
    expires_at = now() + interval '24 hours'
  where uid = actor_uid
    and action = action_name
    and idempotency_keys.request_id = complete_idempotency_key.request_id
    and status = 'processing';
$$;

create or replace function app_private.run_maintenance_cleanup(valid_issue_categories text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  cleanup_details jsonb := '{}'::jsonb;
  deleted_count integer := 0;
  failed_deletion_jobs_too_old integer := 0;
  orphan_comments_deleted integer := 0;
  orphan_issues_deleted integer := 0;
  orphan_issue_deletion_events_queued integer := 0;
  orphan_uploads_deleted integer := 0;
  orphan_uploads_queued integer := 0;
  queued_count integer := 0;
  run_id uuid;
  run_status text := 'success';
begin
  insert into app_private.maintenance_runs (task_name, status, started_at)
  values ('maintenance.cleanup', 'running', now())
  returning id into run_id;

  if valid_issue_categories is not null and array_length(valid_issue_categories, 1) > 0 then
    with removed_issues as (
      select id, author_uid, category, title
      from app_private.issues
      where not (category = any(valid_issue_categories))
    ),
    removed_comments as (
      select comments.id
      from app_private.comments comments
      join removed_issues on removed_issues.id = comments.issue_id
    ),
    removed_uploads as (
      select id, cloudinary_public_id
      from app_private.uploads
      where cloudinary_public_id is not null
        and (
          (attached_target_type = 'issue' and attached_target_id in (select id from removed_issues))
          or (attached_target_type = 'comment' and attached_target_id in (select id from removed_comments))
        )
    ),
    queued_orphan_upload_deletions as (
      insert into app_private.deletion_jobs (target_type, target_id, cloudinary_public_id)
      select 'upload', id::text, cloudinary_public_id
      from removed_uploads
      returning 1
    ),
    queued_removed_issue_deletion_events as (
      insert into app_private.outbox_events (event_type, target_type, target_id, actor_uid, payload)
      select
        'issue.deleted',
        'issue',
        id::text,
        author_uid,
        jsonb_build_object(
          'author_uid', author_uid,
          'issue_category', category,
          'issue_id', id,
          'title', title
        )
      from removed_issues
      returning 1
    ),
    deleted_orphan_uploads as (
      delete from app_private.uploads
      where id in (select id from removed_uploads)
      returning 1
    ),
    deleted_orphan_issues as (
      delete from app_private.issues
      where id in (select id from removed_issues)
      returning 1
    )
    select
      (select count(*) from removed_comments),
      (select count(*) from queued_removed_issue_deletion_events),
      (select count(*) from queued_orphan_upload_deletions),
      (select count(*) from deleted_orphan_uploads),
      (select count(*) from deleted_orphan_issues)
    into orphan_comments_deleted, orphan_issue_deletion_events_queued, orphan_uploads_queued, orphan_uploads_deleted, orphan_issues_deleted;

    cleanup_details := cleanup_details || jsonb_build_object(
      'removed_category_comments_deleted', orphan_comments_deleted,
      'removed_category_deletion_events_queued', orphan_issue_deletion_events_queued,
      'removed_category_issues_deleted', orphan_issues_deleted,
      'removed_category_uploads_deleted', orphan_uploads_deleted,
      'removed_category_uploads_queued_for_deletion', orphan_uploads_queued
    );
  else
    cleanup_details := cleanup_details || jsonb_build_object(
      'removed_category_comments_deleted', 0,
      'removed_category_deletion_events_queued', 0,
      'removed_category_issues_deleted', 0,
      'removed_category_uploads_deleted', 0,
      'removed_category_uploads_queued_for_deletion', 0
    );
  end if;

  update app_private.uploads
  set
    delivery_url = null,
    delivery_url_expires_at = null
  where delivery_url_expires_at is not null
    and delivery_url_expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('expired_upload_delivery_urls_cleared', deleted_count);

  with stale_uploads as (
    select id, cloudinary_public_id
    from app_private.uploads
    where cloudinary_public_id is not null
      and (
        (status = 'pending' and created_at < now() - interval '24 hours')
        or (status = 'ready' and attached_target_id is null and updated_at < now() - interval '48 hours')
        or (status = 'failed' and updated_at < now() - interval '24 hours')
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

  delete from app_private.realtime_events
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('realtime_events_deleted', deleted_count);

  delete from app_private.notifications
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('notifications_deleted', deleted_count);

  delete from app_private.outbox_events
  where status in ('completed', 'failed')
    and expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('outbox_events_deleted', deleted_count);

  delete from app_private.push_delivery_logs
  where (status = 'sent' and updated_at < now() - interval '1 day')
    or (status = 'failed' and updated_at < now() - interval '3 days');
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
  where (status = 'completed' and updated_at < now() - interval '1 day')
    or (status = 'failed' and updated_at < now() - interval '3 days');
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
