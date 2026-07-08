create or replace function app_api.backend_update_issue_result(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  result_content text,
  result_updated_at timestamptz,
  private_to_owner_categories text[],
  review_required_categories text[],
  author_private_categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  issue_record app_private.issues%rowtype;
begin
  if not backend_update_issue_result.actor_is_admin then
    raise exception 'permission-denied';
  end if;

  update app_private.issues
  set last_actor_uid = backend_update_issue_result.actor_uid,
      result_content = backend_update_issue_result.result_content,
      result_updated_at = backend_update_issue_result.result_updated_at
  where id = backend_update_issue_result.issue_id
  returning * into issue_record;

  if not found then
    raise exception 'not-found';
  end if;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'issue.result_updated',
    'issue',
    issue_record.id::text,
    backend_update_issue_result.actor_uid,
    jsonb_build_object(
      'author_uid', issue_record.author_uid,
      'issue_category', issue_record.category,
      'issue_id', issue_record.id,
      'result_content', issue_record.result_content,
      'result_updated_at', issue_record.result_updated_at,
      'support_count', issue_record.support_count,
      'support_goal', issue_record.support_goal,
      'title', issue_record.title
    )
  );

  return app_api.backend_issue_to_json(
    issue_record,
    backend_update_issue_result.actor_uid,
    backend_update_issue_result.actor_is_admin,
    backend_update_issue_result.private_to_owner_categories,
    backend_update_issue_result.review_required_categories,
    backend_update_issue_result.author_private_categories
  );
end;
$$;

revoke all on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) from public, anon, authenticated;
grant execute on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) to service_role;
