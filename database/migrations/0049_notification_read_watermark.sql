-- Devices and requests can arrive out of order; an inbox visit only advances read state.
CREATE OR REPLACE FUNCTION app_api.backend_mark_notifications_opened(
  actor_uid text,
  opened_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app_private', 'app_api', 'public'
AS $function$
declare
  saved_opened_at timestamptz;
begin
  insert into app_private.notification_states
    (uid, admin_opened_at, broadcast_opened_at, user_opened_at, updated_at)
  values (actor_uid, opened_at, opened_at, opened_at, opened_at)
  on conflict (uid) do update set
    admin_opened_at = greatest(notification_states.admin_opened_at, excluded.admin_opened_at),
    broadcast_opened_at = greatest(notification_states.broadcast_opened_at, excluded.broadcast_opened_at),
    user_opened_at = greatest(notification_states.user_opened_at, excluded.user_opened_at),
    updated_at = greatest(notification_states.updated_at, excluded.updated_at)
  returning greatest(admin_opened_at, broadcast_opened_at, user_opened_at)
  into saved_opened_at;

  return jsonb_build_object(
    'success', true,
    'openedAtMs', floor(extract(epoch from saved_opened_at) * 1000)
  );
end;
$function$;
