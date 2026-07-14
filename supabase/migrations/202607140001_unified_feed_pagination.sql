create or replace function app_api.backend_list_issue_comments(
  issue_id uuid,
  actor_uid text,
  actor_is_admin boolean,
  cursor_id uuid,
  cursor_created_at timestamptz,
  page_size integer,
  private_to_owner_categories text[],
  review_required_categories text[],
  public_comment_categories text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 30), 1), 30);
begin
  perform app_api.backend_assert_issue_comment_access(
    issue_id,
    actor_uid,
    actor_is_admin,
    private_to_owner_categories,
    review_required_categories,
    public_comment_categories
  );

  return (
    with root_page as materialized (
      select root.*
      from app_private.comments root
      where root.issue_id = backend_list_issue_comments.issue_id
        and root.parent_comment_id is null
        and (
          cursor_id is null
          or root.created_at > cursor_created_at
          or (root.created_at = cursor_created_at and root.id > cursor_id)
        )
      order by root.created_at asc, root.id asc
      limit limited_page_size + 1
    ),
    limited_roots as materialized (
      select *
      from root_page
      order by created_at asc, id asc
      limit limited_page_size
    ),
    reply_groups as materialized (
      select
        reply.parent_comment_id,
        jsonb_agg(
          app_api.backend_comment_to_json(reply, '[]'::jsonb)
          order by reply.created_at asc, reply.id asc
        ) as replies
      from app_private.comments reply
      where reply.parent_comment_id in (select id from limited_roots)
      group by reply.parent_comment_id
    ),
    page_items as (
      select
        root.id,
        root.created_at,
        app_api.backend_comment_to_json(root, coalesce(reply_groups.replies, '[]'::jsonb)) as value
      from limited_roots root
      left join reply_groups on reply_groups.parent_comment_id = root.id
    ),
    last_item as (
      select id, created_at
      from limited_roots
      order by created_at asc, id asc
      offset (limited_page_size - 1)
      limit 1
    )
    select jsonb_build_object(
      'comments', coalesce(
        (select jsonb_agg(value order by created_at asc, id asc) from page_items),
        '[]'::jsonb
      ),
      'hasMore', (select count(*) > limited_page_size from root_page),
      'cursor', case
        when (select count(*) > limited_page_size from root_page) then (
          select jsonb_build_object(
            'id', id,
            'createdAtMs', floor(extract(epoch from created_at) * 1000)
          )
          from last_item
        )
        else null
      end
    )
  );
end;
$$;

create or replace function app_api.backend_list_announcement_comments(
  announcement_id uuid,
  cursor_id uuid,
  cursor_created_at timestamptz,
  page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_private, app_api, public
as $$
declare
  limited_page_size integer := least(greatest(coalesce(page_size, 30), 1), 30);
begin
  return (
    with root_page as materialized (
      select root.*
      from app_private.announcement_comments root
      where root.announcement_id = backend_list_announcement_comments.announcement_id
        and root.parent_comment_id is null
        and (
          cursor_id is null
          or root.created_at > cursor_created_at
          or (root.created_at = cursor_created_at and root.id > cursor_id)
        )
      order by root.created_at asc, root.id asc
      limit limited_page_size + 1
    ),
    limited_roots as materialized (
      select *
      from root_page
      order by created_at asc, id asc
      limit limited_page_size
    ),
    reply_groups as materialized (
      select
        reply.parent_comment_id,
        jsonb_agg(
          app_api.backend_announcement_comment_to_json(reply, '[]'::jsonb)
          order by reply.created_at asc, reply.id asc
        ) as replies
      from app_private.announcement_comments reply
      where reply.parent_comment_id in (select id from limited_roots)
      group by reply.parent_comment_id
    ),
    page_items as (
      select
        root.id,
        root.created_at,
        app_api.backend_announcement_comment_to_json(
          root,
          coalesce(reply_groups.replies, '[]'::jsonb)
        ) as value
      from limited_roots root
      left join reply_groups on reply_groups.parent_comment_id = root.id
    ),
    last_item as (
      select id, created_at
      from limited_roots
      order by created_at asc, id asc
      offset (limited_page_size - 1)
      limit 1
    )
    select jsonb_build_object(
      'comments', coalesce(
        (select jsonb_agg(value order by created_at asc, id asc) from page_items),
        '[]'::jsonb
      ),
      'hasMore', (select count(*) > limited_page_size from root_page),
      'cursor', case
        when (select count(*) > limited_page_size from root_page) then (
          select jsonb_build_object(
            'id', id,
            'createdAtMs', floor(extract(epoch from created_at) * 1000)
          )
          from last_item
        )
        else null
      end
    )
  );
end;
$$;

revoke all on function app_api.backend_list_issue_comments(
  uuid,text,boolean,uuid,timestamptz,integer,text[],text[],text[]
) from public, anon, authenticated;
grant execute on function app_api.backend_list_issue_comments(
  uuid,text,boolean,uuid,timestamptz,integer,text[],text[],text[]
) to service_role;

revoke all on function app_api.backend_list_announcement_comments(
  uuid,uuid,timestamptz,integer
) from public, anon, authenticated;
grant execute on function app_api.backend_list_announcement_comments(
  uuid,uuid,timestamptz,integer
) to service_role;

create or replace function app_api.backend_get_notification_read_state(actor_uid text)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  select coalesce(
    (
      select app_api.backend_notification_state_to_json(state_record)
      from app_private.notification_states state_record
      where state_record.uid = actor_uid
    ),
    jsonb_build_object(
      'uid', actor_uid,
      'broadcast_opened_at_ms', null,
      'admin_opened_at_ms', null,
      'user_opened_at_ms', null,
      'push_comments_enabled', true,
      'push_issue_updates_enabled', true
    )
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
stable
security definer
set search_path = app_private, app_api, public
as $$
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
          'createdAtMs', last_notification -> 'created_at_ms'
        )
      else null
    end
  );
end;
$$;

-- List serialization receives support state in bulk and intentionally omits the
-- markdown body. Detail reads continue to use backend_issue_to_json.
create or replace function app_api.backend_issue_list_to_json(
  issue_record app_private.issues,
  actor_uid text,
  actor_is_admin boolean,
  current_user_supported boolean,
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
  can_manage_issue boolean := actor_is_admin or is_own_issue;
  can_view_author boolean := actor_is_admin
    or is_own_issue
    or issue_record.category <> all(author_private_categories);
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

  return jsonb_build_object(
    'id', issue_record.id,
    'title', issue_record.title,
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

revoke all on function app_api.backend_issue_list_to_json(
  app_private.issues,text,boolean,boolean,text[],text[],text[]
) from public, anon, authenticated;
grant execute on function app_api.backend_issue_list_to_json(
  app_private.issues,text,boolean,boolean,text[],text[],text[]
) to service_role;

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
  effective_sort_name text := case
    when coalesce(status_bucket, 'active') = 'closed' then 'latest'
    else coalesce(sort_name, 'latest')
  end;
  limited_page_size integer := least(greatest(coalesce(page_size, 30), 1), 50);
  rows_json jsonb := '[]'::jsonb;
  supported_issue_ids uuid[] := '{}'::uuid[];
  last_issue jsonb;
  issue_record app_private.issues%rowtype;
begin
  select coalesce(array_agg(issue_id), '{}'::uuid[])
  into supported_issue_ids
  from app_private.supports
  where uid = actor_uid;

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
              when actor_is_admin or category = any(private_to_owner_categories)
                then status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed')
              else status in ('auto-rejected', 'infeasible', 'completed')
                or (author_uid = actor_uid and status = 'review-rejected')
            end
          else
            case
              when actor_is_admin or category = any(private_to_owner_categories)
                then status in ('under-review', 'pending', 'processing')
              else status in ('pending', 'processing')
                or (author_uid = actor_uid and status = 'under-review')
            end
        end
      )
      and (
        action_name <> 'searchIssues'
        or title_search ilike (
          '%' || replace(replace(replace(lower(coalesce(title_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        ) escape '\'
      )
      and (
        cursor_id is null
        or case
          when effective_sort_name = 'most-supported' and cursor_sort_number is not null then
            support_count < cursor_sort_number
            or (
              support_count = cursor_sort_number
              and app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                < coalesce(cursor_sort_date, cursor_created_at)
            )
            or (
              support_count = cursor_sort_number
              and app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                = coalesce(cursor_sort_date, cursor_created_at)
              and id < cursor_id
            )
          when effective_sort_name = 'ending-soon' and cursor_sort_date is not null then
            support_deadline_at > cursor_sort_date
            or (support_deadline_at = cursor_sort_date and created_at < cursor_created_at)
            or (support_deadline_at = cursor_sort_date and created_at = cursor_created_at and id < cursor_id)
          when effective_sort_name = 'ending-soon' and cursor_sort_date is null then
            support_deadline_at is null
            and (created_at < cursor_created_at or (created_at = cursor_created_at and id < cursor_id))
          else
            app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
              < coalesce(cursor_sort_date, cursor_created_at)
            or (
              app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                = coalesce(cursor_sort_date, cursor_created_at)
              and id < cursor_id
            )
        end
      )
    order by
      case when effective_sort_name = 'most-supported' then support_count end desc,
      case when effective_sort_name = 'ending-soon' then support_deadline_at end asc nulls last,
      case when effective_sort_name = 'ending-soon' then created_at end desc,
      case when effective_sort_name <> 'ending-soon'
        then app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
      end desc,
      id desc
    limit limited_page_size + 1
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_issue_list_to_json(
      issue_record,
      actor_uid,
      actor_is_admin,
      issue_record.id = any(supported_issue_ids),
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
            when effective_sort_name = 'ending-soon' then last_issue -> 'support_deadline_at_ms'
            when coalesce(status_bucket, 'active') = 'closed'
              then coalesce(last_issue -> 'closed_at_ms', last_issue -> 'created_at_ms')
            else coalesce(last_issue -> 'review_approved_at_ms', last_issue -> 'created_at_ms')
          end,
          'sort_number', case
            when effective_sort_name = 'most-supported' then last_issue -> 'support_count'
            else null
          end
        )
      else null
    end
  );
end;
$$;

-- Scope a member's proposal feed before paging so active/closed tabs never discard
-- rows after the database has spent work returning them.
create or replace function app_api.backend_list_user_issues(
  actor_uid text,
  actor_is_admin boolean,
  status_bucket text,
  sort_name text,
  page_size integer,
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
  effective_sort_name text := case
    when coalesce(status_bucket, 'active') = 'closed' then 'latest'
    else coalesce(sort_name, 'latest')
  end;
  limited_page_size integer := least(greatest(coalesce(page_size, 30), 1), 50);
  rows_json jsonb := '[]'::jsonb;
  supported_issue_ids uuid[] := '{}'::uuid[];
  last_issue jsonb;
  issue_record app_private.issues%rowtype;
begin
  select coalesce(array_agg(issue_id), '{}'::uuid[])
  into supported_issue_ids
  from app_private.supports
  where uid = actor_uid;

  for issue_record in
    select *
    from app_private.issues
    where author_uid = backend_list_user_issues.actor_uid
      and case
        when coalesce(status_bucket, 'active') = 'closed'
          then status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed')
        else status in ('under-review', 'pending', 'processing')
      end
      and (
        cursor_id is null
        or case
          when effective_sort_name = 'most-supported' and cursor_sort_number is not null then
            support_count < cursor_sort_number
            or (
              support_count = cursor_sort_number
              and app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                < coalesce(cursor_sort_date, cursor_created_at)
            )
            or (
              support_count = cursor_sort_number
              and app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                = coalesce(cursor_sort_date, cursor_created_at)
              and id < cursor_id
            )
          when effective_sort_name = 'ending-soon' and cursor_sort_date is not null then
            support_deadline_at > cursor_sort_date
            or (support_deadline_at = cursor_sort_date and created_at < cursor_created_at)
            or (support_deadline_at = cursor_sort_date and created_at = cursor_created_at and id < cursor_id)
          when effective_sort_name = 'ending-soon' and cursor_sort_date is null then
            support_deadline_at is null
            and (created_at < cursor_created_at or (created_at = cursor_created_at and id < cursor_id))
          else
            app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
              < coalesce(cursor_sort_date, cursor_created_at)
            or (
              app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
                = coalesce(cursor_sort_date, cursor_created_at)
              and id < cursor_id
            )
        end
      )
    order by
      case when effective_sort_name = 'most-supported' then support_count end desc,
      case when effective_sort_name = 'ending-soon' then support_deadline_at end asc nulls last,
      case when effective_sort_name = 'ending-soon' then created_at end desc,
      case when effective_sort_name <> 'ending-soon'
        then app_private.issue_list_sort_date(issue_record, status_bucket, effective_sort_name)
      end desc,
      id desc
    limit limited_page_size + 1
  loop
    rows_json := rows_json || jsonb_build_array(app_api.backend_issue_list_to_json(
      issue_record,
      actor_uid,
      actor_is_admin,
      issue_record.id = any(supported_issue_ids),
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
    'cursor', case
      when jsonb_array_length(rows_json) > limited_page_size and last_issue is not null then
        jsonb_build_object(
          'id', last_issue ->> 'id',
          'created_at', last_issue -> 'created_at_ms',
          'sort_date', case
            when effective_sort_name = 'ending-soon' then last_issue -> 'support_deadline_at_ms'
            when coalesce(status_bucket, 'active') = 'closed'
              then coalesce(last_issue -> 'closed_at_ms', last_issue -> 'created_at_ms')
            else coalesce(last_issue -> 'review_approved_at_ms', last_issue -> 'created_at_ms')
          end,
          'sort_number', case
            when effective_sort_name = 'most-supported' then last_issue -> 'support_count'
            else null
          end
        )
      else null
    end
  );
end;
$$;

revoke all on function app_api.backend_list_user_issues(
  text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[]
) from public, anon, authenticated;
grant execute on function app_api.backend_list_user_issues(
  text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[]
) to service_role;

revoke all on function app_api.backend_list_announcements(text,integer,uuid,timestamptz)
from public, anon, authenticated;
grant execute on function app_api.backend_list_announcements(text,integer,uuid,timestamptz)
to service_role;

-- Keep list payloads card-sized; announcement details continue to use backend_get_announcement.
create or replace function app_api.backend_list_announcements(
  actor_uid text,
  page_size integer,
  cursor_id uuid,
  cursor_published_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = app_private, app_api, public
as $$
  with settings as (
    select least(greatest(coalesce(page_size, 30), 1), 50) as limited_page_size
  ),
  liked_ids as materialized (
    select announcement_id
    from app_private.announcement_likes
    where uid = actor_uid
  ),
  page_rows as materialized (
    select
      announcement.id,
      announcement.author_uid,
      announcement.author_name,
      announcement.author_photo_url,
      announcement.title,
      announcement.like_count,
      announcement.comment_count,
      announcement.published_at,
      liked_ids.announcement_id is not null as current_user_liked
    from app_private.announcements announcement
    left join liked_ids on liked_ids.announcement_id = announcement.id
    where cursor_id is null
      or announcement.published_at < cursor_published_at
      or (announcement.published_at = cursor_published_at and announcement.id < cursor_id)
    order by announcement.published_at desc, announcement.id desc
    limit (select limited_page_size + 1 from settings)
  ),
  limited_rows as (
    select *
    from page_rows
    order by published_at desc, id desc
    limit (select limited_page_size from settings)
  ),
  last_item as (
    select id, published_at
    from limited_rows
    order by published_at asc, id asc
    limit 1
  )
  select jsonb_build_object(
    'announcements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'author_uid', author_uid,
          'author_name', author_name,
          'author_photo_url', author_photo_url,
          'title', title,
          'like_count', like_count,
          'comment_count', comment_count,
          'published_at_ms', floor(extract(epoch from published_at) * 1000),
          'currentUserLiked', current_user_liked
        )
        order by published_at desc, id desc
      )
      from limited_rows
    ), '[]'::jsonb),
    'hasMore', (select count(*) > (select limited_page_size from settings) from page_rows),
    'cursor', case
      when (select count(*) > (select limited_page_size from settings) from page_rows) then (
        select jsonb_build_object(
          'id', id,
          'publishedAtMs', floor(extract(epoch from published_at) * 1000)
        )
        from last_item
      )
      else null
    end
  );
$$;
