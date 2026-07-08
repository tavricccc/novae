create or replace function app_api.backend_comment_to_json(comment_record app_private.comments, replies jsonb default '[]'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  select jsonb_build_object(
    'id', comment_record.id,
    'issue_id', comment_record.issue_id,
    'parent_comment_id', comment_record.parent_comment_id,
    'author_uid', comment_record.author_uid,
    'author_name', comment_record.author_name,
    'author_photo_url', comment_record.author_photo_url,
    'content', comment_record.content,
    'is_admin_comment', comment_record.is_admin_comment,
    'created_at', comment_record.created_at,
    'created_at_ms', floor(extract(epoch from comment_record.created_at) * 1000),
    'updated_at', comment_record.updated_at,
    'updated_at_ms', floor(extract(epoch from comment_record.updated_at) * 1000),
    'replies', replies
  );
$$;

create or replace function app_api.backend_announcement_comment_to_json(comment_record app_private.announcement_comments, replies jsonb default '[]'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  select jsonb_build_object(
    'id', comment_record.id,
    'announcement_id', comment_record.announcement_id,
    'parent_comment_id', comment_record.parent_comment_id,
    'author_uid', comment_record.author_uid,
    'author_name', comment_record.author_name,
    'author_photo_url', comment_record.author_photo_url,
    'content', comment_record.content,
    'is_admin_comment', comment_record.is_admin_comment,
    'created_at', comment_record.created_at,
    'created_at_ms', floor(extract(epoch from comment_record.created_at) * 1000),
    'updated_at', comment_record.updated_at,
    'updated_at_ms', floor(extract(epoch from comment_record.updated_at) * 1000),
    'replies', replies
  );
$$;

create or replace function app_api.backend_assert_issue_comment_access(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  private_to_owner_categories text[],
  review_required_categories text[],
  public_comment_categories text[]
)
returns app_private.issues
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  issue_record app_private.issues%rowtype;
begin
  select * into issue_record
  from app_private.issues
  where id = backend_assert_issue_comment_access.issue_id;

  if not found then
    raise exception 'not-found';
  end if;

  if not actor_is_admin
    and issue_record.author_uid <> actor_uid
    and issue_record.category = any(private_to_owner_categories)
  then
    raise exception 'not-found';
  end if;

  if not actor_is_admin
    and issue_record.author_uid <> actor_uid
    and issue_record.category = any(review_required_categories)
    and issue_record.status in ('under-review', 'review-rejected')
  then
    raise exception 'not-found';
  end if;

  if issue_record.category = any(public_comment_categories)
    and issue_record.status in ('under-review', 'review-rejected')
  then
    raise exception 'not-found';
  end if;

  return issue_record;
end;
$$;

create or replace function app_api.backend_list_issue_comments(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  cursor_id uuid,
  cursor_created_at timestamptz,
  private_to_owner_categories text[],
  review_required_categories text[],
  public_comment_categories text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  page_size integer := 20;
  rows_json jsonb := '[]'::jsonb;
  last_comment jsonb;
  comment_record app_private.comments%rowtype;
  reply_rows jsonb;
begin
  perform app_api.backend_assert_issue_comment_access(
    issue_id,
    actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    public_comment_categories
  );

  for comment_record in
    select *
    from app_private.comments
    where comments.issue_id = backend_list_issue_comments.issue_id
      and parent_comment_id is null
      and (
        cursor_id is null
        or created_at > cursor_created_at
        or (created_at = cursor_created_at and id > cursor_id)
      )
    order by created_at asc, id asc
    limit page_size + 1
  loop
    select coalesce(jsonb_agg(app_api.backend_comment_to_json(reply, '[]'::jsonb) order by reply.created_at asc, reply.id asc), '[]'::jsonb)
    into reply_rows
    from app_private.comments reply
    where reply.parent_comment_id = comment_record.id;

    rows_json := rows_json || jsonb_build_array(app_api.backend_comment_to_json(comment_record, reply_rows));
  end loop;

  last_comment := rows_json -> (page_size - 1);

  return jsonb_build_object(
    'comments', (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (
        select value
        from jsonb_array_elements(rows_json) with ordinality as items(value, position)
        where position <= page_size
        order by position
      ) limited_rows
    ),
    'hasMore', jsonb_array_length(rows_json) > page_size,
    'cursor', case
      when jsonb_array_length(rows_json) > page_size and last_comment is not null then
        jsonb_build_object('id', last_comment ->> 'id', 'createdAtMs', last_comment -> 'created_at_ms')
      else null
    end
  );
end;
$$;

create or replace function app_api.backend_create_issue_comment(
  issue_id uuid,
  parent_comment_id uuid,
  actor_uid text,
  actor_name text,
  actor_photo_url text,
  comment_content text,
  actor_is_admin boolean,
  private_to_owner_categories text[],
  review_required_categories text[],
  public_comment_categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  comment_record app_private.comments%rowtype;
  parent_record app_private.comments%rowtype;
begin
  perform app_api.backend_assert_issue_comment_access(
    issue_id,
    actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    public_comment_categories
  );

  if parent_comment_id is not null then
    select * into parent_record
    from app_private.comments
    where id = backend_create_issue_comment.parent_comment_id;

    if not found
      or parent_record.issue_id <> backend_create_issue_comment.issue_id
      or parent_record.parent_comment_id is not null
    then
      raise exception 'invalid-parent-comment';
    end if;
  end if;

  insert into app_private.comments(issue_id, parent_comment_id, author_uid, author_name, author_photo_url, content, is_admin_comment)
  values (backend_create_issue_comment.issue_id, backend_create_issue_comment.parent_comment_id, actor_uid, actor_name, actor_photo_url, comment_content, false)
  returning * into comment_record;

  return app_api.backend_comment_to_json(comment_record, '[]'::jsonb);
end;
$$;

create or replace function app_api.backend_delete_issue_comment(
  comment_id uuid,
  actor_uid text,
  actor_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  comment_record app_private.comments%rowtype;
  upload_targets jsonb;
begin
  select * into comment_record
  from app_private.comments
  where id = backend_delete_issue_comment.comment_id;

  if found and comment_record.author_uid <> actor_uid and not actor_is_admin then
    raise exception 'permission-denied';
  end if;

  if found then
    select jsonb_build_array(jsonb_build_object('id', backend_delete_issue_comment.comment_id, 'type', 'comment'))
      || coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', 'comment')), '[]'::jsonb)
    into upload_targets
    from app_private.comments
    where parent_comment_id = backend_delete_issue_comment.comment_id;
  end if;

  delete from app_private.comments
  where id = backend_delete_issue_comment.comment_id;

  return jsonb_build_object(
    'success', true,
    'upload_targets', coalesce(upload_targets, jsonb_build_array(jsonb_build_object('id', backend_delete_issue_comment.comment_id, 'type', 'comment')))
  );
end;
$$;

create or replace function app_api.backend_list_announcement_comments(
  announcement_id uuid,
  cursor_id uuid,
  cursor_created_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  page_size integer := 20;
  rows_json jsonb := '[]'::jsonb;
  last_comment jsonb;
  comment_record app_private.announcement_comments%rowtype;
  reply_rows jsonb;
begin
  for comment_record in
    select *
    from app_private.announcement_comments
    where announcement_comments.announcement_id = backend_list_announcement_comments.announcement_id
      and parent_comment_id is null
      and (
        cursor_id is null
        or created_at > cursor_created_at
        or (created_at = cursor_created_at and id > cursor_id)
      )
    order by created_at asc, id asc
    limit page_size + 1
  loop
    select coalesce(jsonb_agg(app_api.backend_announcement_comment_to_json(reply, '[]'::jsonb) order by reply.created_at asc, reply.id asc), '[]'::jsonb)
    into reply_rows
    from app_private.announcement_comments reply
    where reply.parent_comment_id = comment_record.id;

    rows_json := rows_json || jsonb_build_array(app_api.backend_announcement_comment_to_json(comment_record, reply_rows));
  end loop;

  last_comment := rows_json -> (page_size - 1);

  return jsonb_build_object(
    'comments', (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (
        select value
        from jsonb_array_elements(rows_json) with ordinality as items(value, position)
        where position <= page_size
        order by position
      ) limited_rows
    ),
    'hasMore', jsonb_array_length(rows_json) > page_size,
    'cursor', case
      when jsonb_array_length(rows_json) > page_size and last_comment is not null then
        jsonb_build_object('id', last_comment ->> 'id', 'createdAtMs', last_comment -> 'created_at_ms')
      else null
    end
  );
end;
$$;

create or replace function app_api.backend_create_announcement_comment(
  announcement_id uuid,
  parent_comment_id uuid,
  actor_uid text,
  actor_name text,
  actor_photo_url text,
  comment_content text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  comment_record app_private.announcement_comments%rowtype;
  parent_record app_private.announcement_comments%rowtype;
  next_comment_count integer;
begin
  if parent_comment_id is not null then
    select * into parent_record
    from app_private.announcement_comments
    where id = backend_create_announcement_comment.parent_comment_id;

    if not found
      or parent_record.announcement_id <> backend_create_announcement_comment.announcement_id
      or parent_record.parent_comment_id is not null
    then
      raise exception 'invalid-parent-comment';
    end if;
  end if;

  insert into app_private.announcement_comments(announcement_id, parent_comment_id, author_uid, author_name, author_photo_url, content, is_admin_comment)
  values (backend_create_announcement_comment.announcement_id, backend_create_announcement_comment.parent_comment_id, actor_uid, actor_name, actor_photo_url, comment_content, false)
  returning * into comment_record;

  select comment_count into next_comment_count
  from app_private.announcements
  where id = backend_create_announcement_comment.announcement_id;

  return jsonb_build_object(
    'comment', app_api.backend_announcement_comment_to_json(comment_record, '[]'::jsonb),
    'comment_count', coalesce(next_comment_count, 0)
  );
end;
$$;

create or replace function app_api.backend_delete_announcement_comment(
  comment_id uuid,
  actor_uid text,
  actor_is_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  comment_record app_private.announcement_comments%rowtype;
  upload_targets jsonb;
  next_comment_count integer := 0;
begin
  select * into comment_record
  from app_private.announcement_comments
  where id = backend_delete_announcement_comment.comment_id;

  if found and comment_record.author_uid <> actor_uid and not actor_is_admin then
    raise exception 'permission-denied';
  end if;

  if found then
    select jsonb_build_array(jsonb_build_object('id', backend_delete_announcement_comment.comment_id, 'type', 'announcement_comment'))
      || coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', 'announcement_comment')), '[]'::jsonb)
    into upload_targets
    from app_private.announcement_comments
    where parent_comment_id = backend_delete_announcement_comment.comment_id;
  end if;

  delete from app_private.announcement_comments
  where id = backend_delete_announcement_comment.comment_id;

  if found then
    select comment_count into next_comment_count
    from app_private.announcements
    where id = comment_record.announcement_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'announcement_id', coalesce(comment_record.announcement_id::text, ''),
    'comment_count', coalesce(next_comment_count, 0),
    'upload_targets', coalesce(upload_targets, jsonb_build_array(jsonb_build_object('id', backend_delete_announcement_comment.comment_id, 'type', 'announcement_comment')))
  );
end;
$$;

revoke all on function app_api.backend_comment_to_json(app_private.comments,jsonb) from public, anon, authenticated;
revoke all on function app_api.backend_announcement_comment_to_json(app_private.announcement_comments,jsonb) from public, anon, authenticated;
revoke all on function app_api.backend_assert_issue_comment_access(uuid,text,boolean,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_list_issue_comments(uuid,text,boolean,uuid,timestamptz,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_create_issue_comment(uuid,uuid,text,text,text,text,boolean,text[],text[],text[]) from public, anon, authenticated;
revoke all on function app_api.backend_delete_issue_comment(uuid,text,boolean) from public, anon, authenticated;
revoke all on function app_api.backend_list_announcement_comments(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function app_api.backend_create_announcement_comment(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_delete_announcement_comment(uuid,text,boolean) from public, anon, authenticated;

grant execute on function app_api.backend_comment_to_json(app_private.comments,jsonb) to service_role;
grant execute on function app_api.backend_announcement_comment_to_json(app_private.announcement_comments,jsonb) to service_role;
grant execute on function app_api.backend_assert_issue_comment_access(uuid,text,boolean,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_list_issue_comments(uuid,text,boolean,uuid,timestamptz,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_create_issue_comment(uuid,uuid,text,text,text,text,boolean,text[],text[],text[]) to service_role;
grant execute on function app_api.backend_delete_issue_comment(uuid,text,boolean) to service_role;
grant execute on function app_api.backend_list_announcement_comments(uuid,uuid,timestamptz) to service_role;
grant execute on function app_api.backend_create_announcement_comment(uuid,uuid,text,text,text,text) to service_role;
grant execute on function app_api.backend_delete_announcement_comment(uuid,text,boolean) to service_role;
