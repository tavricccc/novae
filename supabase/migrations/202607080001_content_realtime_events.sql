create table if not exists app_private.realtime_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'issue_changed',
      'issue_comment_changed',
      'announcement_changed',
      'announcement_comment_changed'
    )
  ),
  target_type text not null check (target_type in ('issue', 'issue_comment', 'announcement', 'announcement_comment')),
  target_id text not null,
  parent_id text,
  category text,
  actor_uid text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days'
);

alter table app_private.realtime_events enable row level security;

grant select on app_private.realtime_events to authenticated;

create policy "read realtime events with valid firebase token"
on app_private.realtime_events
for select
to authenticated
using (app_private.is_expected_firebase_project());

create index if not exists realtime_events_created_idx
  on app_private.realtime_events (created_at desc);

create index if not exists realtime_events_expires_idx
  on app_private.realtime_events (expires_at);

create or replace function app_private.emit_content_realtime_event(
  event_type text,
  target_type text,
  target_id text,
  parent_id text default null,
  category text default null,
  actor_uid text default null
)
returns void
language sql
security definer
set search_path = app_private, public
as $$
  insert into app_private.realtime_events (
    event_type,
    target_type,
    target_id,
    parent_id,
    category,
    actor_uid
  )
  values (
    emit_content_realtime_event.event_type,
    emit_content_realtime_event.target_type,
    emit_content_realtime_event.target_id,
    emit_content_realtime_event.parent_id,
    emit_content_realtime_event.category,
    emit_content_realtime_event.actor_uid
  );
$$;

create or replace function app_private.queue_issue_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  issue_record app_private.issues%rowtype;
  event_actor_uid text;
begin
  if tg_op = 'DELETE' then
    issue_record := old;
    event_actor_uid := old.last_actor_uid;
  else
    issue_record := new;
    event_actor_uid := coalesce(new.last_actor_uid, new.author_uid);
  end if;

  perform app_private.emit_content_realtime_event(
    'issue_changed',
    'issue',
    issue_record.id::text,
    issue_record.id::text,
    issue_record.category,
    event_actor_uid
  );
  return null;
end;
$$;

create or replace function app_private.queue_issue_comment_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  comment_record app_private.comments%rowtype;
  issue_category text;
begin
  if tg_op = 'DELETE' then
    comment_record := old;
  else
    comment_record := new;
  end if;

  select category into issue_category
  from app_private.issues
  where id = comment_record.issue_id;

  perform app_private.emit_content_realtime_event(
    'issue_comment_changed',
    'issue_comment',
    comment_record.id::text,
    comment_record.issue_id::text,
    issue_category,
    comment_record.author_uid
  );
  return null;
end;
$$;

create or replace function app_private.queue_announcement_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  announcement_record app_private.announcements%rowtype;
begin
  if tg_op = 'DELETE' then
    announcement_record := old;
  else
    announcement_record := new;
  end if;

  perform app_private.emit_content_realtime_event(
    'announcement_changed',
    'announcement',
    announcement_record.id::text,
    announcement_record.id::text,
    null,
    announcement_record.author_uid
  );
  return null;
end;
$$;

create or replace function app_private.queue_announcement_comment_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  comment_record app_private.announcement_comments%rowtype;
begin
  if tg_op = 'DELETE' then
    comment_record := old;
  else
    comment_record := new;
  end if;

  perform app_private.emit_content_realtime_event(
    'announcement_comment_changed',
    'announcement_comment',
    comment_record.id::text,
    comment_record.announcement_id::text,
    null,
    comment_record.author_uid
  );
  return null;
end;
$$;

drop trigger if exists queue_issue_realtime_on_insert on app_private.issues;
create trigger queue_issue_realtime_on_insert
after insert on app_private.issues
for each row execute function app_private.queue_issue_realtime_event();

drop trigger if exists queue_issue_realtime_on_update on app_private.issues;
create trigger queue_issue_realtime_on_update
after update on app_private.issues
for each row execute function app_private.queue_issue_realtime_event();

drop trigger if exists queue_issue_realtime_on_delete on app_private.issues;
create trigger queue_issue_realtime_on_delete
after delete on app_private.issues
for each row execute function app_private.queue_issue_realtime_event();

drop trigger if exists queue_issue_comment_realtime_on_insert on app_private.comments;
create trigger queue_issue_comment_realtime_on_insert
after insert on app_private.comments
for each row execute function app_private.queue_issue_comment_realtime_event();

drop trigger if exists queue_issue_comment_realtime_on_update on app_private.comments;
create trigger queue_issue_comment_realtime_on_update
after update on app_private.comments
for each row execute function app_private.queue_issue_comment_realtime_event();

drop trigger if exists queue_issue_comment_realtime_on_delete on app_private.comments;
create trigger queue_issue_comment_realtime_on_delete
after delete on app_private.comments
for each row execute function app_private.queue_issue_comment_realtime_event();

drop trigger if exists queue_announcement_realtime_on_insert on app_private.announcements;
create trigger queue_announcement_realtime_on_insert
after insert on app_private.announcements
for each row execute function app_private.queue_announcement_realtime_event();

drop trigger if exists queue_announcement_realtime_on_update on app_private.announcements;
create trigger queue_announcement_realtime_on_update
after update on app_private.announcements
for each row execute function app_private.queue_announcement_realtime_event();

drop trigger if exists queue_announcement_realtime_on_delete on app_private.announcements;
create trigger queue_announcement_realtime_on_delete
after delete on app_private.announcements
for each row execute function app_private.queue_announcement_realtime_event();

drop trigger if exists queue_announcement_comment_realtime_on_insert on app_private.announcement_comments;
create trigger queue_announcement_comment_realtime_on_insert
after insert on app_private.announcement_comments
for each row execute function app_private.queue_announcement_comment_realtime_event();

drop trigger if exists queue_announcement_comment_realtime_on_update on app_private.announcement_comments;
create trigger queue_announcement_comment_realtime_on_update
after update on app_private.announcement_comments
for each row execute function app_private.queue_announcement_comment_realtime_event();

drop trigger if exists queue_announcement_comment_realtime_on_delete on app_private.announcement_comments;
create trigger queue_announcement_comment_realtime_on_delete
after delete on app_private.announcement_comments
for each row execute function app_private.queue_announcement_comment_realtime_event();

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
      and tablename = 'realtime_events'
  ) then
    alter publication supabase_realtime add table app_private.realtime_events;
  end if;
end $$;
