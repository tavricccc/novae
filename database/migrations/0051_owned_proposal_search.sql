-- Search the authenticated author's proposals without widening ownership or status visibility.
CREATE OR REPLACE FUNCTION "app_api"."backend_list_user_issues"("actor_uid" "text", "actor_is_admin" boolean, "status_bucket" "text", "sort_name" "text", "page_size" integer, "cursor_id" "uuid", "cursor_created_at" timestamp with time zone, "cursor_sort_date" timestamp with time zone, "cursor_sort_number" integer, "private_to_owner_categories" "text"[], "review_required_categories" "text"[], "author_private_categories" "text"[], "title_query" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'app_private', 'app_api', 'public'
    AS $$
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
  cursor_issue app_private.issues%rowtype;
begin
  if cursor_id is not null then
    select * into cursor_issue from app_private.issues
    where id = cursor_id and author_uid = backend_list_user_issues.actor_uid;
    if found then
      cursor_created_at := cursor_issue.created_at;
      cursor_sort_date := app_private.issue_list_sort_date(cursor_issue, status_bucket, effective_sort_name);
    end if;
  end if;
  select coalesce(array_agg(issue_id), '{}'::uuid[])
  into supported_issue_ids
  from app_private.supports
  where uid = actor_uid;

  for issue_record in
    select *
    from app_private.issues candidate
    where author_uid = backend_list_user_issues.actor_uid
      and (
        coalesce(btrim(title_query), '') = ''
        or title_search like app_private.search_like_pattern(title_query) escape '\'
        or lower(coalesce(content, '')) like app_private.search_like_pattern(title_query) escape '\'
        or exists (
          select 1 from app_private.user_profiles profile
          where profile.uid = backend_list_user_issues.actor_uid
            and lower(coalesce(profile.display_name, '')) like app_private.search_like_pattern(title_query) escape '\'
        )
      )
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
              and app_private.issue_list_sort_date(candidate, status_bucket, effective_sort_name)
                < coalesce(cursor_sort_date, cursor_created_at)
            )
            or (
              support_count = cursor_sort_number
              and app_private.issue_list_sort_date(candidate, status_bucket, effective_sort_name)
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
            app_private.issue_list_sort_date(candidate, status_bucket, effective_sort_name)
              < coalesce(cursor_sort_date, cursor_created_at)
            or (
              app_private.issue_list_sort_date(candidate, status_bucket, effective_sort_name)
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
        then app_private.issue_list_sort_date(candidate, status_bucket, effective_sort_name)
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

create or replace function app_api.backend_list_user_issues_snapshot(
  actor_uid text,
  actor_is_admin boolean,
  status_bucket text,
  sort_name text,
  page_size integer,
  cursor_id uuid,
  cursor_created_at timestamptz,
  cursor_sort_date timestamptz,
  cursor_sort_number integer,
  title_query text
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'app_private', 'app_api', 'public'
as $$
declare
  private_to_owner_categories text[];
  review_required_categories text[];
  author_private_categories text[];
  result jsonb;
  content_version bigint;
  status_counts jsonb := '{}'::jsonb;
begin
  select
    coalesce(array_agg(id) filter (where read_access = 'owner-admin'), array[]::text[]),
    coalesce(array_agg(id) filter (where read_access = 'reviewed-school'), array[]::text[]),
    coalesce(array_agg(id) filter (where not author_visible), array[]::text[])
  into private_to_owner_categories, review_required_categories, author_private_categories
  from app_private.issue_categories;

  if cursor_id is null then
    select coalesce(jsonb_object_agg(grouped.status, grouped.total), '{}'::jsonb)
    into status_counts
    from (
      select status, count(*)::integer as total
      from app_private.issues
      where author_uid = backend_list_user_issues_snapshot.actor_uid
      group by status
    ) grouped;
  end if;

  result := app_api.backend_list_user_issues(
    actor_uid, actor_is_admin, status_bucket, sort_name, page_size, cursor_id,
    cursor_created_at, cursor_sort_date, cursor_sort_number,
    private_to_owner_categories, review_required_categories, author_private_categories, title_query
  );
  select version into content_version
  from app_private.content_versions
  where domain = 'issues';
  return coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'statusCounts', status_counts,
    'version', coalesce(content_version, 1)
  );
end;
$$;

REVOKE ALL ON FUNCTION app_api.backend_list_user_issues(text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_api.backend_list_user_issues_snapshot(text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_api.backend_list_user_issues(text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[],text) TO novae_runtime;
GRANT EXECUTE ON FUNCTION app_api.backend_list_user_issues_snapshot(text,boolean,text,text,integer,uuid,timestamptz,timestamptz,integer,text) TO novae_runtime;
