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

grant execute on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) to service_role;
