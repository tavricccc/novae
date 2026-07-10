alter table app_private.notifications
  add column if not exists comment_id uuid;

create index if not exists notifications_comment_id_idx
  on app_private.notifications (comment_id)
  where comment_id is not null;

create or replace function app_private.queue_comment_created()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  issue_record app_private.issues%rowtype;
  parent_author_uid text;
begin
  select * into issue_record from app_private.issues where id = new.issue_id;
  if new.parent_comment_id is not null then
    select author_uid into parent_author_uid
    from app_private.comments
    where id = new.parent_comment_id;
  end if;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'issue.comment_created', 'issue', new.issue_id::text, new.author_uid,
    jsonb_build_object(
      'author_name', new.author_name, 'author_photo_url', new.author_photo_url,
      'author_uid', new.author_uid, 'comment_id', new.id, 'content', new.content,
      'issue_author_uid', issue_record.author_uid, 'issue_category', issue_record.category,
      'issue_id', new.issue_id, 'parent_author_uid', parent_author_uid,
      'parent_comment_id', new.parent_comment_id, 'title', issue_record.title
    )
  );
  return new;
end;
$$;

create or replace function app_private.queue_announcement_comment_created()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  announcement_record app_private.announcements%rowtype;
  parent_author_uid text;
begin
  select * into announcement_record
  from app_private.announcements
  where id = new.announcement_id;

  if new.parent_comment_id is not null then
    select author_uid into parent_author_uid
    from app_private.announcement_comments
    where id = new.parent_comment_id;
  end if;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'announcement.comment_created', 'announcement', new.announcement_id::text, new.author_uid,
    jsonb_build_object(
      'announcement_author_uid', announcement_record.author_uid,
      'announcement_id', new.announcement_id,
      'author_name', new.author_name,
      'author_photo_url', new.author_photo_url,
      'author_uid', new.author_uid,
      'comment_id', new.id,
      'content', new.content,
      'parent_author_uid', parent_author_uid,
      'parent_comment_id', new.parent_comment_id,
      'title', announcement_record.title
    )
  );
  return new;
end;
$$;
