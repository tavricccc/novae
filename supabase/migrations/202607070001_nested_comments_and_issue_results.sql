alter table app_private.issues
  add column if not exists result_content text,
  add column if not exists result_updated_at timestamptz;

alter table app_private.comments
  add column if not exists parent_comment_id uuid references app_private.comments(id) on delete cascade;

alter table app_private.announcement_comments
  add column if not exists parent_comment_id uuid references app_private.announcement_comments(id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_parent_not_self'
      and conrelid = 'app_private.comments'::regclass
  ) then
    alter table app_private.comments
      add constraint comments_parent_not_self
      check (parent_comment_id is null or parent_comment_id <> id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcement_comments_parent_not_self'
      and conrelid = 'app_private.announcement_comments'::regclass
  ) then
    alter table app_private.announcement_comments
      add constraint announcement_comments_parent_not_self
      check (parent_comment_id is null or parent_comment_id <> id);
  end if;
end $$;

create or replace function app_private.validate_comment_parent()
returns trigger
language plpgsql
as $$
declare
  parent_issue_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select issue_id, parent_comment_id
  into parent_issue_id, parent_parent_id
  from app_private.comments
  where id = new.parent_comment_id;

  if parent_issue_id is null
    or parent_issue_id <> new.issue_id
    or parent_parent_id is not null then
    raise exception 'invalid comment parent';
  end if;

  return new;
end $$;

drop trigger if exists validate_comment_parent on app_private.comments;
create trigger validate_comment_parent
before insert or update of parent_comment_id, issue_id on app_private.comments
for each row execute function app_private.validate_comment_parent();

create or replace function app_private.validate_announcement_comment_parent()
returns trigger
language plpgsql
as $$
declare
  parent_announcement_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select announcement_id, parent_comment_id
  into parent_announcement_id, parent_parent_id
  from app_private.announcement_comments
  where id = new.parent_comment_id;

  if parent_announcement_id is null
    or parent_announcement_id <> new.announcement_id
    or parent_parent_id is not null then
    raise exception 'invalid announcement comment parent';
  end if;

  return new;
end $$;

drop trigger if exists validate_announcement_comment_parent on app_private.announcement_comments;
create trigger validate_announcement_comment_parent
before insert or update of parent_comment_id, announcement_id on app_private.announcement_comments
for each row execute function app_private.validate_announcement_comment_parent();

with latest_admin_comment as (
  select distinct on (issue_id)
    issue_id,
    content,
    updated_at
  from app_private.comments
  where is_admin_comment = true
    and parent_comment_id is null
  order by issue_id, created_at desc, id desc
)
update app_private.issues
set
  result_content = latest_admin_comment.content,
  result_updated_at = latest_admin_comment.updated_at
from latest_admin_comment
where issues.id = latest_admin_comment.issue_id
  and nullif(btrim(coalesce(issues.result_content, '')), '') is null;

delete from app_private.comments
where is_admin_comment = true;

create index if not exists comments_issue_root_created_idx
  on app_private.comments (issue_id, created_at asc, id asc)
  where parent_comment_id is null;

create index if not exists comments_parent_created_idx
  on app_private.comments (parent_comment_id, created_at asc, id asc)
  where parent_comment_id is not null;

create index if not exists announcement_comments_announcement_root_created_idx
  on app_private.announcement_comments (announcement_id, created_at asc, id asc)
  where parent_comment_id is null;

create index if not exists announcement_comments_parent_created_idx
  on app_private.announcement_comments (parent_comment_id, created_at asc, id asc)
  where parent_comment_id is not null;
