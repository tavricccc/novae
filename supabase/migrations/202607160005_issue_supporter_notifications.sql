-- Preserve issue supporter recipients when an issue is deleted so the
-- asynchronous outbox worker can still notify them after cascade deletion.

create or replace function app_api.backend_delete_issue_with_upload_targets(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  issue_record app_private.issues%rowtype;
  upload_targets jsonb;
  supporter_uids jsonb;
begin
  select * into issue_record
  from app_private.issues
  where id = backend_delete_issue_with_upload_targets.issue_id
  for update;

  if not found then
    return jsonb_build_object('success', true, 'issueId', issue_id, 'upload_targets', '[]'::jsonb);
  end if;

  if issue_record.author_uid <> actor_uid and not actor_is_admin then
    raise exception 'permission-denied';
  end if;

  select jsonb_build_array(jsonb_build_object('id', issue_record.id, 'type', 'issue'))
    || coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', 'comment')), '[]'::jsonb)
  into upload_targets
  from app_private.comments
  where comments.issue_id = issue_record.id;

  select coalesce(jsonb_agg(supporter.uid order by supporter.created_at), '[]'::jsonb)
  into supporter_uids
  from app_private.supports supporter
  where supporter.issue_id = issue_record.id;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'issue.deleted',
    'issue',
    issue_record.id::text,
    actor_uid,
    jsonb_build_object(
      'author_uid', issue_record.author_uid,
      'issue_category', issue_record.category,
      'issue_id', issue_record.id,
      'supporter_uids', supporter_uids,
      'title', issue_record.title
    )
  );

  delete from app_private.issues
  where id = issue_record.id;

  return jsonb_build_object(
    'success', true,
    'issueId', issue_record.id,
    'upload_targets', upload_targets
  );
end;
$$;

revoke all on function app_api.backend_delete_issue_with_upload_targets(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function app_api.backend_delete_issue_with_upload_targets(uuid,text,boolean)
  to service_role;
