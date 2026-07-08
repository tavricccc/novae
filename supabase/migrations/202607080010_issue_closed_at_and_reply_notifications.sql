alter table app_private.issues
  add column if not exists closed_at timestamptz;

update app_private.issues
set closed_at = coalesce(result_updated_at, updated_at, created_at)
where closed_at is null
  and status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed');

create index if not exists issues_category_closed_at_idx
  on app_private.issues (category, closed_at desc, id desc)
  where status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed');

create or replace function app_private.set_issue_closed_at()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
begin
  if new.status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed') then
    if tg_op = 'INSERT'
      or old.status is distinct from new.status
      or new.closed_at is null
    then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  else
    new.closed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_issue_closed_at_on_status_change on app_private.issues;
create trigger set_issue_closed_at_on_status_change
before insert or update of status on app_private.issues
for each row execute function app_private.set_issue_closed_at();

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
    'updated_at', issue_record.updated_at,
    'closed_at', issue_record.closed_at,
    'created_at_ms', floor(extract(epoch from issue_record.created_at) * 1000),
    'updated_at_ms', floor(extract(epoch from issue_record.updated_at) * 1000),
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
    'result_updated_at', issue_record.result_updated_at,
    'result_updated_at_ms', case when issue_record.result_updated_at is null then null else floor(extract(epoch from issue_record.result_updated_at) * 1000) end,
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
    when coalesce(status_bucket, 'active') = 'closed' then coalesce(issue_record.closed_at, issue_record.updated_at, issue_record.created_at)
    else issue_record.created_at
  end
$$;

create or replace function app_api.backend_list_issues(
  action_name text,
  actor_uid text,
  actor_is_admin boolean,
  active_filter text,
  status_bucket text,
  sort_name text,
  page_size integer,
  title_query text,
  cursor_id uuid,
  cursor_created_at timestamptz,
  cursor_sort_date timestamptz,
  cursor_sort_number integer,
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
  limited_page_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  query_limit integer := least(greatest(coalesce(page_size, 20), 1), 50) + 1;
  rows_json jsonb := '[]'::jsonb;
  last_issue jsonb;
  issue_record app_private.issues%rowtype;
begin
  for issue_record in
    select *
    from app_private.issues
    where category = active_filter
      and (
        actor_is_admin
        or author_uid = actor_uid
        or category <> all(private_to_owner_categories)
      )
      and (
        actor_is_admin
        or author_uid = actor_uid
        or not (
          category = any(review_required_categories)
          and status in ('under-review', 'review-rejected')
        )
      )
      and (
        case
          when coalesce(status_bucket, 'active') = 'closed' then
            case
              when actor_is_admin or category = any(private_to_owner_categories) then status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed')
              else status in ('auto-rejected', 'infeasible', 'completed') or (author_uid = actor_uid and status = 'review-rejected')
            end
          else
            case
              when actor_is_admin or category = any(private_to_owner_categories) then status in ('under-review', 'pending', 'processing')
              else status in ('pending', 'processing') or (author_uid = actor_uid and status = 'under-review')
            end
        end
      )
      and (
        action_name <> 'searchIssues'
        or title_search ilike ('%' || replace(replace(replace(lower(coalesce(title_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%') escape '\'
      )
      and (
        cursor_id is null
        or action_name <> 'listIssues'
        or case
          when sort_name = 'most-supported' and cursor_sort_number is not null then
            support_count < cursor_sort_number
            or (support_count = cursor_sort_number and app_private.issue_list_sort_date(issue_record, status_bucket, sort_name) < cursor_sort_date)
            or (support_count = cursor_sort_number and app_private.issue_list_sort_date(issue_record, status_bucket, sort_name) = cursor_sort_date and id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is not null then
            support_deadline_at > cursor_sort_date
            or (support_deadline_at = cursor_sort_date and created_at < cursor_created_at)
            or (support_deadline_at = cursor_sort_date and created_at = cursor_created_at and id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is null then
            support_deadline_at is null
            and (created_at < cursor_created_at or (created_at = cursor_created_at and id < cursor_id))
          when coalesce(status_bucket, 'active') = 'closed' then
            app_private.issue_list_sort_date(issue_record, status_bucket, sort_name) < cursor_sort_date
            or (app_private.issue_list_sort_date(issue_record, status_bucket, sort_name) = cursor_sort_date and id < cursor_id)
          else
            created_at < cursor_created_at
            or (created_at = cursor_created_at and id < cursor_id)
        end
      )
    order by
      case when sort_name = 'most-supported' then support_count end desc,
      case when sort_name = 'ending-soon' then support_deadline_at end asc nulls last,
      case when sort_name <> 'ending-soon' and coalesce(status_bucket, 'active') = 'closed' then app_private.issue_list_sort_date(issue_record, status_bucket, sort_name) end desc,
      created_at desc,
      id desc
    limit query_limit
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_issue_to_json(
      issue_record,
      actor_uid,
      actor_is_admin,
      private_to_owner_categories,
      review_required_categories,
      author_private_categories
    ));
  end loop;

  last_issue := rows_json -> (limited_page_size - 1);

  return jsonb_build_object(
    'issues', (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (
        select value
        from jsonb_array_elements(rows_json) with ordinality as items(value, position)
        where position <= limited_page_size
        order by position
      ) limited_rows
    ),
    'hasMore', jsonb_array_length(rows_json) > limited_page_size,
    'limited', jsonb_array_length(rows_json) > limited_page_size,
    'cursor', case
      when jsonb_array_length(rows_json) > limited_page_size and last_issue is not null then
        jsonb_build_object(
          'id', last_issue ->> 'id',
          'created_at', last_issue -> 'created_at_ms',
          'sort_date', case
            when sort_name = 'ending-soon' then last_issue -> 'support_deadline_at_ms'
            when coalesce(status_bucket, 'active') = 'closed' then coalesce(last_issue -> 'closed_at_ms', last_issue -> 'updated_at_ms', last_issue -> 'created_at_ms')
            else null
          end,
          'sort_number', case when sort_name = 'most-supported' then last_issue -> 'support_count' else null end
        )
      else null
    end
  );
end;
$$;

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
      'author_uid', new.author_uid, 'content', new.content,
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
  select * into announcement_record from app_private.announcements where id = new.announcement_id;
  if new.parent_comment_id is not null then
    select author_uid into parent_author_uid
    from app_private.announcement_comments
    where id = new.parent_comment_id;
  end if;

  insert into app_private.outbox_events(event_type,target_type,target_id,actor_uid,payload)
  values (
    'announcement.comment_created', 'announcement', new.announcement_id::text, new.author_uid,
    jsonb_build_object(
      'announcement_id', new.announcement_id, 'author_name', new.author_name,
      'author_photo_url', new.author_photo_url, 'author_uid', new.author_uid,
      'content', new.content, 'parent_author_uid', parent_author_uid,
      'parent_comment_id', new.parent_comment_id, 'title', announcement_record.title
    )
  );
  return new;
end;
$$;
