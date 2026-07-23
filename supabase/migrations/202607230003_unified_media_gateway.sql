create or replace function app_private.run_maintenance_cleanup(
  valid_issue_categories text[] default null,
  retention_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  cleanup_details jsonb := '{}'::jsonb;
  deleted_count integer := 0;
  queued_count integer := 0;
  failed_deletion_jobs integer := 0;
  failure_trace_id uuid;
  run_id uuid;
  run_status text := 'success';
  closed_issue_days integer := greatest(1, least(3650, coalesce((retention_config->>'closedIssuesDays')::integer, 365)));
  closed_facility_days integer := greatest(1, least(3650, coalesce((retention_config->>'closedFacilitiesDays')::integer, 365)));
  notifications_days integer := greatest(1, least(3650, coalesce((retention_config->>'notificationsDays')::integer, 7)));
  realtime_hours integer := greatest(1, least(87600, coalesce((retention_config->>'realtimeEventsHours')::integer, 24)));
  outbox_completed_days integer := greatest(1, least(3650, coalesce((retention_config->>'outboxCompletedDays')::integer, 1)));
  outbox_failed_days integer := greatest(1, least(3650, coalesce((retention_config->>'outboxFailedDays')::integer, 3)));
  push_sent_days integer := greatest(1, least(3650, coalesce((retention_config->>'pushDeliverySentDays')::integer, 1)));
  push_failed_days integer := greatest(1, least(3650, coalesce((retention_config->>'pushDeliveryFailedDays')::integer, 3)));
  idempotency_hours integer := greatest(1, least(87600, coalesce((retention_config->>'idempotencyHours')::integer, 24)));
  inactive_push_token_days integer := greatest(1, least(3650, coalesce((retention_config->>'inactivePushTokensDays')::integer, 90)));
  deletion_completed_days integer := greatest(1, least(3650, coalesce((retention_config->>'deletionJobCompletedDays')::integer, 1)));
  deletion_failed_days integer := greatest(1, least(3650, coalesce((retention_config->>'deletionJobFailedDays')::integer, 3)));
  maintenance_days integer := greatest(1, least(3650, coalesce((retention_config->>'maintenanceRunsDays')::integer, 7)));
  role_audit_days integer := greatest(1, least(3650, coalesce((retention_config->>'roleAssignmentAuditDays')::integer, 365)));
  pending_upload_hours integer := greatest(1, least(87600, coalesce((retention_config->>'pendingUploadHours')::integer, 24)));
  unattached_upload_hours integer := greatest(1, least(87600, coalesce((retention_config->>'unattachedUploadHours')::integer, 48)));
  failed_upload_hours integer := greatest(1, least(87600, coalesce((retention_config->>'failedUploadHours')::integer, 24)));
begin
  insert into app_private.maintenance_runs (task_name, status, started_at)
  values ('maintenance.cleanup', 'running', now())
  returning id into run_id;

  if valid_issue_categories is not null and array_length(valid_issue_categories, 1) > 0 then
    with removed_issues as materialized (
      select id, author_uid, category, title
      from app_private.issues
      where not (category = any(valid_issue_categories))
    ), queued_events as (
      insert into app_private.outbox_events (event_type, target_type, target_id, actor_uid, payload)
      select 'issue.deleted', 'issue', id::text, author_uid,
        jsonb_build_object('author_uid', author_uid, 'issue_category', category, 'issue_id', id, 'title', title)
      from removed_issues
      returning 1
    ), deleted_issues as (
      delete from app_private.issues where id in (select id from removed_issues) returning 1
    )
    select (select count(*) from deleted_issues), (select count(*) from queued_events)
    into deleted_count, queued_count;
    cleanup_details := cleanup_details || jsonb_build_object(
      'removed_category_issues_deleted', deleted_count,
      'removed_category_deletion_events_queued', queued_count
    );
  else
    cleanup_details := cleanup_details || jsonb_build_object(
      'removed_category_issues_deleted', 0,
      'removed_category_deletion_events_queued', 0
    );
  end if;

  with expired_issues as materialized (
    select id, author_uid, category, title
    from app_private.issues
    where status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed')
      and closed_at < now() - make_interval(days => closed_issue_days)
  ), queued_events as (
    insert into app_private.outbox_events (event_type, target_type, target_id, actor_uid, payload)
    select 'issue.deleted', 'issue', expired_issue.id::text, expired_issue.author_uid,
      jsonb_build_object(
        'author_uid', expired_issue.author_uid,
        'issue_category', expired_issue.category,
        'issue_id', expired_issue.id,
        'retention_cleanup', true,
        'title', expired_issue.title
      )
    from expired_issues expired_issue
    where exists (
      select 1 from app_private.notion_pages notion_page
      where notion_page.target_type = 'issue'
        and notion_page.target_id = expired_issue.id::text
    )
    returning 1
  ), deleted_issues as (
    delete from app_private.issues where id in (select id from expired_issues) returning 1
  )
  select (select count(*) from deleted_issues), (select count(*) from queued_events)
  into deleted_count, queued_count;
  cleanup_details := cleanup_details || jsonb_build_object(
    'expired_closed_issues_deleted', deleted_count,
    'expired_closed_issue_notion_deletions_queued', queued_count
  );

  with expired_facilities as materialized (
    select id, author_uid, title
    from app_private.facility_reports
    where status in ('completed', 'unable-to-handle')
      and closed_at < now() - make_interval(days => closed_facility_days)
  ), queued_events as (
    insert into app_private.outbox_events (event_type, target_type, target_id, actor_uid, payload)
    select 'facility.deleted', 'facility', expired_facility.id::text, expired_facility.author_uid,
      jsonb_build_object(
        'author_uid', expired_facility.author_uid,
        'retention_cleanup', true,
        'title', expired_facility.title
      )
    from expired_facilities expired_facility
    where exists (
      select 1 from app_private.notion_pages notion_page
      where notion_page.target_type = 'facility'
        and notion_page.target_id = expired_facility.id::text
    )
    returning 1
  ), deleted_facilities as (
    delete from app_private.facility_reports where id in (select id from expired_facilities) returning 1
  )
  select (select count(*) from deleted_facilities), (select count(*) from queued_events)
  into deleted_count, queued_count;
  cleanup_details := cleanup_details || jsonb_build_object(
    'expired_closed_facilities_deleted', deleted_count,
    'expired_closed_facility_notion_deletions_queued', queued_count
  );

  with stale_uploads as materialized (
    select id, cloudinary_public_id
    from app_private.uploads
    where cloudinary_public_id is not null and (
      (status = 'pending' and created_at < now() - make_interval(hours => pending_upload_hours))
      or (status = 'ready' and attached_target_id is null and updated_at < now() - make_interval(hours => unattached_upload_hours))
      or (status = 'failed' and updated_at < now() - make_interval(hours => failed_upload_hours))
    )
  ), queued_uploads as (
    insert into app_private.deletion_jobs (target_type, target_id, cloudinary_public_id)
    select 'upload', id::text, cloudinary_public_id from stale_uploads
    returning 1
  ), deleted_uploads as (
    delete from app_private.uploads where id in (select id from stale_uploads) returning 1
  )
  select (select count(*) from queued_uploads), (select count(*) from deleted_uploads)
  into queued_count, deleted_count;
  cleanup_details := cleanup_details || jsonb_build_object(
    'uploads_queued_for_deletion', queued_count,
    'uploads_deleted', deleted_count
  );

  update app_private.notifications
  set expires_at = created_at + make_interval(days => notifications_days)
  where expires_at is distinct from created_at + make_interval(days => notifications_days);
  delete from app_private.notifications where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('notifications_deleted', deleted_count);

  update app_private.realtime_events
  set expires_at = created_at + make_interval(hours => realtime_hours)
  where expires_at is distinct from created_at + make_interval(hours => realtime_hours);
  delete from app_private.realtime_events where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('realtime_events_deleted', deleted_count);

  update app_private.outbox_events
  set expires_at = updated_at + case status
    when 'completed' then make_interval(days => outbox_completed_days)
    else make_interval(days => outbox_failed_days)
  end
  where status in ('completed', 'failed');
  delete from app_private.outbox_events where status in ('completed', 'failed') and expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('outbox_events_deleted', deleted_count);

  delete from app_private.push_delivery_logs
  where (status = 'sent' and updated_at < now() - make_interval(days => push_sent_days))
    or (status = 'failed' and updated_at < now() - make_interval(days => push_failed_days));
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('push_delivery_logs_deleted', deleted_count);

  update app_private.idempotency_keys
  set expires_at = updated_at + make_interval(hours => idempotency_hours)
  where expires_at is distinct from updated_at + make_interval(hours => idempotency_hours);
  delete from app_private.idempotency_keys where expires_at < now();
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('idempotency_keys_deleted', deleted_count);

  delete from app_private.push_tokens
  where permission <> 'granted'
    or updated_at < now() - make_interval(days => inactive_push_token_days);
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('push_tokens_deleted', deleted_count);

  delete from app_private.deletion_jobs
  where (status = 'completed' and updated_at < now() - make_interval(days => deletion_completed_days))
    or (status = 'failed' and updated_at < now() - make_interval(days => deletion_failed_days));
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('deletion_jobs_deleted', deleted_count);

  delete from app_private.role_assignment_audit
  where created_at < now() - make_interval(days => role_audit_days);
  get diagnostics deleted_count = row_count;
  cleanup_details := cleanup_details || jsonb_build_object('role_assignment_audit_deleted', deleted_count);

  select count(*)::integer into failed_deletion_jobs
  from app_private.deletion_jobs where status = 'failed';
  cleanup_details := cleanup_details || jsonb_build_object('failed_deletion_jobs', failed_deletion_jobs);
  if failed_deletion_jobs > 0 then run_status := 'attention'; end if;

  delete from app_private.maintenance_runs
  where task_name = 'maintenance.cleanup'
    and id <> run_id
    and started_at < now() - make_interval(days => maintenance_days);

  update app_private.maintenance_runs
  set status = run_status, completed_at = now(), details = cleanup_details
  where id = run_id;

  return jsonb_build_object('ok', true, 'run_id', run_id, 'status', run_status, 'details', cleanup_details);
exception
  when others then
    if run_id is not null then
      update app_private.maintenance_runs
      set status = 'failed', completed_at = now(), error_trace_id = gen_random_uuid(), details = cleanup_details
      where id = run_id
      returning error_trace_id into failure_trace_id;
      raise warning 'maintenance failure trace %, error %', failure_trace_id, sqlerrm;
    end if;
    raise;
end;
$$;

alter table app_private.uploads
  drop column delivery_url,
  drop column delivery_url_expires_at,
  drop column delivery_url_scope;
