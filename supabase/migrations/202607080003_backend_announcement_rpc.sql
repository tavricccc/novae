create or replace function app_api.backend_announcement_to_json(
  announcement_record app_private.announcements,
  actor_uid text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  current_user_liked boolean;
begin
  select exists (
    select 1
    from app_private.announcement_likes
    where announcement_id = announcement_record.id
      and uid = actor_uid
  ) into current_user_liked;

  return jsonb_build_object(
    'id', announcement_record.id,
    'author_uid', announcement_record.author_uid,
    'author_name', announcement_record.author_name,
    'author_photo_url', announcement_record.author_photo_url,
    'title', announcement_record.title,
    'content', announcement_record.content,
    'like_count', announcement_record.like_count,
    'comment_count', announcement_record.comment_count,
    'published_at', announcement_record.published_at,
    'published_at_ms', floor(extract(epoch from announcement_record.published_at) * 1000),
    'created_at', announcement_record.created_at,
    'created_at_ms', floor(extract(epoch from announcement_record.created_at) * 1000),
    'updated_at', announcement_record.updated_at,
    'updated_at_ms', floor(extract(epoch from announcement_record.updated_at) * 1000),
    'currentUserLiked', current_user_liked
  );
end;
$$;

create or replace function app_api.backend_list_announcements(
  actor_uid text,
  sort_name text,
  page_size integer,
  cursor_id uuid,
  cursor_published_at timestamptz,
  cursor_sort_number integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 10), 1), 30);
  query_limit integer := least(greatest(coalesce(page_size, 10), 1), 30) + 1;
  rows_json jsonb := '[]'::jsonb;
  last_announcement jsonb;
  announcement_record app_private.announcements%rowtype;
begin
  for announcement_record in
    select *
    from app_private.announcements
    where (
      cursor_id is null
      or case
        when sort_name = 'most-liked' and cursor_sort_number is not null then
          like_count < cursor_sort_number
          or (like_count = cursor_sort_number and published_at < cursor_published_at)
          or (like_count = cursor_sort_number and published_at = cursor_published_at and id < cursor_id)
        when sort_name = 'most-commented' and cursor_sort_number is not null then
          comment_count < cursor_sort_number
          or (comment_count = cursor_sort_number and published_at < cursor_published_at)
          or (comment_count = cursor_sort_number and published_at = cursor_published_at and id < cursor_id)
        else
          published_at < cursor_published_at
          or (published_at = cursor_published_at and id < cursor_id)
      end
    )
    order by
      case when sort_name = 'most-liked' then like_count end desc,
      case when sort_name = 'most-commented' then comment_count end desc,
      published_at desc,
      id desc
    limit query_limit
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_announcement_to_json(announcement_record, actor_uid));
  end loop;

  last_announcement := rows_json -> (limited_page_size - 1);

  return jsonb_build_object(
    'announcements', (
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
      when jsonb_array_length(rows_json) > limited_page_size and last_announcement is not null then
        jsonb_build_object(
          'id', last_announcement ->> 'id',
          'publishedAtMs', last_announcement -> 'published_at_ms',
          'sortNumber', case
            when sort_name = 'most-liked' then last_announcement -> 'like_count'
            when sort_name = 'most-commented' then last_announcement -> 'comment_count'
            else null
          end
        )
      else null
    end
  );
end;
$$;

create or replace function app_api.backend_get_announcement(
  announcement_id uuid,
  actor_uid text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  announcement_record app_private.announcements%rowtype;
begin
  select * into announcement_record
  from app_private.announcements
  where id = backend_get_announcement.announcement_id;

  if not found then
    raise exception 'not-found';
  end if;

  return app_api.backend_announcement_to_json(announcement_record, actor_uid);
end;
$$;

create or replace function app_api.backend_create_announcement(
  actor_uid text,
  actor_name text,
  actor_photo_url text,
  announcement_title text,
  announcement_content text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  announcement_record app_private.announcements%rowtype;
begin
  insert into app_private.announcements(author_uid, author_name, author_photo_url, title, content)
  values (actor_uid, coalesce(nullif(actor_name, ''), '管理員'), actor_photo_url, announcement_title, announcement_content)
  returning * into announcement_record;

  return app_api.backend_announcement_to_json(announcement_record, actor_uid);
end;
$$;

create or replace function app_api.backend_update_announcement(
  announcement_id uuid,
  actor_uid text,
  announcement_title text,
  announcement_content text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  announcement_record app_private.announcements%rowtype;
  previous_upload_ids jsonb;
begin
  select coalesce(jsonb_agg(id), '[]'::jsonb)
  into previous_upload_ids
  from app_private.uploads
  where attached_target_type = 'announcement'
    and attached_target_id = backend_update_announcement.announcement_id;

  update app_private.announcements
  set title = announcement_title,
      content = announcement_content,
      updated_at = now()
  where id = backend_update_announcement.announcement_id
  returning * into announcement_record;

  if not found then
    raise exception 'not-found';
  end if;

  return jsonb_build_object(
    'announcement', app_api.backend_announcement_to_json(announcement_record, actor_uid),
    'previous_upload_ids', previous_upload_ids
  );
end;
$$;

create or replace function app_api.backend_delete_announcement(
  announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  upload_targets jsonb;
begin
  select jsonb_build_array(jsonb_build_object('id', backend_delete_announcement.announcement_id, 'type', 'announcement'))
    || coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', 'announcement_comment')), '[]'::jsonb)
  into upload_targets
  from app_private.announcement_comments
  where announcement_id = backend_delete_announcement.announcement_id;

  delete from app_private.announcements
  where id = backend_delete_announcement.announcement_id;

  return jsonb_build_object(
    'success', true,
          'upload_targets', coalesce(upload_targets, jsonb_build_array(jsonb_build_object('id', backend_delete_announcement.announcement_id, 'type', 'announcement')))
  );
end;
$$;

create or replace function app_api.backend_set_announcement_like(
  announcement_id uuid,
  actor_uid text,
  liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  next_like_count integer;
begin
  if liked then
    insert into app_private.announcement_likes(announcement_id, uid)
    values (backend_set_announcement_like.announcement_id, actor_uid)
    on conflict (announcement_id, uid) do nothing;
  else
    delete from app_private.announcement_likes
    where announcement_likes.announcement_id = backend_set_announcement_like.announcement_id
      and uid = actor_uid;
  end if;

  select like_count into next_like_count
  from app_private.announcements
  where id = backend_set_announcement_like.announcement_id;

  if not found then
    raise exception 'not-found';
  end if;

  return jsonb_build_object('liked', liked, 'like_count', coalesce(next_like_count, 0));
end;
$$;

revoke all on function app_api.backend_announcement_to_json(app_private.announcements,text) from public, anon, authenticated;
revoke all on function app_api.backend_list_announcements(text,text,integer,uuid,timestamptz,integer) from public, anon, authenticated;
revoke all on function app_api.backend_get_announcement(uuid,text) from public, anon, authenticated;
revoke all on function app_api.backend_create_announcement(text,text,text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_update_announcement(uuid,text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_delete_announcement(uuid) from public, anon, authenticated;
revoke all on function app_api.backend_set_announcement_like(uuid,text,boolean) from public, anon, authenticated;

grant execute on function app_api.backend_announcement_to_json(app_private.announcements,text) to service_role;
grant execute on function app_api.backend_list_announcements(text,text,integer,uuid,timestamptz,integer) to service_role;
grant execute on function app_api.backend_get_announcement(uuid,text) to service_role;
grant execute on function app_api.backend_create_announcement(text,text,text,text,text) to service_role;
grant execute on function app_api.backend_update_announcement(uuid,text,text,text) to service_role;
grant execute on function app_api.backend_delete_announcement(uuid) to service_role;
grant execute on function app_api.backend_set_announcement_like(uuid,text,boolean) to service_role;
