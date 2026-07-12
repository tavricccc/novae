-- Pass the operation explicitly so comment triggers select the realtime emitter
-- that includes the op parameter instead of colliding with the legacy overload.

create or replace function app_private.queue_issue_comment_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  comment_record app_private.comments%rowtype;
  issue_record app_private.issues%rowtype;
begin
  if tg_op = 'DELETE' then
    comment_record := old;
  else
    comment_record := new;
  end if;
  select * into issue_record from app_private.issues where id = comment_record.issue_id;
  perform app_private.emit_content_realtime_event(
    'issue_comment_changed',
    'issue_comment',
    comment_record.id::text,
    comment_record.issue_id::text,
    issue_record.category,
    case when found
      then app_private.issue_realtime_audience(issue_record.category, issue_record.status)
      else 'owner-admin'
    end,
    issue_record.author_uid,
    null,
    null,
    null,
    lower(tg_op)
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
    'school',
    null,
    null,
    null,
    null,
    lower(tg_op)
  );
  return null;
end;
$$;

drop function if exists app_private.emit_content_realtime_event(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
);

create or replace function app_private.emit_content_realtime_event(
  event_type text,
  target_type text,
  target_id text,
  parent_id text,
  category text,
  audience text,
  recipient_uid text,
  support_count integer,
  like_count integer,
  comment_count integer,
  op text
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
    audience,
    recipient_uid,
    support_count,
    like_count,
    comment_count,
    op
  )
  values (
    emit_content_realtime_event.event_type,
    emit_content_realtime_event.target_type,
    emit_content_realtime_event.target_id,
    emit_content_realtime_event.parent_id,
    emit_content_realtime_event.category,
    emit_content_realtime_event.audience,
    emit_content_realtime_event.recipient_uid,
    emit_content_realtime_event.support_count,
    emit_content_realtime_event.like_count,
    emit_content_realtime_event.comment_count,
    emit_content_realtime_event.op
  );
$$;

revoke all on function app_private.queue_issue_comment_realtime_event()
from public, anon, authenticated;
revoke all on function app_private.queue_announcement_comment_realtime_event()
from public, anon, authenticated;
revoke all on function app_private.emit_content_realtime_event(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text
)
from public, anon, authenticated;
