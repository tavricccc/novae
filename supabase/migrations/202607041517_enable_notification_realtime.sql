grant usage on schema app_private to authenticated;
grant select on app_private.notifications to authenticated;
grant select on app_private.notification_states to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'app_private'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table app_private.notifications;
  end if;

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'app_private'
      and tablename = 'notification_states'
  ) then
    alter publication supabase_realtime add table app_private.notification_states;
  end if;
end $$;
