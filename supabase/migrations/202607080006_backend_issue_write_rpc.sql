create or replace function app_api.backend_create_issue(
  actor_uid text,
  actor_name text,
  actor_photo_url text,
  issue_title text,
  issue_content text,
  issue_category text,
  issue_status text,
  support_enabled boolean,
  support_goal integer,
  support_deadline_at timestamptz,
  response_deadline_at timestamptz,
  author_is_private boolean,
  actor_is_admin boolean,
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
  insert into app_private.issues(
    author_uid,
    author_name,
    author_photo_url,
    category,
    content,
    response_deadline_at,
    review_approved_at,
    status,
    support_deadline_at,
    support_enabled,
    support_goal,
    title,
    title_search
  )
  values (
    actor_uid,
    actor_name,
    actor_photo_url,
    issue_category,
    issue_content,
    response_deadline_at,
    null,
    issue_status,
    support_deadline_at,
    support_enabled,
    support_goal,
    issue_title,
    lower(issue_title)
  )
  returning * into issue_record;

  if author_is_private then
    insert into app_private.private_issue_authors(issue_id, author_uid, author_name, author_photo_url)
    values (issue_record.id, actor_uid, actor_name, actor_photo_url)
    on conflict (issue_id) do update
    set author_uid = excluded.author_uid,
        author_name = excluded.author_name,
        author_photo_url = excluded.author_photo_url;
  end if;

  return app_api.backend_issue_to_json(
    issue_record,
    actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    author_private_categories
  );
end;
$$;

create or replace function app_api.backend_moderate_issue_status(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  next_status text,
  review_rejection_reason text,
  review_approved_at timestamptz,
  support_deadline_at timestamptz,
  response_deadline_at timestamptz,
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
  if not actor_is_admin then
    raise exception 'permission-denied';
  end if;

  update app_private.issues
  set last_actor_uid = backend_moderate_issue_status.actor_uid,
      review_rejection_reason = backend_moderate_issue_status.review_rejection_reason,
      status = backend_moderate_issue_status.next_status,
      review_approved_at = backend_moderate_issue_status.review_approved_at,
      support_deadline_at = backend_moderate_issue_status.support_deadline_at,
      response_deadline_at = coalesce(backend_moderate_issue_status.response_deadline_at, app_private.issues.response_deadline_at)
  where id = backend_moderate_issue_status.issue_id
  returning * into issue_record;

  if not found then
    raise exception 'not-found';
  end if;

  return app_api.backend_issue_to_json(
    issue_record,
    actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    author_private_categories
  );
end;
$$;

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
  if not actor_is_admin then
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
    backend_delete_issue_with_upload_targets.actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    author_private_categories
  );
end;
$$;

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

revoke all on function app_api.backend_create_issue(text,text,text,text,text,text,text,boolean,integer,timestamptz,timestamptz,boolean,boolean,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_moderate_issue_status(uuid,text,boolean,text,text,timestamptz,timestamptz,timestamptz,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_delete_issue_with_upload_targets(uuid,text,boolean) from public, anon, authenticated;

grant execute on function app_api.backend_create_issue(text,text,text,text,text,text,text,boolean,integer,timestamptz,timestamptz,boolean,boolean,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_moderate_issue_status(uuid,text,boolean,text,text,timestamptz,timestamptz,timestamptz,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_delete_issue_with_upload_targets(uuid,text,boolean) to service_role;
