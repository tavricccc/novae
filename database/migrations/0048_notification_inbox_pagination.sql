-- Keep notification cursors at PostgreSQL precision and hide expired deliveries.
-- Notification JSON uses createdAt after 0016; the old created_at_ms key is absent.
CREATE OR REPLACE FUNCTION "app_api"."backend_list_notifications"("actor_uid" "text", "actor_is_admin" boolean, "notification_source" "text", "page_size" integer, "cursor_id" "uuid", "cursor_created_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app_private', 'app_api', 'public'
    AS $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 30), 1), 30);
  opened_at timestamptz;
  rows_json jsonb := '[]'::jsonb;
  last_notification jsonb;
  notification_record app_private.notifications%rowtype;
begin
  if backend_list_notifications.notification_source = 'admin'
    and not backend_list_notifications.actor_is_admin
  then
    return jsonb_build_object('notifications', '[]'::jsonb, 'cursor', null, 'hasMore', false);
  end if;

  select case
    when backend_list_notifications.notification_source = 'admin' then state_record.admin_opened_at
    when backend_list_notifications.notification_source = 'user' then state_record.user_opened_at
    else state_record.broadcast_opened_at
  end
  into opened_at
  from app_private.notification_states state_record
  where state_record.uid = backend_list_notifications.actor_uid;

  for notification_record in
    select notification.*
    from app_private.notifications notification
    where notification.source = backend_list_notifications.notification_source
      and notification.expires_at > now()
      and (
        backend_list_notifications.notification_source <> 'user'
        or notification.recipient_uid = backend_list_notifications.actor_uid
      )
      and (
        backend_list_notifications.cursor_id is null
        or notification.created_at < backend_list_notifications.cursor_created_at
        or (
          notification.created_at = backend_list_notifications.cursor_created_at
          and notification.id < backend_list_notifications.cursor_id
        )
      )
    order by notification.created_at desc, notification.id desc
    limit limited_page_size + 1
  loop
    rows_json := rows_json || jsonb_build_array(
      app_api.backend_notification_to_json(notification_record, opened_at)
    );
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
        jsonb_build_object(
          'id', last_notification ->> 'id',
          'createdAt', last_notification -> 'createdAt'
        )
      else null
    end
  );
end;
$$;
