create or replace function app_api.backend_issue_to_json(
  issue_record app_private.issues,
  actor_uid text,
  actor_is_admin boolean,
  private_to_owner_categories text[],
  review_required_categories text[],
  author_private_categories text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  is_own_issue boolean := issue_record.author_uid = actor_uid;
  can_manage_issue boolean := actor_is_admin or issue_record.author_uid = actor_uid;
  can_view_author boolean := actor_is_admin
    or issue_record.author_uid = actor_uid
    or issue_record.category <> all(author_private_categories);
  current_user_supported boolean;
begin
  if not actor_is_admin
    and not is_own_issue
    and issue_record.category = any(private_to_owner_categories)
  then
    raise exception 'not-found';
  end if;

  if not actor_is_admin
    and not is_own_issue
    and issue_record.category = any(review_required_categories)
    and issue_record.status in ('under-review', 'review-rejected')
  then
    raise exception 'not-found';
  end if;

  select exists (
    select 1
    from app_private.supports
    where supports.issue_id = issue_record.id
      and supports.uid = actor_uid
  ) into current_user_supported;

  return jsonb_build_object(
    'id', issue_record.id,
    'title', issue_record.title,
    'content', issue_record.content,
    'created_at', issue_record.created_at,
    'closed_at', issue_record.closed_at,
    'created_at_ms', floor(extract(epoch from issue_record.created_at) * 1000),
    'closed_at_ms', case when issue_record.closed_at is null then null else floor(extract(epoch from issue_record.closed_at) * 1000) end,
    'support_count', issue_record.support_count,
    'status', issue_record.status,
    'category', issue_record.category,
    'support_enabled', issue_record.support_enabled,
    'support_goal', issue_record.support_goal,
    'support_deadline_at', issue_record.support_deadline_at,
    'support_deadline_at_ms', case when issue_record.support_deadline_at is null then null else floor(extract(epoch from issue_record.support_deadline_at) * 1000) end,
    'response_deadline_at', issue_record.response_deadline_at,
    'response_deadline_at_ms', case when issue_record.response_deadline_at is null then null else floor(extract(epoch from issue_record.response_deadline_at) * 1000) end,
    'review_approved_at', issue_record.review_approved_at,
    'review_approved_at_ms', case when issue_record.review_approved_at is null then null else floor(extract(epoch from issue_record.review_approved_at) * 1000) end,
    'result_content', issue_record.result_content,
    'support_met_at', issue_record.support_met_at,
    'support_met_at_ms', case when issue_record.support_met_at is null then null else floor(extract(epoch from issue_record.support_met_at) * 1000) end,
    'review_rejection_reason', issue_record.review_rejection_reason,
    'currentUserSupported', current_user_supported,
    'isOwnIssue', is_own_issue,
    'canManageIssue', can_manage_issue,
    'canViewAuthor', can_view_author,
    'author_uid', case when can_view_author then issue_record.author_uid else null end,
    'author_name', case when can_view_author then issue_record.author_name else null end,
    'author_photo_url', case when can_view_author then issue_record.author_photo_url else null end
  );
end;
$$;

create or replace function app_private.issue_list_sort_date(
  issue_record app_private.issues,
  status_bucket text,
  sort_name text
)
returns timestamptz
language sql
stable
as $$
  select case
    when sort_name = 'ending-soon' then issue_record.support_deadline_at
    when coalesce(status_bucket, 'active') = 'closed' then coalesce(issue_record.closed_at, issue_record.created_at)
    else coalesce(issue_record.review_approved_at, issue_record.created_at)
  end
$$;

revoke all on function app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]) from public, anon, authenticated;
drop function if exists app_api.backend_update_issue_result(uuid,text,boolean,text,timestamptz,text[],text[],text[]);

create or replace function app_api.backend_update_issue_result(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  result_content text,
  private_to_owner_categories text[],
  review_required_categories text[],
  author_private_categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  issue_record app_private.issues%rowtype;
begin
  if not backend_update_issue_result.actor_is_admin then
    raise exception 'permission-denied';
  end if;

  update app_private.issues
  set last_actor_uid = backend_update_issue_result.actor_uid,
      result_content = backend_update_issue_result.result_content
  where id = backend_update_issue_result.issue_id
  returning * into issue_record;

  if not found then
    raise exception 'not-found';
  end if;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'issue.result_updated',
    'issue',
    issue_record.id::text,
    backend_update_issue_result.actor_uid,
    jsonb_build_object(
      'author_uid', issue_record.author_uid,
      'issue_category', issue_record.category,
      'result_content', issue_record.result_content,
      'support_count', issue_record.support_count,
      'support_goal', issue_record.support_goal,
      'title', issue_record.title
    )
  );

  return app_api.backend_issue_to_json(
    issue_record,
    backend_update_issue_result.actor_uid,
    backend_update_issue_result.actor_is_admin,
    backend_update_issue_result.private_to_owner_categories,
    backend_update_issue_result.review_required_categories,
    backend_update_issue_result.author_private_categories
  );
end;
$$;

revoke all on function app_api.backend_update_issue_result(uuid,text,boolean,text,text[],text[],text[]) from public, anon, authenticated;
grant execute on function app_api.backend_update_issue_result(uuid,text,boolean,text,text[],text[],text[]) to service_role;

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
    'created_at', comment_record.created_at,
    'created_at_ms', floor(extract(epoch from comment_record.created_at) * 1000),
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
    'created_at', comment_record.created_at,
    'created_at_ms', floor(extract(epoch from comment_record.created_at) * 1000),
    'replies', replies
  );
$$;

create or replace function app_api.backend_create_issue_comment(
  issue_id uuid,
  parent_comment_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  actor_name text,
  actor_photo_url text,
  comment_content text,
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

  insert into app_private.comments(issue_id, parent_comment_id, author_uid, author_name, author_photo_url, content)
  values (backend_create_issue_comment.issue_id, backend_create_issue_comment.parent_comment_id, actor_uid, actor_name, actor_photo_url, comment_content)
  returning * into comment_record;

  return app_api.backend_comment_to_json(comment_record, '[]'::jsonb);
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

  insert into app_private.announcement_comments(announcement_id, parent_comment_id, author_uid, author_name, author_photo_url, content)
  values (backend_create_announcement_comment.announcement_id, backend_create_announcement_comment.parent_comment_id, actor_uid, actor_name, actor_photo_url, comment_content)
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
    'currentUserLiked', current_user_liked
  );
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
      content = announcement_content
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

drop trigger if exists touch_issues_updated_at on app_private.issues;
drop trigger if exists touch_comments_updated_at on app_private.comments;
drop trigger if exists touch_announcements_updated_at on app_private.announcements;
drop trigger if exists touch_announcement_comments_updated_at on app_private.announcement_comments;

alter table app_private.issues
  drop column if exists result_updated_at,
  drop column if exists updated_at;

alter table app_private.comments
  drop column if exists is_admin_comment,
  drop column if exists updated_at;

alter table app_private.announcements
  drop column if exists created_at,
  drop column if exists updated_at;

alter table app_private.announcement_comments
  drop column if exists is_admin_comment,
  drop column if exists updated_at;
