create or replace function app_api.backend_notification_state_to_json(state_record app_private.notification_states)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  select jsonb_build_object(
    'uid', state_record.uid,
    'broadcast_opened_at', state_record.broadcast_opened_at,
    'broadcast_opened_at_ms', case when state_record.broadcast_opened_at is null then null else floor(extract(epoch from state_record.broadcast_opened_at) * 1000) end,
    'admin_opened_at', state_record.admin_opened_at,
    'admin_opened_at_ms', case when state_record.admin_opened_at is null then null else floor(extract(epoch from state_record.admin_opened_at) * 1000) end,
    'user_opened_at', state_record.user_opened_at,
    'user_opened_at_ms', case when state_record.user_opened_at is null then null else floor(extract(epoch from state_record.user_opened_at) * 1000) end,
    'push_comments_enabled', state_record.push_comments_enabled,
    'push_issue_updates_enabled', state_record.push_issue_updates_enabled,
    'updated_at', state_record.updated_at
  );
$$;

create or replace function app_api.backend_upsert_notification_state(actor_uid text)
returns app_private.notification_states
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  state_record app_private.notification_states%rowtype;
begin
  insert into app_private.notification_states(uid)
  values (actor_uid)
  on conflict (uid) do update set uid = excluded.uid
  returning * into state_record;

  return state_record;
end;
$$;

create or replace function app_api.backend_notification_to_json(notification_record app_private.notifications, opened_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  select to_jsonb(notification_record)
    || jsonb_build_object(
      'created_at_ms', floor(extract(epoch from notification_record.created_at) * 1000),
      'is_read', case when opened_at is null then false else notification_record.created_at <= opened_at end
    );
$$;

create or replace function app_api.backend_list_notifications(
  actor_uid text,
  actor_is_admin boolean,
  notification_source text,
  page_size integer,
  cursor_id uuid,
  cursor_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 10), 1), 30);
  query_limit integer := least(greatest(coalesce(page_size, 10), 1), 30) + 1;
  state_record app_private.notification_states%rowtype;
  opened_at timestamptz;
  rows_json jsonb := '[]'::jsonb;
  last_notification jsonb;
  notification_record app_private.notifications%rowtype;
begin
  if notification_source = 'admin' and not actor_is_admin then
    return jsonb_build_object('notifications', '[]'::jsonb, 'cursor', null, 'hasMore', false);
  end if;

  state_record := app_api.backend_upsert_notification_state(actor_uid);
  opened_at := case
    when notification_source = 'admin' then state_record.admin_opened_at
    when notification_source = 'user' then state_record.user_opened_at
    else state_record.broadcast_opened_at
  end;

  for notification_record in
    select *
    from app_private.notifications
    where source = notification_source
      and (notification_source <> 'user' or recipient_uid = actor_uid)
      and (
        cursor_id is null
        or created_at < cursor_created_at
        or (created_at = cursor_created_at and id < cursor_id)
      )
    order by created_at desc, id desc
    limit query_limit
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_notification_to_json(notification_record, opened_at));
  end loop;

  last_notification := rows_json -> (limited_page_size - 1);

  return jsonb_build_object(
    'notifications', (
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
      when jsonb_array_length(rows_json) > limited_page_size and last_notification is not null then
        jsonb_build_object('id', last_notification ->> 'id', 'createdAtMs', last_notification -> 'created_at_ms')
      else null
    end
  );
end;
$$;

create or replace function app_api.backend_get_notification_read_state(actor_uid text)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  state_record app_private.notification_states%rowtype;
begin
  state_record := app_api.backend_upsert_notification_state(actor_uid);
  return app_api.backend_notification_state_to_json(state_record);
end;
$$;

create or replace function app_api.backend_mark_notifications_opened(actor_uid text, opened_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
begin
  insert into app_private.notification_states(uid, admin_opened_at, broadcast_opened_at, user_opened_at, updated_at)
  values (actor_uid, opened_at, opened_at, opened_at, opened_at)
  on conflict (uid) do update
  set admin_opened_at = excluded.admin_opened_at,
      broadcast_opened_at = excluded.broadcast_opened_at,
      user_opened_at = excluded.user_opened_at,
      updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'openedAtMs', floor(extract(epoch from opened_at) * 1000));
end;
$$;

create or replace function app_api.backend_push_notification_preference(
  actor_uid text,
  device_id text,
  permission text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  state_record app_private.notification_states%rowtype;
  token_count integer;
  device_enabled boolean := false;
begin
  state_record := app_api.backend_upsert_notification_state(actor_uid);

  if coalesce(device_id, '') <> '' then
    select exists (
      select 1
      from app_private.push_tokens
      where uid = actor_uid
        and push_tokens.device_id = backend_push_notification_preference.device_id
    ) into device_enabled;
  end if;

  select count(*) into token_count
  from app_private.push_tokens
  where uid = actor_uid;

  return jsonb_build_object(
    'deviceEnabled', device_enabled,
    'enabled', token_count > 0,
    'personalPreferences', jsonb_build_object(
      'comments', state_record.push_comments_enabled <> false,
      'issueUpdates', state_record.push_issue_updates_enabled <> false
    ),
    'permission', coalesce(permission, 'default'),
    'tokenCount', token_count
  );
end;
$$;

create or replace function app_api.backend_register_push_token(
  actor_uid text,
  device_id text,
  token text,
  permission text,
  platform text,
  user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
begin
  insert into app_private.push_tokens(uid, device_id, token, permission, platform, user_agent, updated_at)
  values (actor_uid, device_id, token, coalesce(permission, 'default'), platform, user_agent, now())
  on conflict (uid, device_id) do update
  set token = excluded.token,
      permission = excluded.permission,
      platform = excluded.platform,
      user_agent = excluded.user_agent,
      updated_at = excluded.updated_at;

  return app_api.backend_push_notification_preference(actor_uid, device_id, permission);
end;
$$;

create or replace function app_api.backend_unregister_push_token(
  actor_uid text,
  device_id text,
  permission text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
begin
  if coalesce(device_id, '') <> '' then
    delete from app_private.push_tokens
    where uid = actor_uid
      and push_tokens.device_id = backend_unregister_push_token.device_id;
  end if;

  return app_api.backend_push_notification_preference(actor_uid, device_id, permission);
end;
$$;

create or replace function app_api.backend_update_push_notification_preferences(
  actor_uid text,
  comments_enabled boolean,
  issue_updates_enabled boolean,
  device_id text,
  permission text
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
begin
  insert into app_private.notification_states(uid, push_comments_enabled, push_issue_updates_enabled, updated_at)
  values (actor_uid, comments_enabled, issue_updates_enabled, now())
  on conflict (uid) do update
  set push_comments_enabled = excluded.push_comments_enabled,
      push_issue_updates_enabled = excluded.push_issue_updates_enabled,
      updated_at = excluded.updated_at;

  return app_api.backend_push_notification_preference(actor_uid, device_id, permission);
end;
$$;

revoke all on function app_api.backend_notification_state_to_json(app_private.notification_states) from public, anon, authenticated;
revoke all on function app_api.backend_upsert_notification_state(text) from public, anon, authenticated;
revoke all on function app_api.backend_notification_to_json(app_private.notifications,timestamptz) from public, anon, authenticated;
revoke all on function app_api.backend_list_notifications(text,boolean,text,integer,uuid,timestamptz) from public, anon, authenticated;
revoke all on function app_api.backend_get_notification_read_state(text) from public, anon, authenticated;
revoke all on function app_api.backend_mark_notifications_opened(text,timestamptz) from public, anon, authenticated;
revoke all on function app_api.backend_push_notification_preference(text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_register_push_token(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_unregister_push_token(text,text,text) from public, anon, authenticated;
revoke all on function app_api.backend_update_push_notification_preferences(text,boolean,boolean,text,text) from public, anon, authenticated;

grant execute on function app_api.backend_notification_state_to_json(app_private.notification_states) to service_role;
grant execute on function app_api.backend_upsert_notification_state(text) to service_role;
grant execute on function app_api.backend_notification_to_json(app_private.notifications,timestamptz) to service_role;
grant execute on function app_api.backend_list_notifications(text,boolean,text,integer,uuid,timestamptz) to service_role;
grant execute on function app_api.backend_get_notification_read_state(text) to service_role;
grant execute on function app_api.backend_mark_notifications_opened(text,timestamptz) to service_role;
grant execute on function app_api.backend_push_notification_preference(text,text,text) to service_role;
grant execute on function app_api.backend_register_push_token(text,text,text,text,text,text) to service_role;
grant execute on function app_api.backend_unregister_push_token(text,text,text) to service_role;
grant execute on function app_api.backend_update_push_notification_preferences(text,boolean,boolean,text,text) to service_role;
