create or replace function app_private.issue_user_sort_date(
  issue_record app_private.issues,
  sort_name text
)
returns timestamptz
language sql
stable
as $$
  select case
    when sort_name = 'ending-soon' then issue_record.support_deadline_at
    when issue_record.status in ('auto-rejected', 'review-rejected', 'infeasible', 'completed') then coalesce(issue_record.closed_at, issue_record.updated_at, issue_record.created_at)
    else issue_record.created_at
  end
$$;

create or replace function app_api.backend_list_user_issues(
  actor_uid text,
  actor_is_admin boolean,
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
  limited_page_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
  query_limit integer := least(greatest(coalesce(page_size, 20), 1), 50) + 1;
  rows_json jsonb := '[]'::jsonb;
  last_issue jsonb;
  issue_record app_private.issues%rowtype;
begin
  for issue_record in
    select *
    from app_private.issues
    where author_uid = actor_uid
      and (
        cursor_id is null
        or case
          when sort_name = 'most-supported' and cursor_sort_number is not null then
            support_count < cursor_sort_number
            or (support_count = cursor_sort_number and app_private.issue_user_sort_date(issue_record, sort_name) < cursor_sort_date)
            or (support_count = cursor_sort_number and app_private.issue_user_sort_date(issue_record, sort_name) = cursor_sort_date and id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is not null then
            support_deadline_at > cursor_sort_date
            or (support_deadline_at = cursor_sort_date and created_at < cursor_created_at)
            or (support_deadline_at = cursor_sort_date and created_at = cursor_created_at and id < cursor_id)
          when sort_name = 'ending-soon' and cursor_sort_date is null then
            support_deadline_at is null
            and (created_at < cursor_created_at or (created_at = cursor_created_at and id < cursor_id))
          else
            app_private.issue_user_sort_date(issue_record, sort_name) < cursor_sort_date
            or (app_private.issue_user_sort_date(issue_record, sort_name) = cursor_sort_date and id < cursor_id)
        end
      )
    order by
      case when sort_name = 'most-supported' then support_count end desc,
      case when sort_name = 'ending-soon' then support_deadline_at end asc nulls last,
      case when sort_name = 'ending-soon' then created_at end desc,
      case when sort_name <> 'ending-soon' then app_private.issue_user_sort_date(issue_record, sort_name) end desc,
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
    'cursor', case
      when jsonb_array_length(rows_json) > limited_page_size and last_issue is not null then
        jsonb_build_object(
          'id', last_issue ->> 'id',
          'created_at', last_issue -> 'created_at_ms',
          'sort_date', case
            when sort_name = 'ending-soon' then last_issue -> 'support_deadline_at_ms'
            when (last_issue ->> 'status') in ('auto-rejected', 'review-rejected', 'infeasible', 'completed') then coalesce(last_issue -> 'closed_at_ms', last_issue -> 'updated_at_ms', last_issue -> 'created_at_ms')
            else last_issue -> 'created_at_ms'
          end,
          'sort_number', case when sort_name = 'most-supported' then last_issue -> 'support_count' else null end
        )
      else null
    end
  );
end;
$$;

revoke all on function app_api.backend_list_user_issues(text,boolean,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[]) from public, anon, authenticated;
grant execute on function app_api.backend_list_user_issues(text,boolean,text,integer,uuid,timestamptz,timestamptz,integer,text[],text[],text[]) to service_role;
